package service

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strconv"
	"time"

	"github.com/dushixiang/pika/internal/metric"
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/repo"
	"github.com/dushixiang/pika/internal/vmclient"
	"github.com/go-orz/toolkit/syncx"

	"github.com/go-orz/cache"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// MetricService 指标服务
type MetricService struct {
	logger          *zap.Logger
	agentRepo       *repo.AgentRepo
	monitorRepo     *repo.MonitorRepo
	propertyService *PropertyService
	trafficService  *TrafficService // 流量统计服务
	vmClient        *vmclient.VMClient

	latestCache cache.Cache[string, *metric.LatestMetrics] // Agent 最新指标缓存

	monitorLatestCache cache.Cache[string, *metric.LatestMonitorMetrics] // 监控最新指标缓存
}

// NewMetricService 创建指标服务
func NewMetricService(logger *zap.Logger, db *gorm.DB, propertyService *PropertyService, trafficService *TrafficService, vmClient *vmclient.VMClient) *MetricService {
	return &MetricService{
		logger:             logger,
		agentRepo:          repo.NewAgentRepo(db),
		monitorRepo:        repo.NewMonitorRepo(db),
		propertyService:    propertyService,
		trafficService:     trafficService,
		vmClient:           vmClient,
		latestCache:        cache.New[string, *metric.LatestMetrics](time.Minute),
		monitorLatestCache: cache.New[string, *metric.LatestMonitorMetrics](5 * time.Minute), // 监控数据缓存 5 分钟
	}
}

// HandleMetricData 处理指标数据
func (s *MetricService) HandleMetricData(ctx context.Context, agentID string, metricType string, data json.RawMessage, timestamp int64) error {
	if timestamp == 0 {
		timestamp = time.Now().UnixMilli()
	}

	// 更新内存缓存
	latestMetrics, ok := s.latestCache.Get(agentID)
	if !ok {
		latestMetrics = &metric.LatestMetrics{}
		s.latestCache.Set(agentID, latestMetrics, time.Hour)
	}

	// 解析数据并写入 VictoriaMetrics
	switch protocol.MetricType(metricType) {
	case protocol.MetricTypeCPU:
		var cpuData protocol.CPUData
		if err := json.Unmarshal(data, &cpuData); err != nil {
			return err
		}
		latestMetrics.CPU = &cpuData
		metrics := s.convertToMetrics(agentID, metricType, &cpuData, timestamp)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeMemory:
		var memData protocol.MemoryData
		if err := json.Unmarshal(data, &memData); err != nil {
			return err
		}
		latestMetrics.Memory = &memData
		metrics := s.convertToMetrics(agentID, metricType, &memData, timestamp)
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
		latestMetrics.Disk = &metric.DiskSummary{
			UsagePercent: usagePercent,
			TotalDisks:   len(diskDataList),
			Total:        totalTotal,
			Used:         totalUsed,
			Free:         totalFree,
		}
		metrics := s.convertToMetrics(agentID, metricType, diskDataList, timestamp)
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
		latestMetrics.Network = &metric.NetworkSummary{
			TotalBytesSentRate:  totalSentRate,
			TotalBytesRecvRate:  totalRecvRate,
			TotalBytesSentTotal: totalSentTotal,
			TotalBytesRecvTotal: totalRecvTotal,
			TotalInterfaces:     len(networkDataList),
		}
		latestMetrics.NetworkInterfaces = networkDataList
		// 更新流量统计
		if err := s.trafficService.UpdateAgentTraffic(ctx, agentID, totalRecvTotal, totalSentTotal); err != nil {
			s.logger.Error("更新探针流量统计失败",
				zap.String("agentId", agentID),
				zap.Error(err))
		}
		metrics := s.convertToMetrics(agentID, metricType, networkDataList, timestamp)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeNetworkConnection:
		var connData protocol.NetworkConnectionData
		if err := json.Unmarshal(data, &connData); err != nil {
			return err
		}
		latestMetrics.NetworkConnection = &connData
		metrics := s.convertToMetrics(agentID, metricType, &connData, timestamp)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeDiskIO:
		var diskIODataList []*protocol.DiskIOData
		if err := json.Unmarshal(data, &diskIODataList); err != nil {
			return err
		}
		metrics := s.convertToMetrics(agentID, metricType, diskIODataList, timestamp)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeHost:
		var hostData protocol.HostInfoData
		if err := json.Unmarshal(data, &hostData); err != nil {
			return err
		}
		latestMetrics.Host = &hostData
		return nil

	case protocol.MetricTypeGPU:
		var gpuDataList []protocol.GPUData
		if err := json.Unmarshal(data, &gpuDataList); err != nil {
			return err
		}
		// 更新缓存
		latestMetrics.GPU = gpuDataList
		metrics := s.convertToMetrics(agentID, metricType, gpuDataList, timestamp)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeTemperature:
		var tempDataList []protocol.TemperatureData
		if err := json.Unmarshal(data, &tempDataList); err != nil {
			return err
		}
		// 更新缓存
		latestMetrics.Temp = tempDataList
		metrics := s.convertToMetrics(agentID, metricType, tempDataList, timestamp)
		return s.vmClient.Write(ctx, metrics)

	case protocol.MetricTypeMonitor:
		var monitorDataList []protocol.MonitorData
		if err := json.Unmarshal(data, &monitorDataList); err != nil {
			return err
		}
		for i := range monitorDataList {
			monitorDataList[i].AgentId = agentID // 关联探针ID
		}
		// 更新缓存
		latestMetrics.Monitors = monitorDataList
		for _, monitorData := range monitorDataList {
			s.updateMonitorCache(agentID, &monitorData, timestamp)
		}

		metrics := s.convertToMetrics(agentID, metricType, monitorDataList, timestamp)
		return s.vmClient.Write(ctx, metrics)

	default:
		s.logger.Warn("unknown cpiMetric type", zap.String("type", metricType))
		return nil
	}
}

// GetMetrics 获取聚合指标数据（从 VictoriaMetrics 查询）
// 返回统一的 GetMetricsResponse 格式
func (s *MetricService) GetMetrics(ctx context.Context, agentID, metricType string, start, end int64, interfaceName string, aggregation string) (*metric.GetMetricsResponse, error) {
	step := vmclient.AutoStep(time.UnixMilli(start), time.UnixMilli(end))

	// 构造 PromQL 查询（返回多个查询以支持多系列）
	queries := s.buildPromQLQueries(agentID, metricType, interfaceName, aggregation, step)
	if len(queries) == 0 {
		return nil, fmt.Errorf("unsupported metric type: %s", metricType)
	}

	// 执行查询并转换结果
	// step 设为 0，让 VictoriaMetrics 自动选择合适的步长
	var series []metric.Series

	for _, q := range queries {
		result, err := s.vmClient.QueryRange(ctx, q.Query,
			time.UnixMilli(start),
			time.UnixMilli(end),
			step)
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

	// 如果是监控类型，添加监控任务名称到标签中
	if metricType == "monitor" && len(series) > 0 {
		// 收集所有 monitor_id
		monitorIdSet := make(map[string]struct{})
		for _, s := range series {
			if monitorId, ok := s.Labels["monitor_id"]; ok {
				monitorIdSet[monitorId] = struct{}{}
			}
		}

		// 查询 monitor 信息
		if len(monitorIdSet) > 0 {
			monitorIds := make([]string, 0, len(monitorIdSet))
			for monitorId := range monitorIdSet {
				monitorIds = append(monitorIds, monitorId)
			}

			monitors, err := s.monitorRepo.FindByIdIn(ctx, monitorIds)
			if err != nil {
				s.logger.Error("查询 monitor 信息失败", zap.Error(err))
			} else {
				// 构建 monitorId -> monitorName 映射
				monitorNameMap := make(map[string]string)
				for _, monitor := range monitors {
					monitorNameMap[monitor.ID] = monitor.Name
				}

				// 在每个 series 的 labels 中添加 monitor_name
				for i := range series {
					if monitorId, ok := series[i].Labels["monitor_id"]; ok {
						if monitorName, exists := monitorNameMap[monitorId]; exists {
							series[i].Labels["monitor_name"] = monitorName
						}
					}
				}
			}
		}
	}

	return &metric.GetMetricsResponse{
		AgentID: agentID,
		Type:    metricType,
		Range:   fmt.Sprintf("%d-%d", start, end),
		Series:  series,
	}, nil
}

// CleanMonitorCache 清理监控任务缓存中不再关联的探针数据
func (s *MetricService) CleanMonitorCache(ctx context.Context, monitorID string) error {
	// 从缓存读取监控数据
	latestMetrics, ok := s.monitorLatestCache.Get(monitorID)
	if !ok {
		// 缓存不存在，无需清理
		return nil
	}

	// 查询监控任务配置
	monitorTask, err := s.monitorRepo.FindById(ctx, monitorID)
	if err != nil {
		return err
	}

	// 只在有过滤条件（指定了 AgentIds）时清理缓存
	if len(monitorTask.AgentIds) > 0 {
		// 遍历缓存中的探针，移除不再关联的探针数据
		for agentId := range latestMetrics.Agents.Keys() {
			if !slices.Contains(monitorTask.AgentIds, agentId) {
				// 该探针已不再关联到此监控任务，从缓存中移除
				latestMetrics.Agents.Delete(agentId)
				s.logger.Debug("从监控缓存中移除探针",
					zap.String("monitorID", monitorID),
					zap.String("agentID", agentId))
			}
		}
	}

	return nil
}

// updateMonitorCache 更新监控数据缓存
func (s *MetricService) updateMonitorCache(agentID string, monitorData *protocol.MonitorData, timestamp int64) {
	monitorID := monitorData.MonitorId

	// 获取或创建监控缓存
	latestMetrics, ok := s.monitorLatestCache.Get(monitorID)
	if !ok {
		latestMetrics = &metric.LatestMonitorMetrics{
			MonitorID: monitorID,
			Agents:    syncx.NewSafeMap[string, *protocol.MonitorData](),
		}
	}

	// 更新探针数据
	latestMetrics.Agents.Set(agentID, monitorData)
	latestMetrics.UpdatedAt = timestamp

	// 保存到缓存（5分钟过期）
	s.monitorLatestCache.Set(monitorID, latestMetrics, 5*time.Minute)
}

// GetLatestMetrics 获取最新指标
func (s *MetricService) GetLatestMetrics(agentID string) (*metric.LatestMetrics, bool) {
	metrics, ok := s.latestCache.Get(agentID)
	return metrics, ok
}

// DeleteAgentMetrics 删除探针在 VictoriaMetrics 中的历史指标
func (s *MetricService) DeleteAgentMetrics(ctx context.Context, agentID string) error {
	if agentID == "" {
		return fmt.Errorf("agentID 不能为空")
	}

	// 删除内存中的最新指标缓存
	s.latestCache.Delete(agentID)

	// 删除 VictoriaMetrics 中该探针的所有 pika 指标
	matcher := fmt.Sprintf(`{__name__=~"pika_.*",agent_id=%q}`, agentID)
	if err := s.vmClient.DeleteSeries(ctx, []string{matcher}); err != nil {
		s.logger.Error("删除探针 VictoriaMetrics 数据失败",
			zap.String("agentID", agentID),
			zap.Error(err))
		return err
	}

	s.logger.Info("探针 VictoriaMetrics 数据删除成功", zap.String("agentID", agentID))
	return nil
}

// DeleteMonitorMetrics 删除服务监控在 VictoriaMetrics 中的历史指标
func (s *MetricService) DeleteMonitorMetrics(ctx context.Context, monitorID string) error {
	if monitorID == "" {
		return fmt.Errorf("monitorID 不能为空")
	}

	// 删除内存中的监控缓存
	s.monitorLatestCache.Delete(monitorID)

	// 删除 VictoriaMetrics 中该监控任务的所有 pika monitor 指标
	matcher := fmt.Sprintf(`{__name__=~"pika_monitor_.*",monitor_id=%q}`, monitorID)
	if err := s.vmClient.DeleteSeries(ctx, []string{matcher}); err != nil {
		s.logger.Error("删除服务监控 VictoriaMetrics 数据失败",
			zap.String("monitorID", monitorID),
			zap.Error(err))
		return err
	}

	s.logger.Info("服务监控 VictoriaMetrics 数据删除成功", zap.String("monitorID", monitorID))
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

// buildPromQLQueries 构造 PromQL 查询列表（支持多系列）
func (s *MetricService) buildPromQLQueries(agentID, metricType string, interfaceName string, aggregation string, step time.Duration) []metric.QueryDefinition {
	var queries []metric.QueryDefinition

	switch metricType {
	case "cpu":
		queries = []metric.QueryDefinition{{
			Name:  "usage",
			Query: fmt.Sprintf(`pika_cpu_usage_percent{agent_id="%s"}`, agentID),
		}}

	case "memory":
		queries = []metric.QueryDefinition{{
			Name:  "usage",
			Query: fmt.Sprintf(`pika_memory_usage_percent{agent_id="%s"}`, agentID),
		}}

	case "disk":
		queries = []metric.QueryDefinition{{
			Name:  "usage",
			Query: fmt.Sprintf(`pika_disk_usage_percent{agent_id="%s",mount_point=""}`, agentID),
		}}

	case "network":
		// 网络流量：上行和下行
		if interfaceName != "" && interfaceName != "all" {
			// 指定网卡
			queries = []metric.QueryDefinition{
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
			queries = []metric.QueryDefinition{
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
		queries = []metric.QueryDefinition{
			{Name: "established", Query: fmt.Sprintf(`pika_network_conn_established{agent_id="%s"}`, agentID)},
			{Name: "time_wait", Query: fmt.Sprintf(`pika_network_conn_time_wait{agent_id="%s"}`, agentID)},
			{Name: "close_wait", Query: fmt.Sprintf(`pika_network_conn_close_wait{agent_id="%s"}`, agentID)},
			{Name: "listen", Query: fmt.Sprintf(`pika_network_conn_listen{agent_id="%s"}`, agentID)},
		}

	case "disk_io":
		// 磁盘 IO：读和写
		queries = []metric.QueryDefinition{
			{Name: "read", Query: fmt.Sprintf(`pika_disk_read_bytes_rate{agent_id="%s"}`, agentID)},
			{Name: "write", Query: fmt.Sprintf(`pika_disk_write_bytes_rate{agent_id="%s"}`, agentID)},
		}

	case "gpu":
		// GPU：利用率和温度（按 GPU 分组）
		queries = []metric.QueryDefinition{
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
		queries = []metric.QueryDefinition{{
			Name:  "temperature",
			Query: fmt.Sprintf(`pika_temperature_celsius{agent_id="%s"}`, agentID),
		}}

	case "monitor":
		// 监控：响应时间（该探针参与的所有监控任务）
		queries = []metric.QueryDefinition{{
			Name:  "response_time",
			Query: fmt.Sprintf(`pika_monitor_response_time_ms{agent_id="%s"}`, agentID),
		}}
	}

	if aggregation != "" {
		for i := range queries {
			queries[i].Query = wrapAggregationQuery(queries[i].Query, aggregation, step)
		}
	}

	return queries
}

func wrapAggregationQuery(query, aggregation string, step time.Duration) string {
	if aggregation == "" || step <= 0 {
		return query
	}

	windowSeconds := int(step.Seconds())
	if windowSeconds <= 0 {
		return query
	}

	window := fmt.Sprintf("%ds", windowSeconds)
	switch aggregation {
	case "avg":
		return fmt.Sprintf(`avg_over_time((%s)[%s:])`, query, window)
	case "max":
		return fmt.Sprintf(`max_over_time((%s)[%s:])`, query, window)
	default:
		return query
	}
}

// convertQueryResultToSeries 将 VictoriaMetrics 查询结果转换为 MetricSeries
func (s *MetricService) convertQueryResultToSeries(result *vmclient.QueryResult, seriesName string, extraLabels map[string]string) []metric.Series {
	if result == nil || len(result.Data.Result) == 0 {
		return nil
	}

	var allSeries []metric.Series

	// 遍历所有时间序列
	for _, timeSeries := range result.Data.Result {
		// 提取数据点
		var dataPoints []metric.DataPoint
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
			dataPoints = append(dataPoints, metric.DataPoint{
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

		// 移除 target 标签（避免数据泄露）
		delete(labels, "target")

		allSeries = append(allSeries, metric.Series{
			Name:   finalName,
			Labels: labels,
			Data:   dataPoints,
		})
	}

	return allSeries
}

// buildMonitorPromQLQueries 构建监控查询的 PromQL 语句
func (s *MetricService) buildMonitorPromQLQueries(monitorID string, aggregation string, step time.Duration) []metric.QueryDefinition {
	var queries = []metric.QueryDefinition{
		{Name: "response_time", Query: fmt.Sprintf(`pika_monitor_response_time_ms{monitor_id="%s"}`, monitorID)},
	}
	if aggregation != "" {
		for i := range queries {
			queries[i].Query = wrapAggregationQuery(queries[i].Query, aggregation, step)
		}
	}
	return queries
}

// GetMonitorHistory 获取监控任务的历史趋势数据
func (s *MetricService) GetMonitorHistory(ctx context.Context, monitorID string, start, end int64, aggregation string) (*metric.GetMetricsResponse, error) {
	// 查询监控任务配置
	monitorTask, err := s.monitorRepo.FindById(ctx, monitorID)
	if err != nil {
		s.logger.Error("查询监控任务失败", zap.String("monitorID", monitorID), zap.Error(err))
		return nil, err
	}

	step := vmclient.AutoStep(time.UnixMilli(start), time.UnixMilli(end))
	queries := s.buildMonitorPromQLQueries(monitorID, aggregation, step)

	var series []metric.Series
	for _, q := range queries {
		result, err := s.vmClient.QueryRange(
			ctx,
			q.Query,
			time.UnixMilli(start),
			time.UnixMilli(end),
			step,
		)
		if err != nil {
			s.logger.Warn("查询历史趋势失败", zap.String("query", q.Name), zap.Error(err))
			continue
		}
		convertedSeries := s.convertQueryResultToSeries(result, q.Name, q.Labels)
		series = append(series, convertedSeries...)
	}

	// 过滤掉已取消关联的 agent 数据（仅在有过滤条件时）
	agentIdSet := make(map[string]struct{})
	if len(monitorTask.AgentIds) > 0 {
		// 有过滤条件，只保留当前关联的 agent 数据
		filteredSeries := make([]metric.Series, 0)
		for _, s := range series {
			if agentId, ok := s.Labels["agent_id"]; ok {
				if slices.Contains(monitorTask.AgentIds, agentId) {
					filteredSeries = append(filteredSeries, s)
					agentIdSet[agentId] = struct{}{}
				}
			}
		}
		series = filteredSeries
	} else {
		// 无过滤条件，收集所有 agent_id
		for _, s := range series {
			if agentId, ok := s.Labels["agent_id"]; ok {
				agentIdSet[agentId] = struct{}{}
			}
		}
	}

	// 查询 agent 信息
	if len(agentIdSet) > 0 {
		agentIds := make([]string, 0, len(agentIdSet))
		for agentId := range agentIdSet {
			agentIds = append(agentIds, agentId)
		}

		agents, err := s.agentRepo.FindByIdIn(ctx, agentIds)
		if err != nil {
			s.logger.Error("查询 agent 信息失败", zap.Error(err))
		} else {
			// 构建 agentId -> agentName 映射
			agentNameMap := make(map[string]string)
			for _, agent := range agents {
				agentNameMap[agent.ID] = agent.Name
			}

			// 在每个 series 的 labels 中添加 agent_name
			for i := range series {
				if agentId, ok := series[i].Labels["agent_id"]; ok {
					if agentName, exists := agentNameMap[agentId]; exists {
						series[i].Labels["agent_name"] = agentName
					}
				}
			}
		}
	}

	return &metric.GetMetricsResponse{
		AgentID: "", // 监控查询不限定单个agent
		Type:    "monitor",
		Range:   fmt.Sprintf("%d-%d", start, end),
		Series:  series,
	}, nil
}

// GetMonitorAgentStats 获取监控任务各探针的统计数据（只从缓存读取）
func (s *MetricService) GetMonitorAgentStats(monitorID string) []protocol.MonitorData {
	// 从缓存读取监控数据
	latestMetrics, ok := s.monitorLatestCache.Get(monitorID)
	if !ok {
		// 缓存不存在，返回空列表
		return []protocol.MonitorData{}
	}

	// 查询监控任务配置
	ctx := context.Background()
	monitorTask, err := s.monitorRepo.FindById(ctx, monitorID)
	if err != nil {
		s.logger.Error("查询监控任务失败", zap.String("monitorID", monitorID), zap.Error(err))
		return []protocol.MonitorData{}
	}

	// 收集所有当前关联的 agentId（从缓存中过滤）
	agentIds := make([]string, 0)
	if len(monitorTask.AgentIds) > 0 {
		// 有过滤条件，只保留匹配的 agent
		for agentId := range latestMetrics.Agents.Keys() {
			if slices.Contains(monitorTask.AgentIds, agentId) {
				agentIds = append(agentIds, agentId)
			}
		}
	} else {
		// 无过滤条件，返回所有缓存中的 agent
		for agentId := range latestMetrics.Agents.Keys() {
			agentIds = append(agentIds, agentId)
		}
	}

	// 查询 agent 信息
	agents, err := s.agentRepo.FindByIdIn(ctx, agentIds)
	if err != nil {
		s.logger.Error("查询 agent 信息失败", zap.Error(err))
	}

	// 构建 agentId -> agentName 映射
	agentNameMap := make(map[string]string)
	for _, agent := range agents {
		agentNameMap[agent.ID] = agent.Name
	}

	// 转换为数组并填充 agent 名称
	result := make([]protocol.MonitorData, 0, len(agentIds))
	for stat := range latestMetrics.Agents.Values() {
		// 根据过滤条件决定是否包含该 agent
		if len(monitorTask.AgentIds) > 0 {
			// 有过滤条件，只返回当前关联的 agent 数据
			if slices.Contains(monitorTask.AgentIds, stat.AgentId) {
				stat.AgentName = agentNameMap[stat.AgentId] // 填充 agent 名称
				result = append(result, *stat)
			}
		} else {
			// 无过滤条件，返回所有 agent 数据
			stat.AgentName = agentNameMap[stat.AgentId] // 填充 agent 名称
			result = append(result, *stat)
		}
	}
	// 根据响应时间排序
	sort.Slice(result, func(i, j int) bool {
		return result[i].ResponseTime < result[j].ResponseTime
	})

	return result
}

// GetMonitorStats 获取监控任务的聚合统计数据（只从缓存读取）
func (s *MetricService) GetMonitorStats(monitorID string) *metric.MonitorStatsResult {
	// 从缓存读取监控数据
	latestMetrics, ok := s.monitorLatestCache.Get(monitorID)
	if !ok {
		// 缓存不存在，返回默认值
		return &metric.MonitorStatsResult{
			Status: "unknown",
		}
	}

	// 查询监控任务配置
	ctx := context.Background()
	monitorTask, err := s.monitorRepo.FindById(ctx, monitorID)
	if err != nil {
		s.logger.Error("查询监控任务失败", zap.String("monitorID", monitorID), zap.Error(err))
		return &metric.MonitorStatsResult{
			Status: "unknown",
		}
	}

	// 聚合各探针数据
	return s.aggregateMonitorStats(latestMetrics, monitorTask.AgentIds)
}

// aggregateMonitorStats 聚合各探针的监控数据
func (s *MetricService) aggregateMonitorStats(latestMetrics *metric.LatestMonitorMetrics, agentIds []string) *metric.MonitorStatsResult {
	result := &metric.MonitorStatsResult{
		Status: "unknown",
	}

	if latestMetrics.Agents.Len() == 0 {
		return result
	}

	var totalResponseTime int64
	var minResponseTime int64 = 9223372036854775807 // math.MaxInt64
	var maxResponseTime int64
	var lastCheckTime int64
	var upCount, downCount, unknownCount int
	var validCount int // 实际聚合的探针数量
	hasCert := false
	var minCertExpiryTime int64
	var minCertDaysLeft int

	for stat := range latestMetrics.Agents.Values() {
		// 根据过滤条件决定是否聚合该探针
		if len(agentIds) > 0 {
			// 有过滤条件，只聚合当前关联的探针数据
			if !slices.Contains(agentIds, stat.AgentId) {
				continue
			}
		}

		validCount++
		totalResponseTime += stat.ResponseTime

		// 计算响应时间的最小值和最大值
		if stat.ResponseTime < minResponseTime {
			minResponseTime = stat.ResponseTime
		}
		if stat.ResponseTime > maxResponseTime {
			maxResponseTime = stat.ResponseTime
		}

		if stat.CheckedAt > lastCheckTime {
			lastCheckTime = stat.CheckedAt
		}

		// 统计各状态的探针数量
		switch stat.Status {
		case "up":
			upCount++
		case "down":
			downCount++
		default:
			unknownCount++
		}

		if stat.CertExpiryTime > 0 {
			if !hasCert || stat.CertExpiryTime < minCertExpiryTime {
				minCertExpiryTime = stat.CertExpiryTime
				minCertDaysLeft = stat.CertDaysLeft
				hasCert = true
			}
		}
	}

	result.AgentCount = validCount
	if validCount > 0 {
		result.ResponseTime = totalResponseTime / int64(validCount)
	}
	result.ResponseTimeMin = minResponseTime
	result.ResponseTimeMax = maxResponseTime
	result.LastCheckTime = lastCheckTime

	// 填充探针状态分布
	result.AgentStats.Up = upCount
	result.AgentStats.Down = downCount
	result.AgentStats.Unknown = unknownCount

	// 聚合状态：只要有一个探针 up，整体就是 up
	if upCount > 0 {
		result.Status = "up"
	} else if downCount > 0 {
		result.Status = "down"
	}

	if hasCert {
		result.CertExpiryTime = minCertExpiryTime
		result.CertDaysLeft = minCertDaysLeft
	}

	return result
}
