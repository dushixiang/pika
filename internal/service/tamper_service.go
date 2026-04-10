package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/repo"
	"github.com/dushixiang/pika/internal/websocket"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type TamperService struct {
	logger          *zap.Logger
	agentRepo       *repo.AgentRepo
	TamperEventRepo *repo.TamperEventRepo
	wsManager       *websocket.Manager
	notificationSvc *NotificationService
}

func NewTamperService(logger *zap.Logger, db *gorm.DB, wsManager *websocket.Manager, notificationSvc *NotificationService) *TamperService {
	return &TamperService{
		logger:          logger,
		agentRepo:       repo.NewAgentRepo(db),
		TamperEventRepo: repo.NewTamperEventRepo(db),
		wsManager:       wsManager,
		notificationSvc: notificationSvc,
	}
}

// GetConfigByAgentID 获取探针的防篡改配置
func (s *TamperService) GetConfigByAgentID(ctx context.Context, agentID string) (*models.TamperProtectConfigData, error) {
	agent, err := s.agentRepo.FindById(ctx, agentID)
	if err != nil {
		return nil, err
	}
	config := agent.TamperProtectConfig.Data()
	return &config, nil
}

func (s *TamperService) UpdateConfigByAgentID(ctx context.Context, agentID string, config *models.TamperProtectConfigData) error {
	var agentForUpdate = models.Agent{
		ID:                  agentID,
		TamperProtectConfig: datatypes.NewJSONType(*config),
	}
	return s.agentRepo.UpdateById(ctx, &agentForUpdate)
}

// UpdateConfig 更新探针的防篡改配置
func (s *TamperService) UpdateConfig(ctx context.Context, agentID string, req *models.TamperProtectConfigData) error {
	// 查找现有配置
	config, err := s.GetConfigByAgentID(ctx, agentID)
	if err != nil {
		return err
	}

	// 获取旧的路径列表和启用状态用于比对
	var oldPaths []string
	var wasEnabled bool
	if config != nil {
		oldPaths = config.Paths
		wasEnabled = config.Enabled
	}

	var added, removed []string

	// 处理不同的状态转换场景
	if !req.Enabled {
		// 场景1: 禁用防篡改功能，需要移除所有旧的路径配置
		removed = oldPaths
		added = []string{}
		// 注意: 不清空 paths，保留配置以便下次启用时使用
	} else if !wasEnabled {
		// 场景2: 从禁用切换到启用，所有路径都作为新增
		// 因为探针端已经移除了所有监控，需要重新添加
		added = req.Paths
		removed = []string{}
	} else {
		// 场景3: 启用状态下的正常增量更新
		added, removed = s.calculatePathDiff(oldPaths, req.Paths)
	}

	// 创建或更新配置
	newConfig := &models.TamperProtectConfigData{
		Enabled:     req.Enabled,
		Paths:       req.Paths,
		ApplyStatus: "pending",
	}

	// 保存配置到数据库
	if err := s.UpdateConfigByAgentID(ctx, agentID, newConfig); err != nil {
		return err
	}

	go func() {
		// 下发增量配置到探针
		if err := s.sendIncrementalConfigToAgent(agentID, added, removed); err != nil {
			s.logger.Warn("下发防篡改配置到探针失败",
				zap.String("agentId", agentID),
				zap.Strings("added", added),
				zap.Strings("removed", removed),
				zap.Error(err))
			// 不影响配置保存结果，只记录警告
		} else if len(added) > 0 || len(removed) > 0 {
			s.logger.Info("成功下发防篡改配置到探针",
				zap.String("agentId", agentID),
				zap.Strings("added", added),
				zap.Strings("removed", removed),
				zap.Int("totalPaths", len(req.Paths)))
		}
	}()
	return nil
}

// calculatePathDiff 计算路径的新增和移除
func (s *TamperService) calculatePathDiff(oldPaths, newPaths []string) (added, removed []string) {
	// 创建映射用于快速查找
	oldPathMap := make(map[string]bool)
	newPathMap := make(map[string]bool)

	for _, path := range oldPaths {
		oldPathMap[path] = true
	}
	for _, path := range newPaths {
		newPathMap[path] = true
	}

	// 计算新增的路径（在新配置中但不在旧配置中）
	for _, path := range newPaths {
		if !oldPathMap[path] {
			added = append(added, path)
		}
	}

	// 计算移除的路径（在旧配置中但不在新配置中）
	for _, path := range oldPaths {
		if !newPathMap[path] {
			removed = append(removed, path)
		}
	}

	return added, removed
}

// BuildInitialConfig 构建探针初始化时的配置（用于探针连接时）
// 根据 enabled 状态决定发送的内容：
// - enabled=true: 发送所有配置的路径作为新增
// - enabled=false: 发送空配置
func (s *TamperService) BuildInitialConfig(ctx context.Context, agentID string) (added, removed []string, err error) {
	config, err := s.GetConfigByAgentID(ctx, agentID)
	if err != nil {
		return nil, nil, err
	}

	// 如果启用了防篡改，将所有路径作为新增发送
	if config != nil && config.Enabled && len(config.Paths) > 0 {
		return config.Paths, []string{}, nil
	}

	// 未启用或没有配置，返回空
	return []string{}, []string{}, nil
}

// sendIncrementalConfigToAgent 通过WebSocket下发配置到探针（增量更新）
func (s *TamperService) sendIncrementalConfigToAgent(agentID string, added, removed []string) error {
	// 如果没有任何变更，不需要下发
	if len(added) == 0 && len(removed) == 0 {
		return nil
	}

	// 构建增量更新配置消息
	configData := protocol.TamperProtectConfig{
		Added:   added,
		Removed: removed,
	}

	msgBytes, err := json.Marshal(protocol.OutboundMessage{
		Type: protocol.MessageTypeTamperProtect,
		Data: configData,
	})
	if err != nil {
		return err
	}

	// 通过WebSocket管理器发送到探针
	return s.wsManager.SendToClient(agentID, msgBytes)
}

// CreateEvent 创建防篡改事件
func (s *TamperService) CreateEvent(ctx context.Context, agentID string, eventData *protocol.TamperEventData) error {
	event := &models.TamperEvent{
		ID:        uuid.New().String(),
		AgentID:   agentID,
		Path:      eventData.Path,
		Operation: eventData.Operation,
		Details:   eventData.Details,
		Timestamp: eventData.Timestamp,
		CreatedAt: time.Now().UnixMilli(),
	}
	if err := s.TamperEventRepo.Create(ctx, event); err != nil {
		return err
	}

	s.sendTamperEventNotification(ctx, agentID, eventData)
	return nil
}

func (s *TamperService) sendTamperEventNotification(ctx context.Context, agentID string, eventData *protocol.TamperEventData) {
	if s.notificationSvc == nil {
		return
	}

	agent, err := s.agentRepo.FindById(ctx, agentID)
	if err != nil {
		s.logger.Error("获取探针信息失败", zap.String("agentId", agentID), zap.Error(err))
		return
	}

	firedAt := eventData.Timestamp
	if firedAt == 0 {
		firedAt = time.Now().UnixMilli()
	}

	restoredText := "否"
	if eventData.Restored {
		restoredText = "是"
	}

	record := &models.AlertRecord{
		AgentID:     agentID,
		AgentName:   agent.Name,
		AlertType:   "tamper",
		Message:     fmt.Sprintf("防篡改事件：路径 %s，操作 %s，详情 %s，自动恢复 %s", eventData.Path, eventData.Operation, eventData.Details, restoredText),
		Threshold:   0,
		ActualValue: 0,
		Level:       "warning",
		Status:      "notice",
		FiredAt:     firedAt,
		CreatedAt:   firedAt,
	}

	go func(record *models.AlertRecord, agent *models.Agent) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := s.notificationSvc.SendAlertNotification(ctx, NotificationTypeTamperEvt, record, agent); err != nil {
			s.logger.Error("发送防篡改事件通知失败",
				zap.String("agentId", agentID),
				zap.Error(err),
			)
		}
	}(record, &agent)
}

func (s *TamperService) HandleConfigResult(ctx context.Context, agentID string, resp protocol.TamperProtectResponse) error {
	// 获取现有配置
	config, err := s.GetConfigByAgentID(ctx, agentID)
	if err != nil {
		return fmt.Errorf("获取配置失败: %w", err)
	}

	// 更新配置应用状态
	status := "success"
	if !resp.Success {
		status = "failed"
	}

	config.ApplyStatus = status
	config.ApplyMessage = resp.Message

	var agentForUpdate = models.Agent{
		ID:                  agentID,
		TamperProtectConfig: datatypes.NewJSONType(*config),
	}
	// 更新探针配置
	return s.agentRepo.UpdateById(ctx, &agentForUpdate)
}

func (s *TamperService) DeleteEventsByAgentID(ctx context.Context, id string) error {
	return s.TamperEventRepo.DeleteEventsByAgentID(ctx, id)
}
