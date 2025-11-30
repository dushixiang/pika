package service

import (
	"context"
	"encoding/json"
	"math"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/repo"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	defaultMetricsRetentionHours = 24 * 7 // 默认保留 7 天
	defaultMaxQueryPoints        = 300    // 默认最多返回 300 个点（优化前端渲染性能）
)

var allowedIntervals = []int{
	1, 2, 5,
	10, 15, 30,
	60, 120, 300,
	600, 900, 1800,
	3600, 7200, 14400,
}

// 聚合任务支持的 bucket 列表（升序）
// 与前端 timeRangeOptions 对齐，优化查询效率
var aggregationBuckets = []int{
	60,   // 1 分钟   - 适用于 15分钟、30分钟时间范围
	300,  // 5 分钟   - 适用于 1小时、3小时时间范围
	900,  // 15 分钟  - 适用于 6小时、12小时时间范围
	1800, // 30 分钟  - 适用于 1天时间范围
	3600, // 1 小时   - 适用于 3天时间范围
	7200, // 2 小时   - 适用于 7天时间范围
}

// MetricService 指标服务
type MetricService struct {
	logger           *zap.Logger
	metricRepo       *repo.MetricRepo
	monitorStatsRepo *repo.MonitorStatsRepo
	propertyService  *PropertyService
}

// NewMetricService 创建指标服务
func NewMetricService(logger *zap.Logger, db *gorm.DB, propertyService *PropertyService) *MetricService {
	return &MetricService{
		logger:           logger,
		metricRepo:       repo.NewMetricRepo(db),
		monitorStatsRepo: repo.NewMonitorStatsRepo(db),
		propertyService:  propertyService,
	}
}

// HandleMetricData 处理指标数据
func (s *MetricService) HandleMetricData(ctx context.Context, agentID string, metricType string, data json.RawMessage) error {
	now := time.Now().UnixMilli()

	switch protocol.MetricType(metricType) {
	case protocol.MetricTypeCPU:
		// CPU数据现在包含静态和动态信息
		var cpuData protocol.CPUData
		if err := json.Unmarshal(data, &cpuData); err != nil {
			return err
		}
		metric := &models.CPUMetric{
			AgentID:       agentID,
			UsagePercent:  cpuData.UsagePercent,
			LogicalCores:  cpuData.LogicalCores,
			PhysicalCores: cpuData.PhysicalCores,
			ModelName:     cpuData.ModelName,
			Timestamp:     now,
		}
		return s.metricRepo.SaveCPUMetric(ctx, metric)

	case protocol.MetricTypeMemory:
		// Memory数据现在包含静态和动态信息
		var memData protocol.MemoryData
		if err := json.Unmarshal(data, &memData); err != nil {
			return err
		}
		metric := &models.MemoryMetric{
			AgentID:      agentID,
			Total:        memData.Total, // 现在可以从合并后的数据获取
			Used:         memData.Used,
			Free:         memData.Free,
			UsagePercent: memData.UsagePercent,
			SwapTotal:    memData.SwapTotal,
			SwapUsed:     memData.SwapUsed,
			SwapFree:     memData.SwapFree,
			Timestamp:    now,
		}
		return s.metricRepo.SaveMemoryMetric(ctx, metric)

	case protocol.MetricTypeDisk:
		// Disk现在是数组,需要批量处理
		var diskDataList []protocol.DiskData
		if err := json.Unmarshal(data, &diskDataList); err != nil {
			return err
		}

		// 合并所有磁盘的数据用于保存总和
		var totalTotal, totalUsed, totalFree uint64
		var maxUsagePercent float64

		// 保存每个磁盘的数据，同时累加总和
		for _, diskData := range diskDataList {
			// 保存单个磁盘数据
			metric := &models.DiskMetric{
				AgentID:      agentID,
				MountPoint:   diskData.MountPoint,
				Total:        diskData.Total,
				Used:         diskData.Used,
				Free:         diskData.Free,
				UsagePercent: diskData.UsagePercent,
				Timestamp:    now,
			}
			if err := s.metricRepo.SaveDiskMetric(ctx, metric); err != nil {
				s.logger.Error("failed to save disk metric",
					zap.Error(err),
					zap.String("agentID", agentID),
					zap.String("mountPoint", diskData.MountPoint))
			}

			// 累加所有磁盘的数据
			totalTotal += diskData.Total
			totalUsed += diskData.Used
			totalFree += diskData.Free
			if diskData.UsagePercent > maxUsagePercent {
				maxUsagePercent = diskData.UsagePercent
			}
		}

		// 保存合并后的总和数据（mount_point 字段设置为空字符串）
		totalMetric := &models.DiskMetric{
			AgentID:      agentID,
			MountPoint:   "all",
			Total:        totalTotal,
			Used:         totalUsed,
			Free:         totalFree,
			UsagePercent: maxUsagePercent, // 使用率取最大值
			Timestamp:    now,
			TotalDisks:   len(diskDataList),
		}
		return s.metricRepo.SaveDiskMetric(ctx, totalMetric)

	case protocol.MetricTypeNetwork:
		// Network现在是数组,需要批量处理
		var networkDataList []protocol.NetworkData
		if err := json.Unmarshal(data, &networkDataList); err != nil {
			return err
		}

		// 合并所有网卡的数据用于保存总和
		var totalSentRate, totalRecvRate uint64
		var totalSentTotal, totalRecvTotal uint64

		// 保存每个网卡的数据，同时累加总和
		for _, netData := range networkDataList {
			// 保存单个网卡数据
			metric := &models.NetworkMetric{
				AgentID:        agentID,
				Interface:      netData.Interface,
				BytesSentRate:  netData.BytesSentRate,
				BytesRecvRate:  netData.BytesRecvRate,
				BytesSentTotal: netData.BytesSentTotal,
				BytesRecvTotal: netData.BytesRecvTotal,
				Timestamp:      now,
			}
			if err := s.metricRepo.SaveNetworkMetric(ctx, metric); err != nil {
				s.logger.Error("failed to save network metric",
					zap.Error(err),
					zap.String("agentID", agentID),
					zap.String("interface", netData.Interface))
			}

			// 累加所有网卡的数据
			totalSentRate += netData.BytesSentRate
			totalRecvRate += netData.BytesRecvRate
			totalSentTotal += netData.BytesSentTotal
			totalRecvTotal += netData.BytesRecvTotal
		}

		// 保存合并后的总和数据（interface 字段设置为空字符串）
		totalMetric := &models.NetworkMetric{
			AgentID:         agentID,
			Interface:       "all", // 空字符串表示所有网卡的合并数据
			BytesSentRate:   totalSentRate,
			BytesRecvRate:   totalRecvRate,
			BytesSentTotal:  totalSentTotal,
			BytesRecvTotal:  totalRecvTotal,
			Timestamp:       now,
			TotalInterfaces: len(networkDataList),
		}
		return s.metricRepo.SaveNetworkMetric(ctx, totalMetric)

	case protocol.MetricTypeNetworkConnection:
		var connData protocol.NetworkConnectionData
		if err := json.Unmarshal(data, &connData); err != nil {
			return err
		}
		metric := &models.NetworkConnectionMetric{
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
		return s.metricRepo.SaveNetworkConnectionMetric(ctx, metric)

	case protocol.MetricTypeDiskIO:
		// DiskIO现在是数组，直接合并所有磁盘的数据存储为一条记录
		var diskIODataList []*protocol.DiskIOData
		if err := json.Unmarshal(data, &diskIODataList); err != nil {
			return err
		}

		// 合并所有磁盘的数据
		var totalReadCount, totalWriteCount uint64
		var totalReadBytes, totalWriteBytes uint64
		var totalReadBytesRate, totalWriteBytesRate uint64
		var totalReadTime, totalWriteTime, totalIoTime uint64
		var maxIopsInProgress uint64

		for _, diskIOData := range diskIODataList {
			totalReadCount += diskIOData.ReadCount
			totalWriteCount += diskIOData.WriteCount
			totalReadBytes += diskIOData.ReadBytes
			totalWriteBytes += diskIOData.WriteBytes
			totalReadBytesRate += diskIOData.ReadBytesRate
			totalWriteBytesRate += diskIOData.WriteBytesRate
			totalReadTime += diskIOData.ReadTime
			totalWriteTime += diskIOData.WriteTime
			totalIoTime += diskIOData.IoTime
			if diskIOData.IopsInProgress > maxIopsInProgress {
				maxIopsInProgress = diskIOData.IopsInProgress
			}
		}

		// 保存合并后的数据（device 字段设置为空或 "all"）
		metric := &models.DiskIOMetric{
			AgentID:        agentID,
			Device:         "all",
			ReadCount:      totalReadCount,
			WriteCount:     totalWriteCount,
			ReadBytes:      totalReadBytes,
			WriteBytes:     totalWriteBytes,
			ReadBytesRate:  totalReadBytesRate,
			WriteBytesRate: totalWriteBytesRate,
			ReadTime:       totalReadTime,
			WriteTime:      totalWriteTime,
			IoTime:         totalIoTime,
			IopsInProgress: maxIopsInProgress,
			Timestamp:      now,
		}
		return s.metricRepo.SaveDiskIOMetric(ctx, metric)

	case protocol.MetricTypeHost:
		var hostData protocol.HostInfoData
		if err := json.Unmarshal(data, &hostData); err != nil {
			return err
		}
		// 保存主机信息
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
		return s.metricRepo.SaveHostMetric(ctx, metric)

	case protocol.MetricTypeGPU:
		// GPU现在是数组,需要批量处理
		var gpuDataList []protocol.GPUData
		if err := json.Unmarshal(data, &gpuDataList); err != nil {
			return err
		}
		// 保存每个GPU的数据
		for _, gpuData := range gpuDataList {
			metric := &models.GPUMetric{
				AgentID:          agentID,
				Index:            gpuData.Index,
				Name:             gpuData.Name,
				Utilization:      gpuData.Utilization,
				MemoryTotal:      gpuData.MemoryTotal,
				MemoryUsed:       gpuData.MemoryUsed,
				MemoryFree:       gpuData.MemoryFree,
				Temperature:      gpuData.Temperature,
				PowerDraw:        gpuData.PowerUsage, // protocol 中是 PowerUsage
				FanSpeed:         gpuData.FanSpeed,
				PerformanceState: "", // protocol 中没有这个字段，留空
				Timestamp:        now,
			}
			if err := s.metricRepo.SaveGPUMetric(ctx, metric); err != nil {
				s.logger.Error("failed to save gpu metric",
					zap.Error(err),
					zap.String("agentID", agentID),
					zap.Int("index", gpuData.Index))
			}
		}
		return nil

	case protocol.MetricTypeTemperature:
		// Temperature现在是数组,需要批量处理
		var tempDataList []protocol.TemperatureData
		if err := json.Unmarshal(data, &tempDataList); err != nil {
			return err
		}
		// 保存每个温度传感器的数据
		for _, tempData := range tempDataList {
			metric := &models.TemperatureMetric{
				AgentID:     agentID,
				SensorKey:   tempData.SensorKey,
				SensorLabel: tempData.SensorKey, // protocol 中没有 SensorLabel，使用 SensorKey
				Temperature: tempData.Temperature,
				Timestamp:   now,
			}
			if err := s.metricRepo.SaveTemperatureMetric(ctx, metric); err != nil {
				s.logger.Error("failed to save temperature metric",
					zap.Error(err),
					zap.String("agentID", agentID),
					zap.String("sensor", tempData.SensorKey))
			}
		}
		return nil

	case protocol.MetricTypeMonitor:
		// 监控数据也是数组,需要批量处理
		var monitorDataList []protocol.MonitorData
		if err := json.Unmarshal(data, &monitorDataList); err != nil {
			return err
		}
		// 保存每个监控项的数据
		for _, monitorData := range monitorDataList {
			metric := &models.MonitorMetric{
				AgentId:        agentID,
				MonitorId:      monitorData.ID,
				Type:           monitorData.Type,
				Target:         monitorData.Target,
				Status:         monitorData.Status,
				StatusCode:     monitorData.StatusCode,
				ResponseTime:   monitorData.ResponseTime,
				Error:          monitorData.Error,
				Message:        monitorData.Message,
				ContentMatch:   monitorData.ContentMatch,
				CertExpiryTime: monitorData.CertExpiryTime,
				CertDaysLeft:   monitorData.CertDaysLeft,
				Timestamp:      monitorData.CheckedAt, // 使用检测时间
			}
			if err := s.metricRepo.SaveMonitorMetric(ctx, metric); err != nil {
				s.logger.Error("failed to save monitor metric",
					zap.Error(err),
					zap.String("agentID", agentID),
					zap.String("MonitorId", monitorData.ID))
			}
		}
		return nil

	default:
		s.logger.Warn("unknown metric type", zap.String("type", metricType))
		return nil
	}
}

// GetMetrics 获取聚合指标数据（自动路由到聚合表或原始表）
// interfaceName: 网卡过滤参数（仅对 network 类型有效）
func (s *MetricService) GetMetrics(ctx context.Context, agentID, metricType string, start, end int64, interval int, interfaceName string) (interface{}, error) {
	start, end = s.normalizeTimeRange(ctx, start, end)
	interval = s.DetermineInterval(ctx, start, end, interval)

	// 判断是否可以使用聚合表（仅支持部分指标类型）
	aggCapable := map[string]bool{
		"cpu":                true,
		"memory":             true,
		"disk":               true,
		"network":            true,
		"network_connection": true,
		"disk_io":            true,
		"gpu":                true,
		"temperature":        true,
	}

	// 智能选择聚合粒度：根据查询间隔选择最合适的bucket
	// 例如：查询90秒数据时使用60秒bucket，查询600秒数据时使用300秒bucket
	var bucketSeconds int
	useAgg := false
	if aggCapable[metricType] {
		bucketSeconds = chooseAggregationBucket(interval)
		useAgg = bucketSeconds > 0
	}

	// 将时间范围对齐到最终使用的 bucket，避免不同时间框架出现桶数量偏差
	bucketMs := int64(interval * 1000)
	if useAgg {
		bucketMs = int64(bucketSeconds * 1000)
	}
	start, end = alignTimeRangeToBucket(start, end, bucketMs)

	switch metricType {
	case "cpu":
		if useAgg {
			if metrics, err := s.metricRepo.GetCPUMetricsAgg(ctx, agentID, start, end, bucketSeconds); err == nil && len(metrics) > 0 {
				return metrics, nil
			}
		}
		return s.metricRepo.GetCPUMetrics(ctx, agentID, start, end, interval)
	case "memory":
		if useAgg {
			if metrics, err := s.metricRepo.GetMemoryMetricsAgg(ctx, agentID, start, end, bucketSeconds); err == nil && len(metrics) > 0 {
				return metrics, nil
			}
		}
		return s.metricRepo.GetMemoryMetrics(ctx, agentID, start, end, interval)
	case "disk":
		if useAgg {
			if metrics, err := s.metricRepo.GetDiskMetricsAgg(ctx, agentID, start, end, bucketSeconds); err == nil && len(metrics) > 0 {
				return metrics, nil
			}
		}
		return s.metricRepo.GetDiskMetrics(ctx, agentID, start, end, interval)
	case "network":
		if useAgg {
			if metrics, err := s.metricRepo.GetNetworkMetricsAgg(ctx, agentID, start, end, bucketSeconds, interfaceName); err == nil && len(metrics) > 0 {
				return metrics, nil
			}
		}
		return s.metricRepo.GetNetworkMetrics(ctx, agentID, start, end, interval, interfaceName)
	case "network_connection":
		if useAgg {
			if metrics, err := s.metricRepo.GetNetworkConnectionMetricsAgg(ctx, agentID, start, end, bucketSeconds); err == nil && len(metrics) > 0 {
				return metrics, nil
			}
		}
		return s.metricRepo.GetNetworkConnectionMetrics(ctx, agentID, start, end, interval)
	case "disk_io":
		if useAgg {
			if metrics, err := s.metricRepo.GetDiskIOMetricsAgg(ctx, agentID, start, end, bucketSeconds); err == nil && len(metrics) > 0 {
				return metrics, nil
			}
		}
		return s.metricRepo.GetDiskIOMetrics(ctx, agentID, start, end, interval)
	case "gpu":
		if useAgg {
			if metrics, err := s.metricRepo.GetGPUMetricsAgg(ctx, agentID, start, end, bucketSeconds); err == nil && len(metrics) > 0 {
				return metrics, nil
			}
		}
		return s.metricRepo.GetGPUMetrics(ctx, agentID, start, end, interval)
	case "temperature":
		if useAgg {
			if metrics, err := s.metricRepo.GetTemperatureMetricsAgg(ctx, agentID, start, end, bucketSeconds); err == nil && len(metrics) > 0 {
				return metrics, nil
			}
		}
		return s.metricRepo.GetTemperatureMetrics(ctx, agentID, start, end, interval)
	default:
		return nil, nil
	}
}

// DetermineInterval 根据配置、用户请求和时间范围决定聚合粒度
func (s *MetricService) DetermineInterval(ctx context.Context, start, end int64, requested int) int {
	interval := requested
	if interval <= 0 {
		interval = calculateBaseInterval(start, end)
	}

	interval = adjustIntervalForMaxPoints(start, end, interval, defaultMaxQueryPoints)
	return interval
}

// normalizeTimeRange 将时间范围限制在保留周期内，避免无意义的全表扫描
func (s *MetricService) normalizeTimeRange(ctx context.Context, start, end int64) (int64, int64) {
	cfg := s.getMetricsConfig(ctx)
	retentionDuration := time.Duration(cfg.RetentionHours) * time.Hour

	retentionBoundary := time.Now().Add(-retentionDuration).UnixMilli()
	if start < retentionBoundary {
		start = retentionBoundary
	}
	if end <= start {
		end = start + 1000
	}
	return start, end
}

// calculateBaseInterval 根据时间范围计算基础间隔
func calculateBaseInterval(start, end int64) int {
	duration := (end - start) / 1000 // 秒

	switch {
	case duration <= 60: // 1 分钟内
		return 2
	case duration <= 5*60: // 5 分钟内
		return 5
	case duration <= 15*60: // 15 分钟内
		return 15
	case duration <= 30*60: // 30 分钟内
		return 30
	case duration <= 60*60: // 1 小时内
		return 60
	case duration <= 3*60*60: // 3 小时内
		return 180
	case duration <= 6*60*60: // 6 小时内
		return 300
	case duration <= 12*60*60: // 12 小时内
		return 600
	case duration <= 24*60*60: // 1 天内
		return 900
	case duration <= 3*24*60*60: // 3 天内
		return 1800
	case duration <= 7*24*60*60: // 7 天内
		return 3600
	case duration <= 14*24*60*60: // 14 天内
		return 7200
	default:
		return 14400 // 更长时间：4 小时粒度
	}
}

// adjustIntervalForMaxPoints 根据最大数据点限制提升聚合粒度
func adjustIntervalForMaxPoints(start, end int64, interval int, maxPoints int) int {
	if interval <= 0 {
		interval = 1
	}
	if maxPoints <= 0 {
		return alignInterval(interval)
	}

	durationSeconds := float64(end-start) / 1000
	if durationSeconds <= 0 {
		return alignInterval(interval)
	}

	required := int(math.Ceil(durationSeconds / float64(maxPoints)))
	interval = maxInt(interval, required)
	return alignInterval(interval)
}

// alignInterval 将间隔对齐到允许的值
func alignInterval(interval int) int {
	for _, candidate := range allowedIntervals {
		if interval <= candidate {
			return candidate
		}
	}
	return allowedIntervals[len(allowedIntervals)-1]
}

// maxInt 返回两个整数的最大值
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
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

// chooseAggregationBucket 根据请求的 interval 选择最合适的聚合 bucket（取不小于 interval 的最小桶）
func chooseAggregationBucket(interval int) int {
	if interval <= 0 {
		return 0
	}
	for _, bucket := range aggregationBuckets {
		if interval <= bucket {
			return bucket
		}
	}
	return aggregationBuckets[len(aggregationBuckets)-1]
}

// getMetricsConfig 获取指标配置
func (s *MetricService) getMetricsConfig(ctx context.Context) models.MetricsConfig {
	cfg := models.MetricsConfig{
		RetentionHours: defaultMetricsRetentionHours,
	}

	if s.propertyService == nil {
		return cfg
	}

	loaded := s.propertyService.GetMetricsConfig(ctx)
	if loaded.RetentionHours > 0 {
		cfg.RetentionHours = loaded.RetentionHours
	}
	return cfg
}

// StartAggregationTask 启动聚合下采样任务
func (s *MetricService) StartAggregationTask(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	s.logger.Info("aggregation task started")

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("aggregation task stopped")
			return
		case <-ticker.C:
			s.runAggregation(ctx)
		}
	}
}

// runAggregation 按固定 bucket 下采样存储
func (s *MetricService) runAggregation(ctx context.Context) {
	cfg := s.getMetricsConfig(ctx)
	retention := time.Duration(cfg.RetentionHours) * time.Hour

	for _, bucket := range aggregationBuckets {
		s.aggregateMetric(ctx, "cpu", bucket, retention, s.metricRepo.AggregateCPUToAgg)
		s.aggregateMetric(ctx, "memory", bucket, retention, s.metricRepo.AggregateMemoryToAgg)
		s.aggregateMetric(ctx, "disk", bucket, retention, s.metricRepo.AggregateDiskToAgg)
		s.aggregateMetric(ctx, "network", bucket, retention, s.metricRepo.AggregateNetworkToAgg)
		s.aggregateMetric(ctx, "network_connection", bucket, retention, s.metricRepo.AggregateNetworkConnectionToAgg)
		s.aggregateMetric(ctx, "disk_io", bucket, retention, s.metricRepo.AggregateDiskIOToAgg)
		s.aggregateMetric(ctx, "gpu", bucket, retention, s.metricRepo.AggregateGPUToAgg)
		s.aggregateMetric(ctx, "temperature", bucket, retention, s.metricRepo.AggregateTemperatureToAgg)
	}
}

type aggregateFn func(ctx context.Context, bucketSeconds int, start, end int64) error

// aggregateMetric 聚合指定类型的指标
func (s *MetricService) aggregateMetric(ctx context.Context, metricType string, bucketSeconds int, retention time.Duration, fn aggregateFn) {
	bucketMs := int64(bucketSeconds * 1000)

	start := s.getAggregationStart(ctx, metricType, bucketSeconds, retention, bucketMs)
	endBucket := (time.Now().Add(-time.Duration(bucketSeconds)*time.Second).UnixMilli() / bucketMs) * bucketMs

	if endBucket <= start {
		return
	}

	end := endBucket + bucketMs - 1

	if err := fn(ctx, bucketSeconds, start, end); err != nil {
		s.logger.Error("aggregate metric failed", zap.String("metricType", metricType), zap.Int("bucketSeconds", bucketSeconds), zap.Error(err))
		return
	}

	if err := s.metricRepo.UpsertAggregationProgress(ctx, metricType, bucketSeconds, endBucket); err != nil {
		s.logger.Error("update aggregation progress failed", zap.String("metricType", metricType), zap.Int("bucketSeconds", bucketSeconds), zap.Error(err))
	}
}

// getAggregationStart 获取聚合开始时间
func (s *MetricService) getAggregationStart(ctx context.Context, metricType string, bucketSeconds int, retention time.Duration, bucketMs int64) int64 {
	progress, err := s.metricRepo.GetAggregationProgress(ctx, metricType, bucketSeconds)
	if err == nil && progress != nil && progress.LastBucket > 0 {
		return progress.LastBucket + bucketMs
	}

	// 默认从保留窗口开始
	start := time.Now().Add(-retention).UnixMilli()
	return (start / bucketMs) * bucketMs
}

// StartCleanupTask 启动数据清理任务
func (s *MetricService) StartCleanupTask(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	s.logger.Info("cleanup task started")

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("cleanup task stopped")
			return
		case <-ticker.C:
			s.cleanupOldMetrics(ctx)
		}
	}
}

// cleanupOldMetrics 清理旧数据
func (s *MetricService) cleanupOldMetrics(ctx context.Context) {
	cfg := s.getMetricsConfig(ctx)
	retentionDuration := time.Duration(cfg.RetentionHours) * time.Hour
	before := time.Now().Add(-retentionDuration).UnixMilli()

	s.logger.Info("starting to clean old metrics", zap.Int64("beforeTimestamp", before), zap.Int("retentionHours", cfg.RetentionHours))

	if err := s.metricRepo.DeleteOldMetrics(ctx, before); err != nil {
		s.logger.Error("failed to clean old metrics", zap.Error(err))
		return
	}

	s.logger.Info("old metrics cleaned successfully")
}

// GetLatestMetrics 获取最新指标
func (s *MetricService) GetLatestMetrics(ctx context.Context, agentID string) (*LatestMetrics, error) {
	result := &LatestMetrics{}

	// 获取最新CPU指标
	if cpu, err := s.metricRepo.GetLatestCPUMetric(ctx, agentID); err == nil {
		result.CPU = cpu
	}

	// 获取最新内存指标
	if memory, err := s.metricRepo.GetLatestMemoryMetric(ctx, agentID); err == nil {
		result.Memory = memory
	}

	// 获取最新磁盘指标并计算平均使用率和总容量
	if disk, err := s.metricRepo.GetLatestDiskMetrics(ctx, agentID); err == nil {
		result.Disk = &DiskSummary{
			AvgUsagePercent: disk.UsagePercent,
			TotalDisks:      disk.TotalDisks,
			Total:           disk.Total,
			Used:            disk.Used,
			Free:            disk.Free,
		}
	}

	// 获取最新网络指标并汇总速率和累计流量
	// 注意: 采集器已经计算好了每秒速率,这里直接汇总所有网卡的速率和累计流量
	if network, err := s.metricRepo.GetLatestNetworkMetrics(ctx, agentID); err == nil {
		result.Network = &NetworkSummary{
			TotalBytesSentRate:  network.BytesSentRate,  // 所有网卡的总发送速率(字节/秒)
			TotalBytesRecvRate:  network.BytesRecvRate,  // 所有网卡的总接收速率(字节/秒)
			TotalBytesSentTotal: network.BytesSentTotal, // 所有网卡的累计发送流量
			TotalBytesRecvTotal: network.BytesRecvTotal, // 所有网卡的累计接收流量
			TotalInterfaces:     network.TotalInterfaces,
		}
	}

	// 获取最新主机信息
	if host, err := s.metricRepo.GetLatestHostMetric(ctx, agentID); err == nil {
		result.Host = host
	}

	// 获取最新GPU信息
	if gpu, err := s.metricRepo.GetLatestGPUMetrics(ctx, agentID); err == nil && len(gpu) > 0 {
		result.GPU = gpu
	}

	// 获取最新温度信息
	if temp, err := s.metricRepo.GetLatestTemperatureMetrics(ctx, agentID); err == nil && len(temp) > 0 {
		result.Temp = temp
	}

	// 获取最新网络连接统计
	if netConn, err := s.metricRepo.GetLatestNetworkConnectionMetric(ctx, agentID); err == nil {
		result.NetworkConnection = netConn
	}

	return result, nil
}

// GetLatestMonitorMetrics 获取最新的监控指标
func (s *MetricService) GetLatestMonitorMetrics(ctx context.Context, agentID string) ([]models.MonitorMetric, error) {
	return s.metricRepo.GetLatestMonitorMetrics(ctx, agentID)
}

// GetMonitorMetrics 获取监控指标历史数据
func (s *MetricService) GetMonitorMetrics(ctx context.Context, agentID, monitorName string, start, end int64) ([]models.MonitorMetric, error) {
	return s.metricRepo.GetMonitorMetrics(ctx, agentID, monitorName, start, end)
}

// GetMonitorMetricsByName 获取指定监控项的历史数据
func (s *MetricService) GetMonitorMetricsByName(ctx context.Context, agentID, monitorName string, start, end int64, limit int) ([]models.MonitorMetric, error) {
	return s.metricRepo.GetMonitorMetricsByName(ctx, agentID, monitorName, start, end, limit)
}

// DeleteAgentMetrics 删除探针的所有指标数据
func (s *MetricService) DeleteAgentMetrics(ctx context.Context, agentID string) error {
	return s.metricRepo.DeleteAgentMetrics(ctx, agentID)
}

// GetAvailableNetworkInterfaces 获取探针的可用网卡列表
func (s *MetricService) GetAvailableNetworkInterfaces(ctx context.Context, agentID string) ([]string, error) {
	return s.metricRepo.GetAvailableNetworkInterfaces(ctx, agentID)
}

// DiskSummary 磁盘汇总数据
type DiskSummary struct {
	AvgUsagePercent float64 `json:"avgUsagePercent"` // 平均使用率
	TotalDisks      int     `json:"totalDisks"`      // 磁盘数量
	Total           uint64  `json:"total"`           // 总容量(字节)
	Used            uint64  `json:"used"`            // 已使用(字节)
	Free            uint64  `json:"free"`            // 空闲(字节)
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
	CPU               *models.CPUMetric               `json:"cpu,omitempty"`
	Memory            *models.MemoryMetric            `json:"memory,omitempty"`
	Disk              *DiskSummary                    `json:"disk,omitempty"`
	Network           *NetworkSummary                 `json:"network,omitempty"`
	NetworkConnection *models.NetworkConnectionMetric `json:"networkConnection,omitempty"`
	Host              *models.HostMetric              `json:"host,omitempty"`
	GPU               []models.GPUMetric              `json:"gpu,omitempty"`
	Temp              []models.TemperatureMetric      `json:"temperature,omitempty"`
}
