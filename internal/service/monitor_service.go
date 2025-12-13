package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/dushixiang/pika/internal/metric"
	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/repo"
	ws "github.com/dushixiang/pika/internal/websocket"
	"github.com/go-orz/cache"
	"github.com/go-orz/orz"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type MonitorService struct {
	logger *zap.Logger
	*repo.MonitorRepo
	*orz.Service
	agentRepo     *repo.AgentRepo
	metricRepo    *repo.MetricRepo
	metricService *MetricService
	wsManager     *ws.Manager

	// 监控概览缓存：缓存监控任务列表（使用不同的 key 区分 public 和 private）
	overviewCache cache.Cache[string, []metric.PublicMonitorOverview]

	// 调度器引用（用于动态管理任务）
	scheduler MonitorScheduler
}

// MonitorScheduler 调度器接口（避免循环依赖）
type MonitorScheduler interface {
	AddTask(monitorID string, interval int) error
	UpdateTask(monitorID string, interval int) error
	RemoveTask(monitorID string)
}

func NewMonitorService(logger *zap.Logger, db *gorm.DB, metricService *MetricService, wsManager *ws.Manager) *MonitorService {
	return &MonitorService{
		logger:        logger,
		Service:       orz.NewService(db),
		MonitorRepo:   repo.NewMonitorRepo(db),
		agentRepo:     repo.NewAgentRepo(db),
		metricRepo:    repo.NewMetricRepo(db),
		metricService: metricService,
		wsManager:     wsManager,

		// 缓存 5 分钟，避免频繁查询
		overviewCache: cache.New[string, []metric.PublicMonitorOverview](5 * time.Minute),
	}
}

// SetScheduler 设置调度器（由外部注入，避免循环依赖）
func (s *MonitorService) SetScheduler(scheduler MonitorScheduler) {
	s.scheduler = scheduler
}

type MonitorTaskRequest struct {
	Name             string                     `json:"name"`
	Type             string                     `json:"type"`
	Target           string                     `json:"target"`
	Description      string                     `json:"description"`
	Enabled          bool                       `json:"enabled,omitempty"`
	ShowTargetPublic bool                       `json:"showTargetPublic,omitempty"` // 在公开页面是否显示目标地址
	Visibility       string                     `json:"visibility,omitempty"`       // 可见性: public-匿名可见, private-登录可见
	Interval         int                        `json:"interval"`                   // 检测频率（秒）
	HTTPConfig       protocol.HTTPMonitorConfig `json:"httpConfig,omitempty"`
	TCPConfig        protocol.TCPMonitorConfig  `json:"tcpConfig,omitempty"`
	ICMPConfig       protocol.ICMPMonitorConfig `json:"icmpConfig,omitempty"`
	AgentIds         []string                   `json:"agentIds,omitempty"`
	Tags             []string                   `json:"tags"`
}

func (s *MonitorService) CreateMonitor(ctx context.Context, req *MonitorTaskRequest) (*models.MonitorTask, error) {
	// 设置默认检测频率
	interval := req.Interval
	if interval <= 0 {
		interval = 60 // 默认 60 秒
	}

	// 设置默认可见性
	visibility := req.Visibility
	if visibility == "" {
		visibility = "public" // 默认公开可见
	}

	task := &models.MonitorTask{
		ID:               uuid.NewString(),
		Name:             strings.TrimSpace(req.Name),
		Type:             req.Type,
		Target:           strings.TrimSpace(req.Target),
		Description:      req.Description,
		Enabled:          req.Enabled,
		ShowTargetPublic: req.ShowTargetPublic,
		Visibility:       visibility,
		Interval:         interval,
		AgentIds:         datatypes.JSONSlice[string](req.AgentIds),
		Tags:             datatypes.JSONSlice[string](req.Tags),
		HTTPConfig:       datatypes.NewJSONType(req.HTTPConfig),
		TCPConfig:        datatypes.NewJSONType(req.TCPConfig),
		ICMPConfig:       datatypes.NewJSONType(req.ICMPConfig),
		CreatedAt:        0,
		UpdatedAt:        0,
	}

	if err := s.MonitorRepo.Create(ctx, task); err != nil {
		return nil, err
	}

	// 清理缓存
	s.clearCache(task.ID)

	// 如果任务启用，添加到调度器
	if task.Enabled && s.scheduler != nil {
		if err := s.scheduler.AddTask(task.ID, task.Interval); err != nil {
			s.logger.Error("添加监控任务到调度器失败",
				zap.String("taskID", task.ID),
				zap.Error(err))
		}
	}

	return task, nil
}

func (s *MonitorService) UpdateMonitor(ctx context.Context, id string, req *MonitorTaskRequest) (*models.MonitorTask, error) {
	task, err := s.MonitorRepo.FindById(ctx, id)
	if err != nil {
		return nil, err
	}

	// 记录旧状态，用于判断是否需要更新调度器
	oldEnabled := task.Enabled
	oldInterval := task.Interval

	task.Enabled = req.Enabled
	task.Name = strings.TrimSpace(req.Name)
	task.Type = req.Type
	task.Target = strings.TrimSpace(req.Target)
	task.Description = req.Description
	task.ShowTargetPublic = req.ShowTargetPublic
	task.Visibility = req.Visibility
	task.Tags = req.Tags

	// 更新检测频率
	interval := req.Interval
	if interval <= 0 {
		interval = 60 // 默认 60 秒
	}
	task.Interval = interval

	task.AgentIds = req.AgentIds
	task.HTTPConfig = datatypes.NewJSONType(req.HTTPConfig)
	task.TCPConfig = datatypes.NewJSONType(req.TCPConfig)
	task.ICMPConfig = datatypes.NewJSONType(req.ICMPConfig)

	if err := s.MonitorRepo.Save(ctx, &task); err != nil {
		return nil, err
	}

	// 清理缓存
	s.clearCache(task.ID)

	// 更新调度器
	if s.scheduler != nil {
		// 如果从禁用变为启用，或者间隔时间改变
		if !oldEnabled && task.Enabled {
			// 添加任务到调度器
			if err := s.scheduler.AddTask(task.ID, task.Interval); err != nil {
				s.logger.Error("添加监控任务到调度器失败",
					zap.String("taskID", task.ID),
					zap.Error(err))
			}
		} else if oldEnabled && !task.Enabled {
			// 从调度器中移除任务
			s.scheduler.RemoveTask(task.ID)
		} else if task.Enabled && oldInterval != task.Interval {
			// 更新任务间隔
			if err := s.scheduler.UpdateTask(task.ID, task.Interval); err != nil {
				s.logger.Error("更新监控任务调度器失败",
					zap.String("taskID", task.ID),
					zap.Error(err))
			}
		}
	}

	return &task, nil
}

func (s *MonitorService) DeleteMonitor(ctx context.Context, id string) error {
	err := s.Transaction(ctx, func(ctx context.Context) error {
		// 删除监控任务
		if err := s.MonitorRepo.DeleteById(ctx, id); err != nil {
			return err
		}

		// 删除监控指标数据（从 VictoriaMetrics）
		if err := s.metricService.DeleteMonitorMetrics(ctx, id); err != nil {
			s.logger.Error("删除监控指标数据失败", zap.String("monitorId", id), zap.Error(err))
			return err
		}

		return nil
	})

	if err != nil {
		return err
	}

	// 清理缓存
	s.clearCache(id)

	// 从调度器中移除
	if s.scheduler != nil {
		s.scheduler.RemoveTask(id)
	}

	return nil
}

// ListByAuth 返回公开展示所需的监控配置和汇总统计
func (s *MonitorService) ListByAuth(ctx context.Context, isAuthenticated bool) ([]metric.PublicMonitorOverview, error) {
	// 构建缓存键：根据认证状态使用不同的 key
	cacheKey := "overview:public"
	if isAuthenticated {
		cacheKey = "overview:private"
	}

	// 尝试从缓存获取
	if cachedResult, ok := s.overviewCache.Get(cacheKey); ok {
		return cachedResult, nil
	}

	// 缓存未命中，查询数据库
	// 获取符合权限的监控任务列表
	monitors, err := s.FindByAuth(ctx, isAuthenticated)
	if err != nil {
		return nil, err
	}

	if len(monitors) == 0 {
		var emptyResult []metric.PublicMonitorOverview
		// 缓存空结果
		s.overviewCache.Set(cacheKey, emptyResult, 5*time.Minute)
		return emptyResult, nil
	}

	// 构建监控概览列表
	items := make([]metric.PublicMonitorOverview, 0, len(monitors))
	for _, monitor := range monitors {
		// 查询统计数据
		stats := s.metricService.GetMonitorStats(monitor.ID)
		// 构建监控概览对象
		item := s.buildMonitorOverview(monitor, stats)
		items = append(items, item)
	}

	// 缓存结果
	s.overviewCache.Set(cacheKey, items, 5*time.Minute)

	return items, nil
}

// buildMonitorOverview 构建监控概览对象
func (s *MonitorService) buildMonitorOverview(monitor models.MonitorTask, stats *metric.MonitorStatsResult) metric.PublicMonitorOverview {
	// 根据 ShowTargetPublic 字段决定是否返回真实的 Target
	target := monitor.Target
	if !monitor.ShowTargetPublic {
		target = "******"
	}

	return metric.PublicMonitorOverview{
		ID:               monitor.ID,
		Name:             monitor.Name,
		Type:             monitor.Type,
		Target:           target,
		ShowTargetPublic: monitor.ShowTargetPublic,
		Description:      monitor.Description,
		Enabled:          monitor.Enabled,
		Interval:         monitor.Interval,
		AgentCount:       stats.AgentCount,
		Status:           stats.Status,
		ResponseTime:     stats.ResponseTime,
		CertExpiryTime:   stats.CertExpiryTime,
		CertDaysLeft:     stats.CertDaysLeft,
		LastCheckTime:    stats.LastCheckTime,
	}
}

// resolveTargetAgents 计算监控任务对应的目标探针范围
// 规则：
// 1. 如果既没有指定 AgentIds 也没有指定 Tags，返回所有传入的探针（全部节点）
// 2. 如果指定了 AgentIds 或 Tags（或两者都指定），则返回匹配的探针（自动去重）
//   - AgentIds: 直接匹配探针 ID
//   - Tags: 匹配探针标签中包含任意一个指定标签的探针
//   - 两者结果取并集
func (s *MonitorService) resolveTargetAgents(monitor models.MonitorTask, availableAgents []models.Agent) []models.Agent {
	// 如果既没有指定 AgentIds 也没有指定 Tags，使用所有可用探针
	if len(monitor.AgentIds) == 0 && len(monitor.Tags) == 0 {
		return availableAgents
	}

	// 使用 map 来去重
	targetAgentIDSet := make(map[string]struct{})

	// 1. 处理通过 AgentIds 指定的探针
	if len(monitor.AgentIds) > 0 {
		for _, agentID := range monitor.AgentIds {
			targetAgentIDSet[agentID] = struct{}{}
		}
	}

	// 2. 处理通过 Tags 指定的探针
	if len(monitor.Tags) > 0 {
		for _, agent := range availableAgents {
			if agent.Tags != nil && len(agent.Tags) > 0 {
				// 检查探针的标签中是否包含任何一个指定的标签
				for _, agentTag := range agent.Tags {
					for _, monitorTag := range monitor.Tags {
						if agentTag == monitorTag {
							targetAgentIDSet[agent.ID] = struct{}{}
							break
						}
					}
				}
			}
		}
	}

	// 3. 根据去重后的 ID 集合筛选探针
	targetAgents := make([]models.Agent, 0, len(targetAgentIDSet))
	for _, agent := range availableAgents {
		if _, ok := targetAgentIDSet[agent.ID]; ok {
			targetAgents = append(targetAgents, agent)
		}
	}

	return targetAgents
}

// sendMonitorConfigToAgent 向指定探针发送监控配置（内部方法）
func (s *MonitorService) sendMonitorConfigToAgent(agentID string, payload protocol.MonitorConfigPayload) error {
	msgData, err := json.Marshal(protocol.OutboundMessage{
		Type: protocol.MessageTypeMonitorConfig,
		Data: payload,
	})
	if err != nil {
		return err
	}

	return s.wsManager.SendToClient(agentID, msgData)
}

// SendMonitorTaskToAgents 向指定探针发送单个监控任务（公开方法）
func (s *MonitorService) SendMonitorTaskToAgents(ctx context.Context, monitor models.MonitorTask) error {
	// 实时获取所有在线探针，避免依赖数据库状态
	onlineIDs := s.wsManager.GetAllClients()
	if len(onlineIDs) == 0 {
		return nil
	}

	// 查询在线探针的详细信息
	onlineAgents, err := s.agentRepo.ListByIDs(ctx, onlineIDs)
	if err != nil {
		s.logger.Error("获取在线探针信息失败", zap.Error(err))
		return err
	}
	if len(onlineAgents) == 0 {
		return nil
	}

	// 使用统一的方法计算目标探针
	targetAgents := s.resolveTargetAgents(monitor, onlineAgents)
	if len(targetAgents) == 0 {
		return nil
	}

	// 构建监控项
	item := protocol.MonitorItem{
		ID:     monitor.ID,
		Type:   monitor.Type,
		Target: monitor.Target,
	}

	if monitor.Type == "http" || monitor.Type == "https" {
		var httpConfig protocol.HTTPMonitorConfig
		if err := monitor.HTTPConfig.Scan(&httpConfig); err == nil {
			item.HTTPConfig = &httpConfig
		}
	} else if monitor.Type == "tcp" {
		var tcpConfig protocol.TCPMonitorConfig
		if err := monitor.TCPConfig.Scan(&tcpConfig); err == nil {
			item.TCPConfig = &tcpConfig
		}
	} else if monitor.Type == "icmp" || monitor.Type == "ping" {
		var icmpConfig protocol.ICMPMonitorConfig
		if err := monitor.ICMPConfig.Scan(&icmpConfig); err == nil {
			item.ICMPConfig = &icmpConfig
		}
	}

	// 构建 payload
	payload := protocol.MonitorConfigPayload{
		Interval: 0,
		Items:    []protocol.MonitorItem{item},
	}

	// 向每个目标探针发送
	for _, agent := range targetAgents {
		if err := s.sendMonitorConfigToAgent(agent.ID, payload); err != nil {
			s.logger.Error("发送监控配置失败",
				zap.String("taskID", monitor.ID),
				zap.String("taskName", monitor.Name),
				zap.String("agentID", agent.ID),
				zap.Error(err))
		}
	}

	return nil
}

// GetMonitorStatsByID 获取监控任务的统计数据（聚合后的单个监控详情）
func (s *MonitorService) GetMonitorStatsByID(ctx context.Context, monitorID string) (*metric.PublicMonitorOverview, error) {
	// 查询监控任务
	monitor, err := s.MonitorRepo.FindById(ctx, monitorID)
	if err != nil {
		return nil, err
	}

	// 查询统计数据
	stats := s.metricService.GetMonitorStats(monitorID)
	// 构建监控概览对象
	overview := s.buildMonitorOverview(monitor, stats)

	return &overview, nil
}

// GetMonitorHistory 获取监控任务的历史时序数据
// 直接返回 VictoriaMetrics 的原始时序数据，包含所有探针的独立序列
// 支持时间范围：15m, 30m, 1h, 3h, 6h, 12h, 1d, 3d, 7d
func (s *MonitorService) GetMonitorHistory(ctx context.Context, monitorID, timeRange string) (*metric.GetMetricsResponse, error) {
	// 计算时间范围
	var duration time.Duration
	switch timeRange {
	case "15m":
		duration = 15 * time.Minute
	case "30m":
		duration = 30 * time.Minute
	case "1h":
		duration = 1 * time.Hour
	case "3h":
		duration = 3 * time.Hour
	case "6h":
		duration = 6 * time.Hour
	case "12h":
		duration = 12 * time.Hour
	case "1d", "24h":
		duration = 24 * time.Hour
	case "3d":
		duration = 3 * 24 * time.Hour
	case "7d":
		duration = 7 * 24 * time.Hour
	default:
		duration = 15 * time.Minute
	}

	now := time.Now()
	end := now.UnixMilli()
	start := now.Add(-duration).UnixMilli()

	// 直接返回 VictoriaMetrics 查询结果，无需任何转换
	return s.metricService.GetMonitorHistory(ctx, monitorID, start, end)
}

// GetMonitorByAuth 根据认证状态获取监控任务（已登录返回全部，未登录返回公开可见）
func (s *MonitorService) GetMonitorByAuth(ctx context.Context, id string, isAuthenticated bool) (*models.MonitorTask, error) {
	if isAuthenticated {
		monitor, err := s.MonitorRepo.FindById(ctx, id)
		if err != nil {
			return nil, err
		}
		if !monitor.Enabled {
			return nil, fmt.Errorf("monitor is disabled")
		}
		return &monitor, nil
	}
	monitor, err := s.MonitorRepo.FindPublicMonitorByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if !monitor.Enabled {
		return nil, fmt.Errorf("monitor is disabled")
	}
	return monitor, nil
}

// clearCache 清理监控任务相关的所有缓存
func (s *MonitorService) clearCache(monitorID string) {
	// 清理概览缓存
	s.overviewCache.Delete("overview:public")
	s.overviewCache.Delete("overview:private")
}

// GetLatestMonitorMetricsByType 获取指定类型的最新监控指标（用于告警检查）
func (s *MonitorService) GetLatestMonitorMetricsByType(ctx context.Context, monitorType string) ([]protocol.MonitorData, error) {
	// 查询数据库
	monitorTasks, err := s.FindByEnabledAndType(ctx, true, monitorType)
	if err != nil {
		return nil, err
	}

	// 在缓存中查询最新的监控数据
	var result []protocol.MonitorData
	for _, task := range monitorTasks {
		monitorData := s.metricService.GetMonitorAgentStats(task.ID)
		result = append(result, monitorData...)
	}

	return result, nil
}

// GetAllLatestMonitorMetrics 获取所有最新监控指标（用于告警检查）
func (s *MonitorService) GetAllLatestMonitorMetrics(ctx context.Context) ([]protocol.MonitorData, error) {
	// 查询所有最新的监控状态
	monitorTasks, err := s.FindByEnabled(ctx, true)
	if err != nil {
		return nil, err
	}

	// 在缓存中查询最新的监控数据
	var result []protocol.MonitorData
	for _, task := range monitorTasks {
		monitorData := s.metricService.GetMonitorAgentStats(task.ID)
		result = append(result, monitorData...)
	}
	return result, nil
}
