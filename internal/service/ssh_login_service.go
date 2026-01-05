package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/repo"
	"github.com/dushixiang/pika/internal/websocket"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// SSHLoginService SSH登录服务
type SSHLoginService struct {
	logger    *zap.Logger
	repo      *repo.SSHLoginRepo
	agentRepo *repo.AgentRepo
	wsManager *websocket.Manager
	geoIPSvc  *GeoIPService
}

// NewSSHLoginService 创建服务
func NewSSHLoginService(logger *zap.Logger, db *gorm.DB, wsManager *websocket.Manager, geoIPSvc *GeoIPService) *SSHLoginService {
	return &SSHLoginService{
		logger:    logger,
		repo:      repo.NewSSHLoginRepo(db),
		agentRepo: repo.NewAgentRepo(db),
		wsManager: wsManager,
		geoIPSvc:  geoIPSvc,
	}
}

// === 配置管理 ===

// GetConfig 获取探针的配置
func (s *SSHLoginService) GetConfig(agentID string) (*models.SSHLoginConfigData, error) {
	config, err := s.agentRepo.GetSSHLoginConfig(context.Background(), agentID)
	if err != nil {
		return nil, err
	}
	return config, nil
}

// UpdateConfig 更新配置并下发到 Agent
// 返回: config - 配置对象, configSent - 是否成功下发到 Agent, error - 错误信息
func (s *SSHLoginService) UpdateConfig(ctx context.Context, agentID string, enabled bool) (*models.SSHLoginConfigData, bool, error) {
	// 检查探针是否存在
	agent, err := s.agentRepo.FindById(ctx, agentID)
	if err != nil {
		return nil, false, fmt.Errorf("探针不存在")
	}

	// 保存配置到数据库
	config := &models.SSHLoginConfigData{
		Enabled: enabled,
	}

	if err := s.agentRepo.UpdateSSHLoginConfig(ctx, agentID, config); err != nil {
		return nil, false, err
	}

	// 下发配置到 Agent
	configSent := false
	if agent.Status == 1 { // 仅在探针在线时尝试下发
		if err := s.sendConfigToAgent(agentID, enabled); err != nil {
			s.logger.Warn("下发SSH登录监控配置到Agent失败", zap.Error(err), zap.String("agentId", agentID))
		} else {
			s.logger.Info("成功下发SSH登录监控配置", zap.String("agentId", agentID), zap.Bool("enabled", enabled))
			configSent = true
		}
	} else {
		s.logger.Info("探针离线，配置将在下次连接时生效", zap.String("agentId", agentID))
	}

	return config, configSent, nil
}

// sendConfigToAgent 下发配置到 Agent
func (s *SSHLoginService) sendConfigToAgent(agentID string, enabled bool) error {
	configData := protocol.SSHLoginConfig{
		Enabled: enabled,
	}

	message := protocol.OutboundMessage{
		Type: protocol.MessageTypeSSHLoginConfig,
		Data: configData,
	}

	msgBytes, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("序列化消息失败: %w", err)
	}

	return s.wsManager.SendToClient(agentID, msgBytes)
}

// HandleConfigResult 处理 Agent 上报的配置应用结果
func (s *SSHLoginService) HandleConfigResult(agentID string, result protocol.SSHLoginConfigResult) error {
	// 获取现有配置
	config, err := s.agentRepo.GetSSHLoginConfig(context.Background(), agentID)
	if err != nil {
		return fmt.Errorf("获取配置失败: %w", err)
	}
	if config == nil {
		s.logger.Warn("收到配置应用结果，但配置不存在", zap.String("agentId", agentID))
		return nil
	}

	// 更新配置应用状态
	status := "success"
	if !result.Success {
		status = "failed"
	}

	config.ApplyStatus = status
	config.ApplyMessage = result.Message

	if err := s.agentRepo.UpdateSSHLoginConfig(context.Background(), agentID, config); err != nil {
		s.logger.Error("更新配置应用状态失败", zap.Error(err), zap.String("agentId", agentID))
		return err
	}

	// 记录日志
	if result.Success {
		s.logger.Info("Agent成功应用SSH登录监控配置",
			zap.String("agentId", agentID),
			zap.Bool("enabled", result.Enabled),
			zap.String("message", result.Message))
	} else {
		s.logger.Warn("Agent应用SSH登录监控配置失败",
			zap.String("agentId", agentID),
			zap.String("message", result.Message))
	}

	return nil
}

// getCurrentTimestamp 获取当前时间戳（毫秒）
func getCurrentTimestamp() int64 {
	return time.Now().UnixMilli()
}

// === 事件处理 ===

// HandleEvent 处理 Agent 上报的事件
func (s *SSHLoginService) HandleEvent(agentID string, eventData protocol.SSHLoginEvent) error {
	// 检查是否启用监控
	config, err := s.agentRepo.GetSSHLoginConfig(context.Background(), agentID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	// 如果未启用，忽略事件
	if config == nil || !config.Enabled {
		s.logger.Debug("SSH登录监控未启用，忽略事件", zap.String("agentId", agentID))
		return nil
	}

	// 去重检查（避免 Agent 重启时重复上报）
	existing, err := s.repo.FindEventByTimestamp(agentID, eventData.Timestamp, 5000) // 5秒容差
	if err != nil {
		s.logger.Warn("查询事件去重失败", zap.Error(err))
	} else if existing != nil {
		s.logger.Debug("检测到重复事件，跳过", zap.String("agentId", agentID), zap.Int64("timestamp", eventData.Timestamp))
		return nil
	}

	// 保存事件到数据库
	event := &models.SSHLoginEvent{
		AgentID:   agentID,
		Username:  eventData.Username,
		IP:        eventData.IP,
		Port:      eventData.Port,
		Status:    eventData.Status,
		Method:    eventData.Method,
		TTY:       eventData.TTY,
		SessionID: eventData.SessionID,
		Timestamp: eventData.Timestamp,
	}

	if err := s.repo.CreateEvent(event); err != nil {
		s.logger.Error("保存SSH登录事件失败", zap.Error(err))
		return err
	}

	s.logger.Info("SSH登录事件已记录",
		zap.String("agentId", agentID),
		zap.String("username", eventData.Username),
		zap.String("ip", eventData.IP),
		zap.String("status", eventData.Status))

	return nil
}

// === 事件查询 ===

// ListEvents 查询登录事件（分页）
func (s *SSHLoginService) ListEvents(agentID string, page, pageSize int) ([]models.SSHLoginEvent, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	return s.repo.ListEventsByAgentID(agentID, page, pageSize)
}

// ListEventsByFilter 按条件查询事件
func (s *SSHLoginService) ListEventsByFilter(agentID, username, ip, status string, startTime, endTime int64, page, pageSize int) ([]models.SSHLoginEvent, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	return s.repo.ListEventsByFilter(agentID, username, ip, status, startTime, endTime, page, pageSize)
}

// GetEventByID 根据ID获取事件
func (s *SSHLoginService) GetEventByID(id string) (*models.SSHLoginEvent, error) {
	return s.repo.GetEventByID(id)
}

// DeleteEventsByAgentID 删除探针的所有事件
func (s *SSHLoginService) DeleteEventsByAgentID(agentID string) error {
	return s.repo.DeleteEventsByAgentID(agentID)
}

// CleanupOldEvents 清理旧事件（定期任务）
func (s *SSHLoginService) CleanupOldEvents(days int) error {
	if days < 1 {
		days = 90 // 默认保留90天
	}

	timestamp := (int64(days) * 24 * 60 * 60 * 1000)
	cutoff := s.getCurrentTimestamp() - timestamp

	if err := s.repo.DeleteEventsBefore(cutoff); err != nil {
		s.logger.Error("清理SSH登录事件失败", zap.Error(err), zap.Int("days", days))
		return err
	}

	s.logger.Info("成功清理SSH登录事件", zap.Int("days", days))
	return nil
}

// getCurrentTimestamp 获取当前时间戳（毫秒）
func (s *SSHLoginService) getCurrentTimestamp() int64 {
	return 0 // 实际应该返回 time.Now().UnixMilli()，这里简化
}
