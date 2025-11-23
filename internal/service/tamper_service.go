package service

import (
	"encoding/json"
	"errors"
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
	logger     *zap.Logger
	tamperRepo *repo.TamperRepo
	wsManager  *websocket.Manager
}

func NewTamperService(logger *zap.Logger, tamperRepo *repo.TamperRepo, wsManager *websocket.Manager) *TamperService {
	return &TamperService{
		logger:     logger,
		tamperRepo: tamperRepo,
		wsManager:  wsManager,
	}
}

// GetConfigByAgentID 获取探针的防篡改配置
func (s *TamperService) GetConfigByAgentID(agentID string) (*models.TamperProtectConfig, error) {
	config, err := s.tamperRepo.GetConfigByAgentID(agentID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil // 没有配置不算错误
		}
		return nil, err
	}
	return config, nil
}

// UpdateConfig 更新探针的防篡改配置
func (s *TamperService) UpdateConfig(agentID string, paths []string) (*models.TamperProtectConfig, error) {
	now := time.Now().UnixMilli()

	// 查找现有配置
	config, err := s.tamperRepo.GetConfigByAgentID(agentID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	// 获取旧的路径列表用于比对
	var oldPaths []string
	if config != nil {
		oldPaths = config.Paths
	}

	// 计算新增和移除的路径
	added, removed := s.calculatePathDiff(oldPaths, paths)

	if config == nil {
		// 创建新配置
		config = &models.TamperProtectConfig{
			ID:        uuid.New().String(),
			AgentID:   agentID,
			Paths:     datatypes.NewJSONSlice(paths),
			CreatedAt: now,
			UpdatedAt: now,
		}
	} else {
		// 更新现有配置
		config.Paths = datatypes.NewJSONSlice(paths)
		config.UpdatedAt = now
	}

	// 保存配置到数据库
	if err := s.tamperRepo.SaveConfig(config); err != nil {
		return nil, err
	}

	// 下发增量配置到探针
	if err := s.sendConfigToAgent(agentID, added, removed); err != nil {
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
			zap.Int("totalPaths", len(paths)))
	}

	return config, nil
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

// sendConfigToAgent 通过WebSocket下发配置到探针（增量更新）
func (s *TamperService) sendConfigToAgent(agentID string, added, removed []string) error {
	// 如果没有任何变更，不需要下发
	if len(added) == 0 && len(removed) == 0 {
		return nil
	}

	// 构建增量更新配置消息
	configData := protocol.TamperProtectConfig{
		Added:   added,
		Removed: removed,
	}

	data, err := json.Marshal(configData)
	if err != nil {
		return err
	}

	msg := protocol.Message{
		Type: protocol.MessageTypeTamperProtect,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	// 通过WebSocket管理器发送到探针
	return s.wsManager.SendToClient(agentID, msgBytes)
}

// DeleteConfig 删除探针的防篡改配置
func (s *TamperService) DeleteConfig(agentID string) error {
	return s.tamperRepo.DeleteConfig(agentID)
}

// CreateEvent 创建防篡改事件
func (s *TamperService) CreateEvent(agentID, path, operation, details string, timestamp int64) error {
	event := &models.TamperEvent{
		ID:        uuid.New().String(),
		AgentID:   agentID,
		Path:      path,
		Operation: operation,
		Details:   details,
		Timestamp: timestamp,
		CreatedAt: time.Now().UnixMilli(),
	}
	return s.tamperRepo.CreateEvent(event)
}

// GetEventsByAgentID 获取探针的防篡改事件
func (s *TamperService) GetEventsByAgentID(agentID string, pageNum, pageSize int) ([]models.TamperEvent, int64, error) {
	if pageNum < 1 {
		pageNum = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	offset := (pageNum - 1) * pageSize
	return s.tamperRepo.GetEventsByAgentID(agentID, pageSize, offset)
}

// CreateAlert 创建防篡改告警
func (s *TamperService) CreateAlert(agentID, path, details string, restored bool, timestamp int64) error {
	alert := &models.TamperAlert{
		ID:        uuid.New().String(),
		AgentID:   agentID,
		Path:      path,
		Details:   details,
		Restored:  restored,
		Timestamp: timestamp,
		CreatedAt: time.Now().UnixMilli(),
	}
	return s.tamperRepo.CreateAlert(alert)
}

// GetAlertsByAgentID 获取探针的防篡改告警
func (s *TamperService) GetAlertsByAgentID(agentID string, pageNum, pageSize int) ([]models.TamperAlert, int64, error) {
	if pageNum < 1 {
		pageNum = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	offset := (pageNum - 1) * pageSize
	return s.tamperRepo.GetAlertsByAgentID(agentID, pageSize, offset)
}

// CleanupOldRecords 清理旧记录（保留最近30天）
func (s *TamperService) CleanupOldRecords() error {
	// 30天前的时间戳
	threshold := time.Now().AddDate(0, 0, -30).UnixMilli()

	if err := s.tamperRepo.DeleteOldEvents(threshold); err != nil {
		return err
	}

	return s.tamperRepo.DeleteOldAlerts(threshold)
}
