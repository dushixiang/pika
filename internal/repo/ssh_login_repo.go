package repo

import (
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SSHLoginRepo SSH登录数据访问层
type SSHLoginRepo struct {
	db *gorm.DB
}

// NewSSHLoginRepo 创建仓库
func NewSSHLoginRepo(db *gorm.DB) *SSHLoginRepo {
	return &SSHLoginRepo{db: db}
}

// === 事件相关 ===

// CreateEvent 创建事件记录
func (r *SSHLoginRepo) CreateEvent(event *models.SSHLoginEvent) error {
	event.ID = uuid.New().String()
	event.CreatedAt = time.Now().UnixMilli()
	return r.db.Create(event).Error
}

// GetEventByID 根据ID获取事件
func (r *SSHLoginRepo) GetEventByID(id string) (*models.SSHLoginEvent, error) {
	var event models.SSHLoginEvent
	err := r.db.Where("id = ?", id).First(&event).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &event, err
}

// ListEventsByAgentID 查询探针的登录事件（分页）
func (r *SSHLoginRepo) ListEventsByAgentID(agentID string, page, pageSize int) ([]models.SSHLoginEvent, int64, error) {
	var events []models.SSHLoginEvent
	var total int64

	query := r.db.Model(&models.SSHLoginEvent{}).Where("agent_id = ?", agentID)

	// 统计总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 分页查询
	offset := (page - 1) * pageSize
	err := query.Order("timestamp DESC").
		Limit(pageSize).
		Offset(offset).
		Find(&events).Error

	return events, total, err
}

// ListEventsByFilter 按条件查询事件
func (r *SSHLoginRepo) ListEventsByFilter(agentID, username, ip, status string, startTime, endTime int64, page, pageSize int) ([]models.SSHLoginEvent, int64, error) {
	var events []models.SSHLoginEvent
	var total int64

	query := r.db.Model(&models.SSHLoginEvent{}).Where("agent_id = ?", agentID)

	if username != "" {
		query = query.Where("username = ?", username)
	}
	if ip != "" {
		query = query.Where("ip = ?", ip)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if startTime > 0 {
		query = query.Where("timestamp >= ?", startTime)
	}
	if endTime > 0 {
		query = query.Where("timestamp <= ?", endTime)
	}

	// 统计总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 分页查询
	offset := (page - 1) * pageSize
	err := query.Order("timestamp DESC").
		Limit(pageSize).
		Offset(offset).
		Find(&events).Error

	return events, total, err
}

// DeleteEventsByAgentID 删除探针的所有登录事件
func (r *SSHLoginRepo) DeleteEventsByAgentID(agentID string) error {
	return r.db.Where("agent_id = ?", agentID).Delete(&models.SSHLoginEvent{}).Error
}

// DeleteEventsBefore 删除指定时间之前的事件（用于数据清理）
func (r *SSHLoginRepo) DeleteEventsBefore(timestamp int64) error {
	return r.db.Where("timestamp < ?", timestamp).Delete(&models.SSHLoginEvent{}).Error
}

// CountEventsByAgentID 统计探针的登录事件数量
func (r *SSHLoginRepo) CountEventsByAgentID(agentID string) (int64, error) {
	var count int64
	err := r.db.Model(&models.SSHLoginEvent{}).Where("agent_id = ?", agentID).Count(&count).Error
	return count, err
}

// FindEventByTimestamp 查找指定时间范围内的事件（用于去重）
func (r *SSHLoginRepo) FindEventByTimestamp(agentID string, timestamp, tolerance int64) (*models.SSHLoginEvent, error) {
	var event models.SSHLoginEvent
	err := r.db.Where("agent_id = ? AND timestamp >= ? AND timestamp <= ?",
		agentID, timestamp-tolerance, timestamp+tolerance).
		First(&event).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &event, err
}
