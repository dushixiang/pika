package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/repo"
	"github.com/dushixiang/pika/internal/vmclient"

	"github.com/go-orz/cache"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// MetricDataPoint 统一的指标数据点结构
type MetricDataPoint struct {
	Timestamp int64   `json:"timestamp"` // 毫秒时间戳
	Value     float64 `json:"value"`
}

// MetricSeries 指标系列（支持多系列，如多网卡、多传感器）
type MetricSeries struct {
	Name   string            `json:"name"`             // 系列名称
	Labels map[string]string `json:"labels,omitempty"` // 额外标签
	Data   []MetricDataPoint `json:"data"`             // 数据点列表
}

// GetMetricsResponse 统一的查询响应格式
type GetMetricsResponse struct {
	AgentID string         `json:"agentId"`
	Type    string         `json:"type"`
	Range   string         `json:"range"`
	Series  []MetricSeries `json:"series"`
}

// QueryDefinition 查询定义（用于构建多个查询）
type QueryDefinition struct {
	Name   string            // 系列名称
	Query  string            // PromQL 查询语句
	Labels map[string]string // 额外标签
}

// MetricService 指标服务
type MetricService struct {
	logger          *zap.Logger
	metricRepo      *repo.MetricRepo
	propertyService *PropertyService
	trafficService  *TrafficService // 流量统计服务
	vmClient        *vmclient.VMClient

	latestCache cache.Cache[string, *LatestMetrics]
}

// NewMetricService 创建指标服务
func NewMetricService(logger *zap.Logger, db *gorm.DB, propertyService *PropertyService, trafficService *TrafficService, vmClient *vmclient.VMClient) *MetricService {
	return &MetricService{
		logger:          logger,
		metricRepo:      repo.NewMetricRepo(db),
		propertyService: propertyService,
		trafficService:  trafficService,
		vmClient:        vmClient,
		latestCache:     cache.New[string, *LatestMetrics](time.Minute),
	}
}

// HandleMetricData 处理指标数据
func (s *MetricService) HandleMetricData(ctx context.Context, agentID string, metricType string, data json.RawMessage) error {
	now := time.Now().UnixMilli()

	// 更新内存缓存
	latestMetrics, ok := s.latestCache.Get(agentID)
	if !ok {
		latestMetrics = &LatestMetrics{}
		s.latestCache.Set(agentID, latestMetrics, time.Hour)
	}

	// 解析数据并写入 VictoriaMetrics
	switch protocol.MetricType(metricType) {
	case protocol.MetricTypeCPU:
		var cpuData protocol.CPUData
		if err := json.Unmarshal(data, &cpuData); err != nil {
			return err
		}
		metric := &CPUMetric{
			AgentID:       agentID,
			UsagePercent:  cpuData.UsagePercent,
			LogicalCores:  cpuData.LogicalCores,
			PhysicalCores: cpuData.PhysicalCores,
			ModelName:     cpuData.ModelName,
			Timestamp:     now,
		}
		latestMetrics.CPU = metric
		metrics := s.convertToMetrics(agentID, metricType, &cpuData, now)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeMemory:
		var memData protocol.MemoryData
		if err := json.Unmarshal(data, &memData); err != nil {
			return err
		}
		metric := &MemoryMetric{
			AgentID:      agentID,
			Total:        memData.Total,
			Used:         memData.Used,
			Free:         memData.Free,
			Available:    memData.Available,
			UsagePercent: memData.UsagePercent,
			SwapTotal:    memData.SwapTotal,
			SwapUsed:     memData.SwapUsed,
			SwapFree:     memData.SwapFree,
			Timestamp:    now,
		}
		latestMetrics.Memory = metric
		metrics := s.convertToMetrics(agentID, metricType, &memData, now)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeDisk:
		var diskDataList []protocol.DiskData
		if err := json.Unmarshal(data, &diskDataList); err != nil {
			return err
		}
		// 计算汇总数据用于缓存
		var totalTotal, totalUsed, totalFree uint64
		for _, diskData := range diskDataList {
			totalTotal += diskData.Total
			totalUsed += diskData.Used
			totalFree += diskData.Free
		}
		var usagePercent float64
		if totalTotal > 0 {
			usagePercent = float64(totalUsed) / float64(totalTotal) * 100
		}
		latestMetrics.Disk = &DiskSummary{
			UsagePercent: usagePercent,
			TotalDisks:   len(diskDataList),
			Total:        totalTotal,
			Used:         totalUsed,
			Free:         totalFree,
		}
		metrics := s.convertToMetrics(agentID, metricType, diskDataList, now)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeNetwork:
		var networkDataList []protocol.NetworkData
		if err := json.Unmarshal(data, &networkDataList); err != nil {
			return err
		}
		// 计算汇总数据用于缓存
		var totalSentRate, totalRecvRate uint64
		var totalSentTotal, totalRecvTotal uint64
		for _, netData := range networkDataList {
			totalSentRate += netData.BytesSentRate
			totalRecvRate += netData.BytesRecvRate
			totalSentTotal += netData.BytesSentTotal
			totalRecvTotal += netData.BytesRecvTotal
		}
		latestMetrics.Network = &NetworkSummary{
			TotalBytesSentRate:  totalSentRate,
			TotalBytesRecvRate:  totalRecvRate,
			TotalBytesSentTotal: totalSentTotal,
			TotalBytesRecvTotal: totalRecvTotal,
			TotalInterfaces:     len(networkDataList),
		}
		// 更新流量统计
		if err := s.trafficService.UpdateAgentTraffic(ctx, agentID, totalRecvTotal); err != nil {
			s.logger.Error("更新探针流量统计失败",
				zap.String("agentId", agentID),
				zap.Error(err))
		}
		metrics := s.convertToMetrics(agentID, metricType, networkDataList, now)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeNetworkConnection:
		var connData protocol.NetworkConnectionData
		if err := json.Unmarshal(data, &connData); err != nil {
			return err
		}
		metric := &NetworkConnectionMetric{
			AgentID:     agentID,
			Established: connData.Established,
			SynSent:     connData.SynSent,
			SynRecv:     connData.SynRecv,
			FinWait1:    connData.FinWait1,
			FinWait2:    connData.FinWait2,
			TimeWait:    connData.TimeWait,
			Close:       connData.Close,
			CloseWait:   connData.CloseWait,
			LastAck:     connData.LastAck,
			Listen:      connData.Listen,
			Closing:     connData.Closing,
			Total:       connData.Total,
			Timestamp:   now,
		}
		latestMetrics.NetworkConnection = metric
		metrics := s.convertToMetrics(agentID, metricType, &connData, now)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeDiskIO:
		var diskIODataList []*protocol.DiskIOData
		if err := json.Unmarshal(data, &diskIODataList); err != nil {
			return err
		}
		metrics := s.convertToMetrics(agentID, metricType, diskIODataList, now)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeHost:
		var hostData protocol.HostInfoData
		if err := json.Unmarshal(data, &hostData); err != nil {
			return err
		}
		// Host 信息仍然保存到 PostgreSQL（静态信息，不频繁变化）
		metric := &models.HostMetric{
			AgentID:         agentID,
			OS:              hostData.OS,
			Platform:        hostData.Platform,
			PlatformVersion: hostData.PlatformVersion,
			KernelVersion:   hostData.KernelVersion,
			KernelArch:      hostData.KernelArch,
			Uptime:          hostData.Uptime,
			BootTime:        hostData.BootTime,
			Procs:           hostData.Procs,
			Timestamp:       now,
		}
		latestMetrics.Host = metric
		return s.metricRepo.SaveHostMetric(ctx, metric)

	case protocol.MetricTypeGPU:
		var gpuDataList []protocol.GPUData
		if err := json.Unmarshal(data, &gpuDataList); err != nil {
			return err
		}
		// 更新缓存
		var gpuMetrics []GPUMetric
		for _, gpuData := range gpuDataList {
			gpuMetrics = append(gpuMetrics, GPUMetric{
				AgentID:          agentID,
				Index:            gpuData.Index,
				Name:             gpuData.Name,
				Utilization:      gpuData.Utilization,
				MemoryTotal:      gpuData.MemoryTotal,
				MemoryUsed:       gpuData.MemoryUsed,
				MemoryFree:       gpuData.MemoryFree,
				Temperature:      gpuData.Temperature,
				PowerDraw:        gpuData.PowerUsage,
				FanSpeed:         gpuData.FanSpeed,
				PerformanceState: "",
				Timestamp:        now,
			})
		}
		latestMetrics.GPU = gpuMetrics
		metrics := s.convertToMetrics(agentID, metricType, gpuDataList, now)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeTemperature:
		var tempDataList []protocol.TemperatureData
		if err := json.Unmarshal(data, &tempDataList); err != nil {
			return err
		}
		// 更新缓存
		var tempMetrics []TemperatureMetric
		for _, tempData := range tempDataList {
			sensorLabel := tempData.Type
			if sensorLabel == "" {
				sensorLabel = tempData.SensorKey
			}
			tempMetrics = append(tempMetrics, TemperatureMetric{
				AgentID:     agentID,
				SensorKey:   tempData.SensorKey,
				SensorLabel: sensorLabel,
				Temperature: tempData.Temperature,
				Timestamp:   now,
			})
		}
		latestMetrics.Temp = tempMetrics
		metrics := s.convertToMetrics(agentID, metricType, tempDataList, now)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeMonitor:
		var monitorDataList []protocol.MonitorData
		if err := json.Unmarshal(data, &monitorDataList); err != nil {
			return err
		}
		metrics := s.convertToMetrics(agentID, metricType, monitorDataList, now)
		return s.vmClient.Write(ctx, metrics)

	default:
		s.logger.Warn("unknown metric type", zap.String("type", metricType))
		return nil
	}
}

// GetMetrics 获取聚合指标数据（从 VictoriaMetrics 查询）
// 返回统一的 GetMetricsResponse 格式
func (s *MetricService) GetMetrics(ctx context.Context, agentID, metricType string, start, end int64, interfaceName string) (*GetMetricsResponse, error) {
	// 构造 PromQL 查询（返回多个查询以支持多系列）
	queries := s.buildPromQLQueries(agentID, metricType, interfaceName)
	if len(queries) == 0 {
		return nil, fmt.Errorf("unsupported metric type: %s", metricType)
	}

	// 执行查询并转换结果
	// step 设为 0，让 VictoriaMetrics 自动选择合适的步长
	var series []MetricSeries

	for _, q := range queries {
		result, err := s.vmClient.QueryRange(ctx, q.Query,
			time.UnixMilli(start),
			time.UnixMilli(end),
			0)
		if err != nil {
			s.logger.Error("查询 VictoriaMetrics 失败",
				zap.String("query", q.Query),
				zap.Error(err))
			continue // 跳过失败的查询，继续处理其他查询
		}

		// 转换查询结果为 MetricSeries
		convertedSeries := s.convertQueryResultToSeries(result, q.Name, q.Labels)
		series = append(series, convertedSeries...)
	}

	return &GetMetricsResponse{
		AgentID: agentID,
		Type:    metricType,
		Range:   fmt.Sprintf("%d-%d", start, end),
		Series:  series,
	}, nil
}

// alignTimeRangeToBucket 将时间范围对齐到桶边界，确保不同时间框架的桶数一致
func alignTimeRangeToBucket(start, end int64, bucketMs int64) (int64, int64) {
	if bucketMs <= 0 {
		return start, end
	}
	alignedStart := (start / bucketMs) * bucketMs
	endBucket := ((end - 1) / bucketMs) * bucketMs
	alignedEnd := endBucket + bucketMs - 1
	if alignedEnd < alignedStart {
		alignedEnd = alignedStart
	}
	return alignedStart, alignedEnd
}

// GetLatestMetrics 获取最新指标
func (s *MetricService) GetLatestMetrics(ctx context.Context, agentID string) (*LatestMetrics, error) {
	metrics, _ := s.latestCache.Get(agentID)
	return metrics, nil
}

// DeleteAgentMetrics 删除探针的所有指标数据
func (s *MetricService) DeleteAgentMetrics(ctx context.Context, agentID string) error {
	// 1. 删除 PostgreSQL 中的主机信息
	if err := s.metricRepo.DeleteAgentMetrics(ctx, agentID); err != nil {
		s.logger.Error("删除 PostgreSQL 中的探针数据失败",
			zap.String("agentID", agentID),
			zap.Error(err))
		// 继续删除 VictoriaMetrics 中的数据
	}

	// 2. 删除 VictoriaMetrics 中的时间序列数据
	match := []string{fmt.Sprintf(`pika_.*{agent_id="%s"}`, agentID)}
	if err := s.vmClient.DeleteSeries(ctx, match); err != nil {
		s.logger.Error("删除 VictoriaMetrics 中的探针数据失败",
			zap.String("agentID", agentID),
			zap.Error(err))
		return err
	}

	s.logger.Info("成功删除探针的所有指标数据",
		zap.String("agentID", agentID))
	return nil
}

// DeleteMonitorMetrics 删除指定监控任务的所有指标数据
func (s *MetricService) DeleteMonitorMetrics(ctx context.Context, monitorID string) error {
	// 删除 VictoriaMetrics 中的监控指标数据
	match := []string{fmt.Sprintf(`pika_monitor_.*{monitor_id="%s"}`, monitorID)}
	if err := s.vmClient.DeleteSeries(ctx, match); err != nil {
		s.logger.Error("删除 VictoriaMetrics 中的监控数据失败",
			zap.String("monitorID", monitorID),
			zap.Error(err))
		return err
	}

	s.logger.Info("成功删除监控任务的所有指标数据",
		zap.String("monitorID", monitorID))
	return nil
}

// GetAvailableNetworkInterfaces 获取探针的可用网卡列表（从 VictoriaMetrics 查询）
func (s *MetricService) GetAvailableNetworkInterfaces(ctx context.Context, agentID string) ([]string, error) {
	// 查询 interface label 的所有值，排除空字符串（汇总数据）
	match := []string{fmt.Sprintf(`pika_network_sent_bytes_rate{agent_id="%s"}`, agentID)}
	allInterfaces, err := s.vmClient.GetLabelValues(ctx, "interface", match)
	if err != nil {
		s.logger.Error("查询网卡列表失败",
			zap.String("agentID", agentID),
			zap.Error(err))
		return []string{}, nil // 返回空列表而不是错误
	}

	// 过滤掉空字符串（汇总数据）
	interfaces := make([]string, 0, len(allInterfaces))
	for _, iface := range allInterfaces {
		if iface != "" {
			interfaces = append(interfaces, iface)
		}
	}

	return interfaces, nil
}

// ===== 内存缓存使用的本地模型定义 =====
// 注意：这些模型仅用于内存缓存，不再保存到 PostgreSQL

// CPUMetric CPU指标（内存缓存）
type CPUMetric struct {
	AgentID       string  `json:"agentId"`
	UsagePercent  float64 `json:"usagePercent"`
	LogicalCores  int     `json:"logicalCores"`
	PhysicalCores int     `json:"physicalCores"`
	ModelName     string  `json:"modelName"`
	Timestamp     int64   `json:"timestamp"`
}

// MemoryMetric 内存指标（内存缓存）
type MemoryMetric struct {
	AgentID      string  `json:"agentId"`
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Free         uint64  `json:"free"`
	Available    uint64  `json:"available"`
	UsagePercent float64 `json:"usagePercent"`
	SwapTotal    uint64  `json:"swapTotal"`
	SwapUsed     uint64  `json:"swapUsed"`
	SwapFree     uint64  `json:"swapFree"`
	Timestamp    int64   `json:"timestamp"`
}

// NetworkConnectionMetric 网络连接统计指标（内存缓存）
type NetworkConnectionMetric struct {
	AgentID     string `json:"agentId"`
	Established uint32 `json:"established"`
	SynSent     uint32 `json:"synSent"`
	SynRecv     uint32 `json:"synRecv"`
	FinWait1    uint32 `json:"finWait1"`
	FinWait2    uint32 `json:"finWait2"`
	TimeWait    uint32 `json:"timeWait"`
	Close       uint32 `json:"close"`
	CloseWait   uint32 `json:"closeWait"`
	LastAck     uint32 `json:"lastAck"`
	Listen      uint32 `json:"listen"`
	Closing     uint32 `json:"closing"`
	Total       uint32 `json:"total"`
	Timestamp   int64  `json:"timestamp"`
}

// GPUMetric GPU指标（内存缓存）
type GPUMetric struct {
	AgentID          string  `json:"agentId"`
	Index            int     `json:"index"`
	Name             string  `json:"name"`
	Utilization      float64 `json:"utilization"`
	MemoryTotal      uint64  `json:"memoryTotal"`
	MemoryUsed       uint64  `json:"memoryUsed"`
	MemoryFree       uint64  `json:"memoryFree"`
	Temperature      float64 `json:"temperature"`
	PowerDraw        float64 `json:"powerDraw"`
	FanSpeed         float64 `json:"fanSpeed"`
	PerformanceState string  `json:"performanceState"`
	Timestamp        int64   `json:"timestamp"`
}

// TemperatureMetric 温度指标（内存缓存）
type TemperatureMetric struct {
	AgentID     string  `json:"agentId"`
	SensorKey   string  `json:"sensorKey"`
	SensorLabel string  `json:"sensorLabel"`
	Temperature float64 `json:"temperature"`
	Timestamp   int64   `json:"timestamp"`
}

// MonitorMetric 监控指标
type MonitorMetric struct {
	ID             uint   `json:"id"`
	AgentId        string `json:"agentId"`
	MonitorId      string `json:"monitorId"`
	Type           string `json:"type"`
	Target         string `json:"target"`
	Status         string `json:"status"`
	StatusCode     int    `json:"statusCode"`
	ResponseTime   int64  `json:"responseTime"`
	Error          string `json:"error"`
	Message        string `json:"message"`
	ContentMatch   bool   `json:"contentMatch"`
	CertExpiryTime int64  `json:"certExpiryTime"`
	CertDaysLeft   int    `json:"certDaysLeft"`
	Timestamp      int64  `json:"timestamp"`
}

// DiskSummary 磁盘汇总数据
type DiskSummary struct {
	UsagePercent float64 `json:"usagePercent"` // 平均使用率
	TotalDisks   int     `json:"totalDisks"`   // 磁盘数量
	Total        uint64  `json:"total"`        // 总容量(字节)
	Used         uint64  `json:"used"`         // 已使用(字节)
	Free         uint64  `json:"free"`         // 空闲(字节)
}

// NetworkSummary 网络汇总数据
type NetworkSummary struct {
	TotalBytesSentRate  uint64 `json:"totalBytesSentRate"`  // 总发送速率(字节/秒)
	TotalBytesRecvRate  uint64 `json:"totalBytesRecvRate"`  // 总接收速率(字节/秒)
	TotalBytesSentTotal uint64 `json:"totalBytesSentTotal"` // 累计总发送流量
	TotalBytesRecvTotal uint64 `json:"totalBytesRecvTotal"` // 累计总接收流量
	TotalInterfaces     int    `json:"totalInterfaces"`     // 网卡数量
}

// LatestMetrics 最新指标数据（用于API响应）
type LatestMetrics struct {
	CPU               *CPUMetric               `json:"cpu,omitempty"`
	Memory            *MemoryMetric            `json:"memory,omitempty"`
	Disk              *DiskSummary             `json:"disk,omitempty"`
	Network           *NetworkSummary          `json:"network,omitempty"`
	NetworkConnection *NetworkConnectionMetric `json:"networkConnection,omitempty"`
	Host              *models.HostMetric       `json:"host,omitempty"`
	GPU               []GPUMetric              `json:"gpu,omitempty"`
	Temp              []TemperatureMetric      `json:"temperature,omitempty"`
}

// buildPromQLQueries 构造 PromQL 查询列表（支持多系列）
func (s *MetricService) buildPromQLQueries(agentID, metricType string, interfaceName string) []QueryDefinition {
	var queries []QueryDefinition

	switch metricType {
	case "cpu":
		queries = []QueryDefinition{{
			Name:  "usage",
			Query: fmt.Sprintf(`pika_cpu_usage_percent{agent_id="%s"}`, agentID),
		}}

	case "memory":
		queries = []QueryDefinition{{
			Name:  "usage",
			Query: fmt.Sprintf(`pika_memory_usage_percent{agent_id="%s"}`, agentID),
		}}

	case "disk":
		queries = []QueryDefinition{{
			Name:  "usage",
			Query: fmt.Sprintf(`pika_disk_usage_percent{agent_id="%s",mount_point=""}`, agentID),
		}}

	case "network":
		// 网络流量：上行和下行
		if interfaceName != "" && interfaceName != "all" {
			// 指定网卡
			queries = []QueryDefinition{
				{
					Name:   "upload",
					Query:  fmt.Sprintf(`pika_network_sent_bytes_rate{agent_id="%s",interface="%s"}`, agentID, interfaceName),
					Labels: map[string]string{"interface": interfaceName},
				},
				{
					Name:   "download",
					Query:  fmt.Sprintf(`pika_network_recv_bytes_rate{agent_id="%s",interface="%s"}`, agentID, interfaceName),
					Labels: map[string]string{"interface": interfaceName},
				},
			}
		} else {
			// 所有网卡汇总
			queries = []QueryDefinition{
				{
					Name:  "upload",
					Query: fmt.Sprintf(`sum(pika_network_sent_bytes_rate{agent_id="%s"}) by (agent_id)`, agentID),
				},
				{
					Name:  "download",
					Query: fmt.Sprintf(`sum(pika_network_recv_bytes_rate{agent_id="%s"}) by (agent_id)`, agentID),
				},
			}
		}

	case "network_connection":
		// 网络连接统计：多个状态
		queries = []QueryDefinition{
			{Name: "established", Query: fmt.Sprintf(`pika_network_conn_established{agent_id="%s"}`, agentID)},
			{Name: "time_wait", Query: fmt.Sprintf(`pika_network_conn_time_wait{agent_id="%s"}`, agentID)},
			{Name: "close_wait", Query: fmt.Sprintf(`pika_network_conn_close_wait{agent_id="%s"}`, agentID)},
			{Name: "listen", Query: fmt.Sprintf(`pika_network_conn_total{agent_id="%s"}`, agentID)},
		}

	case "disk_io":
		// 磁盘 IO：读和写
		queries = []QueryDefinition{
			{Name: "read", Query: fmt.Sprintf(`pika_disk_read_bytes_rate{agent_id="%s"}`, agentID)},
			{Name: "write", Query: fmt.Sprintf(`pika_disk_write_bytes_rate{agent_id="%s"}`, agentID)},
		}

	case "gpu":
		// GPU：利用率和温度（按 GPU 分组）
		queries = []QueryDefinition{
			{
				Name:  "utilization",
				Query: fmt.Sprintf(`pika_gpu_utilization_percent{agent_id="%s"}`, agentID),
			},
			{
				Name:  "temperature",
				Query: fmt.Sprintf(`pika_gpu_temperature_celsius{agent_id="%s"}`, agentID),
			},
		}

	case "temperature":
		// 温度：按传感器类型分组
		queries = []QueryDefinition{{
			Name:  "temperature",
			Query: fmt.Sprintf(`pika_temperature_celsius{agent_id="%s"}`, agentID),
		}}
	}

	return queries
}

// convertQueryResultToSeries 将 VictoriaMetrics 查询结果转换为 MetricSeries
func (s *MetricService) convertQueryResultToSeries(result *vmclient.QueryResult, seriesName string, extraLabels map[string]string) []MetricSeries {
	if result == nil || len(result.Data.Result) == 0 {
		return []MetricSeries{}
	}

	var allSeries []MetricSeries

	// 遍历所有时间序列
	for _, timeSeries := range result.Data.Result {
		// 提取数据点
		var dataPoints []MetricDataPoint
		for _, valueArray := range timeSeries.Values {
			if len(valueArray) != 2 {
				continue
			}

			// valueArray: [timestamp(float64), value(string)]
			timestamp, ok := valueArray[0].(float64)
			if !ok {
				continue
			}
			valueStr, ok := valueArray[1].(string)
			if !ok {
				continue
			}

			value, _ := strconv.ParseFloat(valueStr, 64)
			dataPoints = append(dataPoints, MetricDataPoint{
				Timestamp: int64(timestamp * 1000), // 转换为毫秒
				Value:     value,
			})
		}

		// 合并标签
		labels := make(map[string]string)
		for k, v := range timeSeries.Metric {
			// 只排除 __name__ 内部标签，保留 agent_id（监控功能需要用它来区分探针）
			if k != "__name__" {
				labels[k] = v
			}
		}
		// 添加额外标签
		for k, v := range extraLabels {
			labels[k] = v
		}

		// 构建系列名称（如果有特定标签如 GPU index 或 sensor_label，添加到名称中）
		finalName := seriesName
		if sensorLabel, ok := labels["sensor_label"]; ok {
			finalName = sensorLabel
			delete(labels, "sensor_label") // 已合并到名称中，从标签中删除
		} else if gpuIndex, ok := labels["gpu_index"]; ok {
			finalName = fmt.Sprintf("GPU_%s", gpuIndex)
			delete(labels, "gpu_index")
		}

		allSeries = append(allSeries, MetricSeries{
			Name:   finalName,
			Labels: labels,
			Data:   dataPoints,
		})
	}

	return allSeries
}

// ===== 监控查询相关 =====

// 监控查询类型常量
const (
	MonitorQueryTypeCurrent  = "current"   // 当前状态
	MonitorQueryTypeStats24h = "stats_24h" // 24小时统计
	MonitorQueryTypeStats7d  = "stats_7d"  // 7天统计
	MonitorQueryTypeHistory  = "history"   // 历史趋势
)

// MonitorStatsResult 监控统计结果（所有探针的聚合数据）
type MonitorStatsResult struct {
	Status         string `json:"status"`                   // 聚合状态（up/down/unknown）
	ResponseTime   int64  `json:"responseTime"`             // 当前平均响应时间(ms)
	CertExpiryDate int64  `json:"certExpiryDate,omitempty"` // 最早过期的证书时间(毫秒时间戳)
	CertExpiryDays int    `json:"certExpiryDays,omitempty"` // 证书剩余天数
	AgentCount     int    `json:"agentCount"`               // 探针数量
	LastCheckTime  int64  `json:"lastCheckTime"`            // 最后检测时间(毫秒时间戳)
}

// AgentMonitorStat 单个探针的监控统计
type AgentMonitorStat struct {
	AgentID        string `json:"agentID,omitempty"`
	Status         string `json:"status,omitempty"`         // up/down/unknown
	ResponseTime   int64  `json:"responseTime,omitempty"`   // 当前响应时间(ms)
	LastCheckTime  int64  `json:"lastCheckTime,omitempty"`  // 最后检测时间(毫秒时间戳)
	CertExpiryDate int64  `json:"certExpiryDate,omitempty"` // 证书过期时间(毫秒时间戳)
	CertExpiryDays int    `json:"certExpiryDays,omitempty"` // 证书剩余天数
}

// buildMonitorPromQLQueries 构建监控查询的 PromQL 语句（简化版：只查询当前状态）
func (s *MetricService) buildMonitorPromQLQueries(monitorID string, queryType string) []QueryDefinition {
	var queries []QueryDefinition

	switch queryType {
	case MonitorQueryTypeCurrent:
		// 当前状态查询（即时查询）- 简化为只查询必要的指标
		queries = []QueryDefinition{
			{Name: "response_time", Query: fmt.Sprintf(`pika_monitor_response_time_ms{monitor_id="%s"}`, monitorID)},
			{Name: "status", Query: fmt.Sprintf(`pika_monitor_status{monitor_id="%s"}`, monitorID)},
			{Name: "cert_days", Query: fmt.Sprintf(`pika_monitor_cert_days_left{monitor_id="%s"}`, monitorID)},
			{Name: "cert_expiry", Query: fmt.Sprintf(`pika_monitor_cert_expiry_timestamp_ms{monitor_id="%s"}`, monitorID)},
		}

	case MonitorQueryTypeHistory:
		// 历史趋势查询（范围查询）
		queries = []QueryDefinition{
			{Name: "response_time", Query: fmt.Sprintf(`pika_monitor_response_time_ms{monitor_id="%s"}`, monitorID)},
		}
	}

	return queries
}

// GetMonitorStats 获取监控任务的聚合统计数据（简化版：只查询当前状态）
func (s *MetricService) GetMonitorStats(ctx context.Context, monitorID string) (*MonitorStatsResult, error) {
	result := &MonitorStatsResult{
		Status: "unknown",
	}

	// 查询当前状态（只需4个查询）
	queries := s.buildMonitorPromQLQueries(monitorID, MonitorQueryTypeCurrent)
	queryData := make(map[string]*vmclient.QueryResult)
	for _, q := range queries {
		queryResult, err := s.vmClient.Query(ctx, q.Query)
		if err != nil {
			s.logger.Warn("查询监控状态失败", zap.String("query", q.Name), zap.Error(err))
			continue
		}
		queryData[q.Name] = queryResult
	}

	// 聚合各探针的数据
	agentStats := make(map[string]*AgentMonitorStat)

	// 处理响应时间
	if respResult, ok := queryData["response_time"]; ok && respResult != nil {
		for _, ts := range respResult.Data.Result {
			agentID := ts.Metric["agent_id"]
			if agentID == "" {
				continue
			}
			if _, exists := agentStats[agentID]; !exists {
				agentStats[agentID] = &AgentMonitorStat{AgentID: agentID}
			}

			if len(ts.Values) > 0 {
				lastValue := ts.Values[len(ts.Values)-1]
				if len(lastValue) >= 2 {
					timestamp, _ := lastValue[0].(float64)
					valueStr, _ := lastValue[1].(string)
					var value float64
					fmt.Sscanf(valueStr, "%f", &value)
					agentStats[agentID].ResponseTime = int64(value)
					agentStats[agentID].LastCheckTime = int64(timestamp * 1000)
				}
			}
		}
	}

	// 处理状态
	if statusResult, ok := queryData["status"]; ok && statusResult != nil {
		for _, ts := range statusResult.Data.Result {
			agentID := ts.Metric["agent_id"]
			status := ts.Metric["status"]
			if agentID == "" {
				continue
			}
			if _, exists := agentStats[agentID]; !exists {
				agentStats[agentID] = &AgentMonitorStat{AgentID: agentID}
			}

			if len(ts.Values) > 0 {
				if status != "" {
					agentStats[agentID].Status = status
				}
			}
		}
	}

	// 处理证书信息
	if certDaysResult, ok := queryData["cert_days"]; ok && certDaysResult != nil {
		for _, ts := range certDaysResult.Data.Result {
			agentID := ts.Metric["agent_id"]
			if agentID == "" {
				continue
			}
			if _, exists := agentStats[agentID]; !exists {
				agentStats[agentID] = &AgentMonitorStat{AgentID: agentID}
			}

			if len(ts.Values) > 0 {
				lastValue := ts.Values[len(ts.Values)-1]
				if len(lastValue) >= 2 {
					valueStr, _ := lastValue[1].(string)
					var value float64
					fmt.Sscanf(valueStr, "%f", &value)
					agentStats[agentID].CertExpiryDays = int(value)
				}
			}
		}
	}

	if certExpiryResult, ok := queryData["cert_expiry"]; ok && certExpiryResult != nil {
		for _, ts := range certExpiryResult.Data.Result {
			agentID := ts.Metric["agent_id"]
			if agentID == "" {
				continue
			}
			if _, exists := agentStats[agentID]; !exists {
				agentStats[agentID] = &AgentMonitorStat{AgentID: agentID}
			}

			if len(ts.Values) > 0 {
				lastValue := ts.Values[len(ts.Values)-1]
				if len(lastValue) >= 2 {
					valueStr, _ := lastValue[1].(string)
					var value float64
					fmt.Sscanf(valueStr, "%f", &value)
					agentStats[agentID].CertExpiryDate = int64(value)
				}
			}
		}
	}

	// 聚合所有探针的数据
	if len(agentStats) == 0 {
		return result, nil
	}

	var totalResponseTime int64
	var lastCheckTime int64
	hasUp := false
	hasDown := false
	hasCert := false
	var minCertExpiryDate int64
	var minCertExpiryDays int

	for _, stat := range agentStats {
		totalResponseTime += stat.ResponseTime

		if stat.LastCheckTime > lastCheckTime {
			lastCheckTime = stat.LastCheckTime
		}

		if stat.Status == "up" {
			hasUp = true
		} else if stat.Status == "down" {
			hasDown = true
		}

		if stat.CertExpiryDate > 0 {
			if !hasCert || stat.CertExpiryDate < minCertExpiryDate {
				minCertExpiryDate = stat.CertExpiryDate
				minCertExpiryDays = stat.CertExpiryDays
				hasCert = true
			}
		}
	}

	count := len(agentStats)
	result.AgentCount = count
	if count > 0 {
		result.ResponseTime = totalResponseTime / int64(count)
	}
	result.LastCheckTime = lastCheckTime

	// 聚合状态：只要有一个探针 up，整体就是 up
	if hasUp {
		result.Status = "up"
	} else if hasDown {
		result.Status = "down"
	}

	if hasCert {
		result.CertExpiryDate = minCertExpiryDate
		result.CertExpiryDays = minCertExpiryDays
	}

	return result, nil
}

// GetMonitorAgentStats 获取监控任务各探针的统计数据（简化版：只查询当前状态）
func (s *MetricService) GetMonitorAgentStats(ctx context.Context, monitorID string) ([]AgentMonitorStat, error) {
	// 查询当前状态（只需4个查询）
	queries := s.buildMonitorPromQLQueries(monitorID, MonitorQueryTypeCurrent)
	queryData := make(map[string]*vmclient.QueryResult)
	for _, q := range queries {
		queryResult, err := s.vmClient.Query(ctx, q.Query)
		if err != nil {
			s.logger.Warn("查询监控状态失败", zap.String("query", q.Name), zap.Error(err))
			continue
		}
		queryData[q.Name] = queryResult
	}

	// 提取每个探针的数据
	agentStatsMap := make(map[string]*AgentMonitorStat)

	// 处理响应时间
	if respResult, ok := queryData["response_time"]; ok && respResult != nil {
		for _, ts := range respResult.Data.Result {
			agentID := ts.Metric["agent_id"]
			if agentID == "" {
				continue
			}
			if _, exists := agentStatsMap[agentID]; !exists {
				agentStatsMap[agentID] = &AgentMonitorStat{AgentID: agentID}
			}

			if len(ts.Values) > 0 {
				lastValue := ts.Values[len(ts.Values)-1]
				if len(lastValue) >= 2 {
					timestamp, _ := lastValue[0].(float64)
					valueStr, _ := lastValue[1].(string)
					var value float64
					fmt.Sscanf(valueStr, "%f", &value)
					agentStatsMap[agentID].ResponseTime = int64(value)
					agentStatsMap[agentID].LastCheckTime = int64(timestamp * 1000)
				}
			}
		}
	}

	// 处理状态
	if statusResult, ok := queryData["status"]; ok && statusResult != nil {
		for _, ts := range statusResult.Data.Result {
			agentID := ts.Metric["agent_id"]
			status := ts.Metric["status"]
			if agentID == "" {
				continue
			}
			if _, exists := agentStatsMap[agentID]; !exists {
				agentStatsMap[agentID] = &AgentMonitorStat{AgentID: agentID}
			}

			if len(ts.Values) > 0 {
				if status != "" {
					agentStatsMap[agentID].Status = status
				}
			}
		}
	}

	// 处理证书信息
	if certDaysResult, ok := queryData["cert_days"]; ok && certDaysResult != nil {
		for _, ts := range certDaysResult.Data.Result {
			agentID := ts.Metric["agent_id"]
			if agentID == "" {
				continue
			}
			if _, exists := agentStatsMap[agentID]; !exists {
				agentStatsMap[agentID] = &AgentMonitorStat{AgentID: agentID}
			}

			if len(ts.Values) > 0 {
				lastValue := ts.Values[len(ts.Values)-1]
				if len(lastValue) >= 2 {
					valueStr, _ := lastValue[1].(string)
					var value float64
					fmt.Sscanf(valueStr, "%f", &value)
					agentStatsMap[agentID].CertExpiryDays = int(value)
				}
			}
		}
	}

	if certExpiryResult, ok := queryData["cert_expiry"]; ok && certExpiryResult != nil {
		for _, ts := range certExpiryResult.Data.Result {
			agentID := ts.Metric["agent_id"]
			if agentID == "" {
				continue
			}
			if _, exists := agentStatsMap[agentID]; !exists {
				agentStatsMap[agentID] = &AgentMonitorStat{AgentID: agentID}
			}

			if len(ts.Values) > 0 {
				lastValue := ts.Values[len(ts.Values)-1]
				if len(lastValue) >= 2 {
					valueStr, _ := lastValue[1].(string)
					var value float64
					fmt.Sscanf(valueStr, "%f", &value)
					agentStatsMap[agentID].CertExpiryDate = int64(value)
				}
			}
		}
	}

	// 转换为数组
	result := make([]AgentMonitorStat, 0, len(agentStatsMap))
	for _, stat := range agentStatsMap {
		result = append(result, *stat)
	}

	return result, nil
}

// GetMonitorHistory 获取监控任务的历史趋势数据
func (s *MetricService) GetMonitorHistory(ctx context.Context, monitorID string, start, end int64) (*GetMetricsResponse, error) {
	queries := s.buildMonitorPromQLQueries(monitorID, MonitorQueryTypeHistory)

	var series []MetricSeries
	for _, q := range queries {
		result, err := s.vmClient.QueryRange(
			ctx,
			q.Query,
			time.UnixMilli(start),
			time.UnixMilli(end),
			0, // 自动步长
		)
		if err != nil {
			s.logger.Warn("查询历史趋势失败", zap.String("query", q.Name), zap.Error(err))
			continue
		}
		convertedSeries := s.convertQueryResultToSeries(result, q.Name, q.Labels)
		series = append(series, convertedSeries...)
	}

	return &GetMetricsResponse{
		AgentID: "", // 监控查询不限定单个agent
		Type:    "monitor",
		Range:   fmt.Sprintf("%d-%d", start, end),
		Series:  series,
	}, nil
}

// GetLatestMonitorMetricsByType 获取指定类型的最新监控指标（用于告警检查）
func (s *MetricService) GetLatestMonitorMetricsByType(ctx context.Context, monitorType string) ([]repo.MonitorMetric, error) {
	// 查询最新的监控状态（按 monitor_type 过滤）
	query := fmt.Sprintf(`pika_monitor_status{monitor_type="%s"}`, monitorType)
	result, err := s.vmClient.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query latest monitor metrics failed: %w", err)
	}

	metrics := make([]repo.MonitorMetric, 0)
	for _, ts := range result.Data.Result {
		metric := s.convertToMonitorMetric(ts)
		metrics = append(metrics, metric)
	}

	return metrics, nil
}

// GetAllLatestMonitorMetrics 获取所有最新监控指标（用于告警检查）
func (s *MetricService) GetAllLatestMonitorMetrics(ctx context.Context) ([]repo.MonitorMetric, error) {
	// 查询所有最新的监控状态
	query := `pika_monitor_status`
	result, err := s.vmClient.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query all latest monitor metrics failed: %w", err)
	}

	metrics := make([]repo.MonitorMetric, 0)
	for _, ts := range result.Data.Result {
		metric := s.convertToMonitorMetric(ts)
		metrics = append(metrics, metric)
	}

	return metrics, nil
}

// convertToMonitorMetric 将 VictoriaMetrics 查询结果转换为 MonitorMetric
func (s *MetricService) convertToMonitorMetric(ts vmclient.Result) repo.MonitorMetric {
	metric := repo.MonitorMetric{
		AgentId:   ts.Metric["agent_id"],
		MonitorId: ts.Metric["monitor_id"],
		Type:      ts.Metric["monitor_type"],
		Target:    ts.Metric["target"],
		Status:    ts.Metric["status"],
	}

	// 获取最新值（timestamp 和 status value）
	if len(ts.Values) > 0 {
		lastValue := ts.Values[len(ts.Values)-1]
		if len(lastValue) >= 2 {
			timestamp, _ := lastValue[0].(float64)
			metric.Timestamp = int64(timestamp * 1000) // 转换为毫秒
		}
	}

	// 查询其他相关指标（响应时间、状态码、证书信息等）
	// 这里需要额外的查询来填充完整的 MonitorMetric 数据
	ctx := context.Background()

	// 查询响应时间
	respQuery := fmt.Sprintf(`pika_monitor_response_time_ms{agent_id="%s",monitor_id="%s"}`, metric.AgentId, metric.MonitorId)
	if respResult, err := s.vmClient.Query(ctx, respQuery); err == nil && len(respResult.Data.Result) > 0 {
		ts := respResult.Data.Result[0]
		if len(ts.Values) > 0 {
			lastValue := ts.Values[len(ts.Values)-1]
			if len(lastValue) >= 2 {
				valueStr, _ := lastValue[1].(string)
				var value float64
				fmt.Sscanf(valueStr, "%f", &value)
				metric.ResponseTime = int64(value)
			}
		}
	}

	// 查询状态码
	statusCodeQuery := fmt.Sprintf(`pika_monitor_status_code{agent_id="%s",monitor_id="%s"}`, metric.AgentId, metric.MonitorId)
	if statusCodeResult, err := s.vmClient.Query(ctx, statusCodeQuery); err == nil && len(statusCodeResult.Data.Result) > 0 {
		ts := statusCodeResult.Data.Result[0]
		if len(ts.Values) > 0 {
			lastValue := ts.Values[len(ts.Values)-1]
			if len(lastValue) >= 2 {
				valueStr, _ := lastValue[1].(string)
				var value float64
				fmt.Sscanf(valueStr, "%f", &value)
				metric.StatusCode = int(value)
			}
		}
	}

	// 查询证书信息
	certExpiryQuery := fmt.Sprintf(`pika_monitor_cert_expiry_timestamp_ms{agent_id="%s",monitor_id="%s"}`, metric.AgentId, metric.MonitorId)
	if certResult, err := s.vmClient.Query(ctx, certExpiryQuery); err == nil && len(certResult.Data.Result) > 0 {
		ts := certResult.Data.Result[0]
		if len(ts.Values) > 0 {
			lastValue := ts.Values[len(ts.Values)-1]
			if len(lastValue) >= 2 {
				valueStr, _ := lastValue[1].(string)
				var value float64
				fmt.Sscanf(valueStr, "%f", &value)
				metric.CertExpiryTime = int64(value)
			}
		}
	}

	certDaysQuery := fmt.Sprintf(`pika_monitor_cert_days_left{agent_id="%s",monitor_id="%s"}`, metric.AgentId, metric.MonitorId)
	if certDaysResult, err := s.vmClient.Query(ctx, certDaysQuery); err == nil && len(certDaysResult.Data.Result) > 0 {
		ts := certDaysResult.Data.Result[0]
		if len(ts.Values) > 0 {
			lastValue := ts.Values[len(ts.Values)-1]
			if len(lastValue) >= 2 {
				valueStr, _ := lastValue[1].(string)
				var value float64
				fmt.Sscanf(valueStr, "%f", &value)
				metric.CertDaysLeft = int(value)
			}
		}
	}

	return metric
}
