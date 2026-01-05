package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/repo"
	"github.com/go-orz/orz"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type AgentService struct {
	logger *zap.Logger
	*orz.Service
	AgentRepo     *repo.AgentRepo
	apiKeyService *ApiKeyService
	metricService *MetricService
	geoipService  *GeoIPService
}

func NewAgentService(logger *zap.Logger, db *gorm.DB, apiKeyService *ApiKeyService, metricService *MetricService, geoipService *GeoIPService) *AgentService {
	return &AgentService{
		logger:        logger,
		Service:       orz.NewService(db),
		AgentRepo:     repo.NewAgentRepo(db),
		apiKeyService: apiKeyService,
		metricService: metricService,
		geoipService:  geoipService,
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
	// 为登录记录添加 IP 归属地信息
	s.enrichLoginRecordsWithLocation(result)

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

// enrichLoginRecordsWithLocation 为登录记录添加IP归属地信息
func (s *AgentService) enrichLoginRecordsWithLocation(result *protocol.VPSAuditResult) {
	if s.geoipService == nil {
		return
	}

	// 处理成功登录记录
	if result.AssetInventory.LoginAssets != nil {
		for i := range result.AssetInventory.LoginAssets.SuccessfulLogins {
			if result.AssetInventory.LoginAssets.SuccessfulLogins[i].IP != "" {
				location := s.geoipService.LookupIP(result.AssetInventory.LoginAssets.SuccessfulLogins[i].IP)
				result.AssetInventory.LoginAssets.SuccessfulLogins[i].Location = location
			}
		}

		// 处理失败登录记录
		for i := range result.AssetInventory.LoginAssets.FailedLogins {
			if result.AssetInventory.LoginAssets.FailedLogins[i].IP != "" {
				location := s.geoipService.LookupIP(result.AssetInventory.LoginAssets.FailedLogins[i].IP)
				result.AssetInventory.LoginAssets.FailedLogins[i].Location = location
			}
		}

		// 处理当前登录会话
		for i := range result.AssetInventory.LoginAssets.CurrentSessions {
			if result.AssetInventory.LoginAssets.CurrentSessions[i].IP != "" {
				location := s.geoipService.LookupIP(result.AssetInventory.LoginAssets.CurrentSessions[i].IP)
				result.AssetInventory.LoginAssets.CurrentSessions[i].Location = location
			}
		}
	}

	// 处理用户资产中的当前登录
	if result.AssetInventory.UserAssets != nil && result.AssetInventory.UserAssets.CurrentLogins != nil {
		for i := range result.AssetInventory.UserAssets.CurrentLogins {
			if result.AssetInventory.UserAssets.CurrentLogins[i].IP != "" {
				location := s.geoipService.LookupIP(result.AssetInventory.UserAssets.CurrentLogins[i].IP)
				result.AssetInventory.UserAssets.CurrentLogins[i].Location = location
			}
		}
	}
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

// DeleteAgent 删除探针及其所有相关数据
func (s *AgentService) DeleteAgent(ctx context.Context, agentID string) error {
	// 在事务中执行所有删除操作
	return s.Transaction(ctx, func(ctx context.Context) error {
		// 1. 删除探针的所有指标数据
		if err := s.metricService.DeleteAgentMetrics(ctx, agentID); err != nil {
			s.logger.Error("删除探针指标数据失败", zap.String("agentId", agentID), zap.Error(err))
			return err
		}

		// 2. 删除探针的审计结果
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
	tags, err := s.AgentRepo.GetAllTags(ctx)
	if err != nil {
		return nil, err
	}
	// 排序
	sort.Strings(tags)
	return tags, nil
}

// BatchUpdateTags 批量更新探针标签
// operation: "add" 添加标签, "remove" 移除标签, "replace" 替换标签
func (s *AgentService) BatchUpdateTags(ctx context.Context, agentIDs []string, tags []string, operation string) error {
	if len(agentIDs) == 0 {
		return fmt.Errorf("探针ID列表不能为空")
	}

	if operation == "" {
		operation = "replace"
	}

	agents, err := s.AgentRepo.FindByIdIn(ctx, agentIDs)
	if err != nil {
		return err
	}

	// 在事务中执行批量更新
	return s.Transaction(ctx, func(ctx context.Context) error {
		for _, agent := range agents {
			// 根据操作类型处理标签
			var newTags []string
			switch operation {
			case "add":
				// 添加标签（去重）
				existingTagsMap := make(map[string]bool)
				for _, tag := range agent.Tags {
					existingTagsMap[tag] = true
				}
				newTags = append([]string{}, agent.Tags...)
				for _, tag := range tags {
					if !existingTagsMap[tag] {
						newTags = append(newTags, tag)
					}
				}
			case "remove":
				// 移除标签
				removeTagsMap := make(map[string]bool)
				for _, tag := range tags {
					removeTagsMap[tag] = true
				}
				for _, tag := range agent.Tags {
					if !removeTagsMap[tag] {
						newTags = append(newTags, tag)
					}
				}
			case "replace":
				// 替换标签
				newTags = tags
			default:
				return fmt.Errorf("不支持的操作类型: %s", operation)
			}

			// 更新探针标签
			agent.Tags = newTags
			agent.UpdatedAt = time.Now().UnixMilli()
			if err := s.AgentRepo.UpdateById(ctx, &agent); err != nil {
				s.logger.Error("更新探针标签失败", zap.String("agentId", agent.ID), zap.Error(err))
				return err
			}

			s.logger.Info("探针标签更新成功",
				zap.String("agentId", agent.ID),
				zap.String("operation", operation),
				zap.Strings("tags", newTags))
		}
		return nil
	})
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

// UpdateTrafficConfig 更新流量配置
func (s *AgentService) UpdateTrafficConfig(ctx context.Context, agentID string, limit uint64, resetDay int) error {
	if resetDay < 0 || resetDay > 31 {
		return fmt.Errorf("重置日期必须在0-31之间")
	}

	agent, err := s.AgentRepo.FindById(ctx, agentID)
	if err != nil {
		return err
	}

	now := time.Now().UnixMilli()
	stats := agent.TrafficStats.Data()
	oldResetDay := stats.ResetDay

	stats.Limit = limit
	stats.ResetDay = resetDay

	// 如果是首次设置或修改重置日期,重置流量统计
	if stats.PeriodStart == 0 || resetDay != oldResetDay {
		stats.Used = 0
		stats.PeriodStart = now
		stats.BaselineRecv = 0 // 下次上报时会设置正确的基线
		stats.AlertSent80 = false
		stats.AlertSent90 = false
		stats.AlertSent100 = false
	}

	agent.TrafficStats = datatypes.NewJSONType(stats)
	agent.UpdatedAt = now
	return s.AgentRepo.UpdateById(ctx, &agent)
}

// GetTrafficStats 获取流量统计信息
func (s *AgentService) GetTrafficStats(ctx context.Context, agentID string) (*TrafficStats, error) {
	agent, err := s.AgentRepo.FindById(ctx, agentID)
	if err != nil {
		return nil, err
	}

	trafficData := agent.TrafficStats.Data()

	stats := &TrafficStats{
		TrafficLimit:    trafficData.Limit,
		TrafficUsed:     trafficData.Used,
		TrafficResetDay: trafficData.ResetDay,
		PeriodStart:     trafficData.PeriodStart,
		AlertsSent: TrafficAlerts{
			Sent80:  trafficData.AlertSent80,
			Sent90:  trafficData.AlertSent90,
			Sent100: trafficData.AlertSent100,
		},
	}

	// 计算使用百分比
	if trafficData.Limit > 0 {
		stats.TrafficUsedPercent = float64(trafficData.Used) / float64(trafficData.Limit) * 100
		if trafficData.Used < trafficData.Limit {
			stats.TrafficRemaining = trafficData.Limit - trafficData.Used
		} else {
			stats.TrafficRemaining = 0
		}
	}

	// 计算下次重置日期和剩余天数
	if trafficData.ResetDay > 0 && trafficData.PeriodStart > 0 {
		periodStart := time.UnixMilli(trafficData.PeriodStart)
		nextReset := calculateNextResetDate(periodStart, trafficData.ResetDay)
		stats.PeriodEnd = nextReset.UnixMilli()
		stats.DaysUntilReset = int(time.Until(nextReset).Hours() / 24)
		if stats.DaysUntilReset < 0 {
			stats.DaysUntilReset = 0
		}
	}

	return stats, nil
}

// ResetAgentTraffic 重置探针流量
func (s *AgentService) ResetAgentTraffic(ctx context.Context, agentID string) error {
	agent, err := s.AgentRepo.FindById(ctx, agentID)
	if err != nil {
		return err
	}

	now := time.Now().UnixMilli()
	stats := agent.TrafficStats.Data()

	stats.Used = 0
	stats.BaselineRecv = 0 // 下次上报时会设置正确的基线
	stats.PeriodStart = now
	stats.AlertSent80 = false
	stats.AlertSent90 = false
	stats.AlertSent100 = false

	agent.TrafficStats = datatypes.NewJSONType(stats)
	agent.UpdatedAt = now

	s.logger.Info("探针流量已重置",
		zap.String("agentId", agentID),
		zap.String("agentName", agent.Name))

	return s.AgentRepo.UpdateById(ctx, &agent)
}

// CheckAndResetTraffic 检查并重置所有到期的探针流量(定时任务调用)
func (s *AgentService) CheckAndResetTraffic(ctx context.Context) error {
	agents, err := s.AgentRepo.FindAgentsWithTrafficReset(ctx)
	if err != nil {
		return err
	}

	now := time.Now()
	resetCount := 0

	for _, agent := range agents {
		if s.shouldResetTraffic(&agent, now) {
			if err := s.ResetAgentTraffic(ctx, agent.ID); err != nil {
				s.logger.Error("重置探针流量失败",
					zap.String("agentId", agent.ID),
					zap.Error(err))
				continue
			}
			resetCount++
		}
	}

	if resetCount > 0 {
		s.logger.Info("流量重置检查完成", zap.Int("重置数量", resetCount))
	}

	return nil
}

// shouldResetTraffic 判断是否需要重置流量
func (s *AgentService) shouldResetTraffic(agent *models.Agent, now time.Time) bool {
	stats := agent.TrafficStats.Data()
	if stats.ResetDay == 0 || stats.PeriodStart == 0 {
		return false
	}

	periodStart := time.UnixMilli(stats.PeriodStart)
	nextReset := calculateNextResetDate(periodStart, stats.ResetDay)

	return now.After(nextReset) || now.Equal(nextReset)
}

// calculateNextResetDate 计算下次重置日期
func calculateNextResetDate(periodStart time.Time, resetDay int) time.Time {
	year, month, _ := periodStart.Date()
	location := periodStart.Location()

	// 计算下一个月
	nextMonth := month + 1
	nextYear := year
	if nextMonth > 12 {
		nextMonth = 1
		nextYear++
	}

	// 处理月末日期(如2月没有31号)
	lastDayOfMonth := time.Date(nextYear, nextMonth+1, 0, 0, 0, 0, 0, time.UTC).Day()
	actualDay := resetDay
	if resetDay > lastDayOfMonth {
		actualDay = lastDayOfMonth
	}

	return time.Date(nextYear, nextMonth, actualDay, 0, 0, 0, 0, location)
}

// TrafficStats 流量统计信息
type TrafficStats struct {
	TrafficLimit       uint64        `json:"trafficLimit"`
	TrafficUsed        uint64        `json:"trafficUsed"`
	TrafficUsedPercent float64       `json:"trafficUsedPercent"`
	TrafficRemaining   uint64        `json:"trafficRemaining"`
	TrafficResetDay    int           `json:"trafficResetDay"`
	PeriodStart        int64         `json:"periodStart"`
	PeriodEnd          int64         `json:"periodEnd"`
	DaysUntilReset     int           `json:"daysUntilReset"`
	AlertsSent         TrafficAlerts `json:"alerts"`
}

// TrafficAlerts 流量告警状态
type TrafficAlerts struct {
	Sent80  bool `json:"sent80"`
	Sent90  bool `json:"sent90"`
	Sent100 bool `json:"sent100"`
}
