package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/repo"
	"github.com/go-orz/orz"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	defaultMetricsRetentionHours = 24 * 7 // 默认保留 7 天
	defaultMaxQueryPoints        = 720    // 默认最多返回 720 个点
)

var allowedIntervals = []int{
	1, 2, 5,
	10, 15, 30,
	60, 120, 300,
	600, 900, 1800,
	3600, 7200, 14400,
}

type AgentService struct {
	logger *zap.Logger
	*orz.Service
	AgentRepo        *repo.AgentRepo
	metricRepo       *repo.MetricRepo
	monitorStatsRepo *repo.MonitorStatsRepo
	apiKeyService    *ApiKeyService
	propertyService  *PropertyService
}

func NewAgentService(logger *zap.Logger, db *gorm.DB, apiKeyService *ApiKeyService, propertyService *PropertyService) *AgentService {
	return &AgentService{
		logger:           logger,
		Service:          orz.NewService(db),
		AgentRepo:        repo.NewAgentRepo(db),
		metricRepo:       repo.NewMetricRepo(db),
		monitorStatsRepo: repo.NewMonitorStatsRepo(db),
		apiKeyService:    apiKeyService,
		propertyService:  propertyService,
	}
}

// RegisterAgent 注册探针
func (s *AgentService) RegisterAgent(ctx context.Context, ip string, info *protocol.AgentInfo, apiKey string) (*models.Agent, error) {
	// 验证API密钥
	if _, err := s.apiKeyService.ValidateApiKey(ctx, apiKey); err != nil {
		s.logger.Warn("agent registration failed: invalid api key",
			zap.String("agentID", info.ID),
			zap.String("hostname", info.Hostname),
		)
		return nil, err
	}

	// 验证探针 ID
	if info.ID == "" {
		return nil, fmt.Errorf("agent ID 不能为空")
	}

	// 使用探针的持久化 ID 来识别同一个探针
	// 这样即使主机名或 IP 变化，也能正确识别
	existingAgent, err := s.AgentRepo.FindById(ctx, info.ID)
	if err == nil {
		// 更新现有探针信息（允许主机名、IP、名称等变化）
		now := time.Now().UnixMilli()
		existingAgent.Hostname = info.Hostname
		existingAgent.IP = ip
		existingAgent.OS = info.OS
		existingAgent.Arch = info.Arch
		existingAgent.Version = info.Version
		existingAgent.Status = 1
		existingAgent.LastSeenAt = now
		existingAgent.UpdatedAt = now

		if err := s.AgentRepo.UpdateById(ctx, &existingAgent); err != nil {
			return nil, err
		}
		s.logger.Info("agent re-registered",
			zap.String("agentID", existingAgent.ID),
			zap.String("name", info.Name),
			zap.String("hostname", info.Hostname),
			zap.String("ip", ip),
			zap.String("version", info.Version))
		return &existingAgent, nil
	}

	// 创建新探针（使用客户端提供的持久化 ID）
	now := time.Now().UnixMilli()
	agent := &models.Agent{
		ID:         info.ID, // 使用客户端持久化的 ID
		Name:       info.Name,
		Hostname:   info.Hostname,
		IP:         ip,
		OS:         info.OS,
		Arch:       info.Arch,
		Version:    info.Version,
		Status:     1,
		LastSeenAt: now,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if err := s.AgentRepo.Create(ctx, agent); err != nil {
		return nil, err
	}

	s.logger.Info("agent registered successfully",
		zap.String("agentID", agent.ID),
		zap.String("name", info.Name),
		zap.String("hostname", info.Hostname),
		zap.String("ip", ip),
		zap.String("version", info.Version))
	return agent, nil
}

// UpdateAgentStatus 更新探针状态
func (s *AgentService) UpdateAgentStatus(ctx context.Context, agentID string, status int) error {
	return s.AgentRepo.UpdateStatus(ctx, agentID, status, time.Now().UnixMilli())
}

// GetAgent 获取探针信息
func (s *AgentService) GetAgent(ctx context.Context, agentID string) (*models.Agent, error) {
	agent, err := s.AgentRepo.FindById(ctx, agentID)
	if err != nil {
		return nil, err
	}
	return &agent, nil
}

// ListAgents 列出所有探针
func (s *AgentService) ListAgents(ctx context.Context) ([]models.Agent, error) {
	return s.AgentRepo.FindAll(ctx)
}

// ListOnlineAgents 列出所有在线探针
func (s *AgentService) ListOnlineAgents(ctx context.Context) ([]models.Agent, error) {
	return s.AgentRepo.FindOnlineAgents(ctx)
}

// HandleMetricData 处理指标数据
func (s *AgentService) HandleMetricData(ctx context.Context, agentID string, metricType string, data json.RawMessage) error {
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
		// 保存每个磁盘的数据
		for _, diskData := range diskDataList {
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
		}
		return nil

	case protocol.MetricTypeNetwork:
		// Network现在是数组,需要批量处理
		var networkDataList []protocol.NetworkData
		if err := json.Unmarshal(data, &networkDataList); err != nil {
			return err
		}
		// 保存每个网卡的数据
		for _, netData := range networkDataList {
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
		}
		return nil

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
		// DiskIO现在是数组,需要批量处理
		var diskIODataList []*protocol.DiskIOData
		if err := json.Unmarshal(data, &diskIODataList); err != nil {
			return err
		}
		// 保存每个磁盘的IO数据
		for _, diskIOData := range diskIODataList {
			metric := &models.DiskIOMetric{
				AgentID:        agentID,
				Device:         diskIOData.Device,
				ReadCount:      diskIOData.ReadCount,
				WriteCount:     diskIOData.WriteCount,
				ReadBytes:      diskIOData.ReadBytes,
				WriteBytes:     diskIOData.WriteBytes,
				ReadBytesRate:  diskIOData.ReadBytesRate,
				WriteBytesRate: diskIOData.WriteBytesRate,
				ReadTime:       diskIOData.ReadTime,
				WriteTime:      diskIOData.WriteTime,
				IoTime:         diskIOData.IoTime,
				IopsInProgress: diskIOData.IopsInProgress,
				Timestamp:      now,
			}
			if err := s.metricRepo.SaveDiskIOMetric(ctx, metric); err != nil {
				s.logger.Error("failed to save disk io metric",
					zap.Error(err),
					zap.String("agentID", agentID),
					zap.String("device", diskIOData.Device))
			}
		}
		return nil

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

// CalculateInterval 根据时间范围计算合适的聚合间隔（秒）
// 目标是返回尽量平滑的曲线，同时控制数据点数量
func CalculateInterval(start, end int64) int {
	duration := (end - start) / 1000 // 转换为秒

	switch {
	case duration <= 60: // 1分钟内: 2秒
		return 2
	case duration <= 300: // 5分钟内: 5秒
		return 5
	case duration <= 900: // 15分钟内: 15秒
		return 15
	case duration <= 1800: // 30分钟内: 30秒
		return 30
	default: // 1小时内: 60秒
		return 60
	}
}

// GetMetrics 获取聚合指标数据（自动路由到聚合表或原始表）
func (s *AgentService) GetMetrics(ctx context.Context, agentID, metricType string, start, end int64, interval int) (interface{}, error) {
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
		if interval >= 3600 {
			bucketSeconds = 3600
			useAgg = true
		} else if interval >= 300 {
			bucketSeconds = 300
			useAgg = true
		} else if interval >= 60 {
			bucketSeconds = 60
			useAgg = true
		}
	}

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
			if metrics, err := s.metricRepo.GetNetworkMetricsAgg(ctx, agentID, start, end, bucketSeconds); err == nil && len(metrics) > 0 {
				return metrics, nil
			}
		}
		return s.metricRepo.GetNetworkMetrics(ctx, agentID, start, end, interval)
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
func (s *AgentService) DetermineInterval(ctx context.Context, start, end int64, requested int) int {
	cfg := s.getMetricsConfig(ctx)

	interval := requested
	if interval <= 0 {
		interval = calculateBaseInterval(start, end)
	}

	interval = adjustIntervalForMaxPoints(start, end, interval, cfg.MaxQueryPoints)
	return interval
}

// normalizeTimeRange 将时间范围限制在保留周期内，避免无意义的全表扫描
func (s *AgentService) normalizeTimeRange(ctx context.Context, start, end int64) (int64, int64) {
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

func alignInterval(interval int) int {
	for _, candidate := range allowedIntervals {
		if interval <= candidate {
			return candidate
		}
	}
	return allowedIntervals[len(allowedIntervals)-1]
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (s *AgentService) getMetricsConfig(ctx context.Context) models.MetricsConfig {
	cfg := models.MetricsConfig{
		RetentionHours: defaultMetricsRetentionHours,
		MaxQueryPoints: defaultMaxQueryPoints,
	}

	if s.propertyService == nil {
		return cfg
	}

	loaded := s.propertyService.GetMetricsConfig(ctx)
	if loaded.RetentionHours > 0 {
		cfg.RetentionHours = loaded.RetentionHours
	}
	if loaded.MaxQueryPoints > 0 {
		cfg.MaxQueryPoints = loaded.MaxQueryPoints
	}
	return cfg
}

// runAggregation 按固定 bucket 下采样存储
func (s *AgentService) runAggregation(ctx context.Context) {
	cfg := s.getMetricsConfig(ctx)
	retention := time.Duration(cfg.RetentionHours) * time.Hour
	// 标准 bucket：1m、5m、1h
	buckets := []int{60, 300, 3600}

	for _, bucket := range buckets {
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

func (s *AgentService) aggregateMetric(ctx context.Context, metricType string, bucketSeconds int, retention time.Duration, fn aggregateFn) {
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

func (s *AgentService) getAggregationStart(ctx context.Context, metricType string, bucketSeconds int, retention time.Duration, bucketMs int64) int64 {
	progress, err := s.metricRepo.GetAggregationProgress(ctx, metricType, bucketSeconds)
	if err == nil && progress != nil && progress.LastBucket > 0 {
		return progress.LastBucket + bucketMs
	}

	// 默认从保留窗口开始
	start := time.Now().Add(-retention).UnixMilli()
	return (start / bucketMs) * bucketMs
}

// GetLatestMetrics 获取最新指标
func (s *AgentService) GetLatestMetrics(ctx context.Context, agentID string) (*LatestMetrics, error) {
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
	if disks, err := s.metricRepo.GetLatestDiskMetrics(ctx, agentID); err == nil && len(disks) > 0 {
		var totalUsage float64
		var totalSpace, usedSpace, freeSpace uint64
		for _, disk := range disks {
			totalUsage += disk.UsagePercent
			totalSpace += disk.Total
			usedSpace += disk.Used
			freeSpace += disk.Free
		}
		result.Disk = &DiskSummary{
			AvgUsagePercent: totalUsage / float64(len(disks)),
			TotalDisks:      len(disks),
			Total:           totalSpace,
			Used:            usedSpace,
			Free:            freeSpace,
		}
	}

	// 获取最新网络指标并汇总速率和累计流量
	// 注意: 采集器已经计算好了每秒速率,这里直接汇总所有网卡的速率和累计流量
	if networks, err := s.metricRepo.GetLatestNetworkMetrics(ctx, agentID); err == nil && len(networks) > 0 {
		var totalSentRate, totalRecvRate, totalSentTotal, totalRecvTotal uint64
		for _, net := range networks {
			totalSentRate += net.BytesSentRate   // 累加每个网卡的发送速率
			totalRecvRate += net.BytesRecvRate   // 累加每个网卡的接收速率
			totalSentTotal += net.BytesSentTotal // 累加每个网卡的累计发送流量
			totalRecvTotal += net.BytesRecvTotal // 累加每个网卡的累计接收流量
		}
		result.Network = &NetworkSummary{
			TotalBytesSentRate:  totalSentRate,  // 所有网卡的总发送速率(字节/秒)
			TotalBytesRecvRate:  totalRecvRate,  // 所有网卡的总接收速率(字节/秒)
			TotalBytesSentTotal: totalSentTotal, // 所有网卡的累计发送流量
			TotalBytesRecvTotal: totalRecvTotal, // 所有网卡的累计接收流量
			TotalInterfaces:     len(networks),
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

// StartCleanupTask 启动数据清理任务
func (s *AgentService) StartCleanupTask(ctx context.Context) {
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
func (s *AgentService) cleanupOldMetrics(ctx context.Context) {
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

// StartAggregationTask 启动聚合下采样任务
func (s *AgentService) StartAggregationTask(ctx context.Context) {
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

// HandleCommandResponse 处理指令响应
func (s *AgentService) HandleCommandResponse(ctx context.Context, agentID string, resp *protocol.CommandResponse) error {
	s.logger.Info("command response received",
		zap.String("agentID", agentID),
		zap.String("cmdID", resp.ID),
		zap.String("type", resp.Type),
		zap.String("status", resp.Status))

	// 根据指令类型处理响应
	switch resp.Type {
	case "vps_audit":
		return s.handleVPSAuditResponse(ctx, agentID, resp)
	default:
		s.logger.Warn("unknown command type", zap.String("type", resp.Type))
		return nil
	}
}

// handleVPSAuditResponse 处理VPS审计响应
func (s *AgentService) handleVPSAuditResponse(ctx context.Context, agentID string, resp *protocol.CommandResponse) error {
	if resp.Status == "error" {
		s.logger.Error("vps audit failed",
			zap.String("agentID", agentID),
			zap.String("error", resp.Error))
		return nil
	}

	if resp.Status == "running" {
		s.logger.Info("vps audit is running", zap.String("agentID", agentID))
		return nil
	}

	if resp.Status == "success" {
		// 解析审计结果
		var auditResult protocol.VPSAuditResult
		if err := json.Unmarshal([]byte(resp.Result), &auditResult); err != nil {
			s.logger.Error("failed to parse audit result", zap.Error(err))
			return err
		}

		// 存储审计结果
		return s.SaveAuditResult(ctx, agentID, &auditResult)
	}

	return nil
}

// SaveAuditResult 保存审计结果
func (s *AgentService) SaveAuditResult(ctx context.Context, agentID string, result *protocol.VPSAuditResult) error {
	// 将结果序列化为JSON存储
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return err
	}

	auditRecord := &models.AuditResult{
		AgentID:   agentID,
		Type:      "vps_audit",
		Result:    string(resultJSON),
		StartTime: result.StartTime,
		EndTime:   result.EndTime,
		CreatedAt: time.Now().UnixMilli(),
	}

	// 保存到数据库
	if err := s.AgentRepo.SaveAuditResult(ctx, auditRecord); err != nil {
		return err
	}

	s.logger.Info("审计结果保存成功",
		zap.String("agentId", agentID),
		zap.Int64("auditId", auditRecord.ID),
	)

	return nil
}

// GetAuditResult 获取最新的审计结果(原始数据)
func (s *AgentService) GetAuditResult(ctx context.Context, agentID string) (*protocol.VPSAuditResult, error) {
	record, err := s.AgentRepo.GetLatestAuditResultByType(ctx, agentID, "vps_audit")
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	var result protocol.VPSAuditResult
	if err := json.Unmarshal([]byte(record.Result), &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ListAuditResults 获取审计结果列表
func (s *AgentService) ListAuditResults(ctx context.Context, agentID string) ([]map[string]interface{}, error) {
	records, err := s.AgentRepo.ListAuditResults(ctx, agentID)
	if err != nil {
		return nil, err
	}

	results := make([]map[string]interface{}, 0, len(records))
	for _, record := range records {
		var auditResult protocol.VPSAuditResult
		if err := json.Unmarshal([]byte(record.Result), &auditResult); err != nil {
			s.logger.Error("failed to parse audit result", zap.Error(err))
			continue
		}

		// TODO: 统计安全检查结果应该来自 Server 端分析后的 VPSAuditAnalysis
		// Agent 端已经不再产生 SecurityChecks,需要实现 Server 端分析逻辑

		results = append(results, map[string]interface{}{
			"id":          record.ID,
			"agentId":     record.AgentID,
			"type":        record.Type,
			"startTime":   record.StartTime,
			"endTime":     record.EndTime,
			"createdAt":   record.CreatedAt,
			"systemInfo":  auditResult.SystemInfo,
			"statistics":  auditResult.Statistics,
			"collectTime": auditResult.EndTime - auditResult.StartTime,
		})
	}

	return results, nil
}

// GetStatistics 获取探针统计数据
func (s *AgentService) GetStatistics(ctx context.Context) (map[string]interface{}, error) {
	total, online, err := s.AgentRepo.GetStatistics(ctx)
	if err != nil {
		return nil, err
	}

	offline := total - online
	onlineRate := 0.0
	if total > 0 {
		onlineRate = float64(online) / float64(total) * 100
	}

	return map[string]interface{}{
		"total":      total,
		"online":     online,
		"offline":    offline,
		"onlineRate": onlineRate,
	}, nil
}

// GetLatestMonitorMetrics 获取最新的监控指标
func (s *AgentService) GetLatestMonitorMetrics(ctx context.Context, agentID string) ([]models.MonitorMetric, error) {
	return s.metricRepo.GetLatestMonitorMetrics(ctx, agentID)
}

// GetMonitorMetrics 获取监控指标历史数据
func (s *AgentService) GetMonitorMetrics(ctx context.Context, agentID, monitorName string, start, end int64) ([]models.MonitorMetric, error) {
	return s.metricRepo.GetMonitorMetrics(ctx, agentID, monitorName, start, end)
}

// GetMonitorMetricsByName 获取指定监控项的历史数据
func (s *AgentService) GetMonitorMetricsByName(ctx context.Context, agentID, monitorName string, start, end int64, limit int) ([]models.MonitorMetric, error) {
	return s.metricRepo.GetMonitorMetricsByName(ctx, agentID, monitorName, start, end, limit)
}

// DeleteAgent 删除探针及其所有相关数据
func (s *AgentService) DeleteAgent(ctx context.Context, agentID string) error {
	// 在事务中执行所有删除操作
	return s.Transaction(ctx, func(ctx context.Context) error {
		// 1. 删除探针的所有指标数据
		if err := s.metricRepo.DeleteAgentMetrics(ctx, agentID); err != nil {
			s.logger.Error("删除探针指标数据失败", zap.String("agentId", agentID), zap.Error(err))
			return err
		}

		// 2. 删除探针的监控统计数据
		if err := s.monitorStatsRepo.DeleteByAgentId(ctx, agentID); err != nil {
			s.logger.Error("删除探针监控统计数据失败", zap.String("agentId", agentID), zap.Error(err))
			return err
		}

		// 3. 删除探针的审计结果
		if err := s.AgentRepo.DeleteAuditResults(ctx, agentID); err != nil {
			s.logger.Error("删除探针审计结果失败", zap.String("agentId", agentID), zap.Error(err))
			return err
		}

		// 4. 最后删除探针本身
		if err := s.AgentRepo.DeleteById(ctx, agentID); err != nil {
			s.logger.Error("删除探针失败", zap.String("agentId", agentID), zap.Error(err))
			return err
		}

		s.logger.Info("探针删除成功", zap.String("agentId", agentID))
		return nil
	})
}

// ListByAuth 根据认证状态列出探针（已登录返回全部，未登录返回公开可见）
func (s *AgentService) ListByAuth(ctx context.Context, isAuthenticated bool) ([]models.Agent, error) {
	if isAuthenticated {
		return s.AgentRepo.FindAll(ctx)
	}
	return s.AgentRepo.FindPublicAgents(ctx)
}

// GetAgentByAuth 根据认证状态获取探针（已登录返回全部，未登录返回公开可见）
func (s *AgentService) GetAgentByAuth(ctx context.Context, id string, isAuthenticated bool) (*models.Agent, error) {
	if isAuthenticated {
		agent, err := s.AgentRepo.FindById(ctx, id)
		if err != nil {
			return nil, err
		}
		return &agent, nil
	}
	return s.AgentRepo.FindPublicAgentByID(ctx, id)
}

// GetAllTags 获取所有探针的标签
func (s *AgentService) GetAllTags(ctx context.Context) ([]string, error) {
	return s.AgentRepo.GetAllTags(ctx)
}

func (s *AgentService) InitStatus(ctx context.Context) error {
	agents, err := s.AgentRepo.FindAll(ctx)
	if err != nil {
		return err
	}
	for _, agent := range agents {
		if err := s.AgentRepo.UpdateStatus(ctx, agent.ID, 0, 0); err != nil {
			return err
		}
	}
	return nil
}
