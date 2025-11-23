package repo

import (
	"github.com/dushixiang/pika/internal/models"
	"gorm.io/gorm"
)

type TamperRepo struct {
	db *gorm.DB
}

func NewTamperRepo(db *gorm.DB) *TamperRepo {
	return &TamperRepo{db: db}
}

// GetConfigByAgentID 根据探针ID获取防篡改配置
func (r *TamperRepo) GetConfigByAgentID(agentID string) (*models.TamperProtectConfig, error) {
	var config models.TamperProtectConfig
	err := r.db.Where("agent_id = ?", agentID).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// SaveConfig 保存或更新防篡改配置
func (r *TamperRepo) SaveConfig(config *models.TamperProtectConfig) error {
	return r.db.Save(config).Error
}

// DeleteConfig 删除防篡改配置
func (r *TamperRepo) DeleteConfig(agentID string) error {
	return r.db.Where("agent_id = ?", agentID).Delete(&models.TamperProtectConfig{}).Error
}

// CreateEvent 创建防篡改事件
func (r *TamperRepo) CreateEvent(event *models.TamperEvent) error {
	return r.db.Create(event).Error
}

// GetEventsByAgentID 获取探针的防篡改事件（分页）
func (r *TamperRepo) GetEventsByAgentID(agentID string, limit, offset int) ([]models.TamperEvent, int64, error) {
	var events []models.TamperEvent
	var total int64

	query := r.db.Model(&models.TamperEvent{}).Where("agent_id = ?", agentID)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("timestamp DESC").
		Limit(limit).
		Offset(offset).
		Find(&events).Error

	return events, total, err
}

// CreateAlert 创建防篡改告警
func (r *TamperRepo) CreateAlert(alert *models.TamperAlert) error {
	return r.db.Create(alert).Error
}

// GetAlertsByAgentID 获取探针的防篡改告警（分页）
func (r *TamperRepo) GetAlertsByAgentID(agentID string, limit, offset int) ([]models.TamperAlert, int64, error) {
	var alerts []models.TamperAlert
	var total int64

	query := r.db.Model(&models.TamperAlert{}).Where("agent_id = ?", agentID)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("timestamp DESC").
		Limit(limit).
		Offset(offset).
		Find(&alerts).Error

	return alerts, total, err
}

// DeleteOldEvents 删除旧的事件记录（保留最近N天）
func (r *TamperRepo) DeleteOldEvents(beforeTimestamp int64) error {
	return r.db.Where("timestamp < ?", beforeTimestamp).Delete(&models.TamperEvent{}).Error
}

// DeleteOldAlerts 删除旧的告警记录（保留最近N天）
func (r *TamperRepo) DeleteOldAlerts(beforeTimestamp int64) error {
	return r.db.Where("timestamp < ?", beforeTimestamp).Delete(&models.TamperAlert{}).Error
}
