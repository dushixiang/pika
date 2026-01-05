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

// DeleteOldEvents 删除旧的事件记录（保留最近N天）
func (r *TamperRepo) DeleteOldEvents(beforeTimestamp int64) error {
	return r.db.Where("timestamp < ?", beforeTimestamp).Delete(&models.TamperEvent{}).Error
}
