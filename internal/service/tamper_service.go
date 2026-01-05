package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/repo"
	"github.com/dushixiang/pika/internal/websocket"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type TamperService struct {
	logger     *zap.Logger
	agentRepo  *repo.AgentRepo
	tamperRepo *repo.TamperRepo
	wsManager  *websocket.Manager
}

func NewTamperService(logger *zap.Logger, db *gorm.DB, wsManager *websocket.Manager) *TamperService {
	return &TamperService{
		logger:     logger,
		agentRepo:  repo.NewAgentRepo(db),
		tamperRepo: repo.NewTamperRepo(db),
		wsManager:  wsManager,
	}
}

// GetConfigByAgentID 获取探针的防篡改配置
func (s *TamperService) GetConfigByAgentID(agentID string) (*models.TamperProtectConfigData, error) {
	config, err := s.agentRepo.GetTamperProtectConfig(context.Background(), agentID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil // 没有配置不算错误
		}
		return nil, err
	}
	return config, nil
}

// UpdateConfig 更新探针的防篡改配置
func (s *TamperService) UpdateConfig(agentID string, enabled bool, paths []string) (*models.TamperProtectConfigData, error) {
	// 查找现有配置
	config, err := s.agentRepo.GetTamperProtectConfig(context.Background(), agentID)
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

	// 创建或更新配置
	newConfig := &models.TamperProtectConfigData{
		Enabled: enabled,
		Paths:   paths,
	}

	// 保存配置到数据库
	if err := s.agentRepo.UpdateTamperProtectConfig(context.Background(), agentID, newConfig); err != nil {
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

	return newConfig, nil
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

// CleanupOldRecords 清理旧记录（保留最近30天）
func (s *TamperService) CleanupOldRecords() error {
	// 30天前的时间戳
	threshold := time.Now().AddDate(0, 0, -30).UnixMilli()

	return s.tamperRepo.DeleteOldEvents(threshold)
}
