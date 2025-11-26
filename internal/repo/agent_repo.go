package repo

import (
	"context"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/go-orz/orz"
	"gorm.io/gorm"
)

type AgentRepo struct {
	orz.Repository[models.Agent, string]
	db *gorm.DB
}

func NewAgentRepo(db *gorm.DB) *AgentRepo {
	return &AgentRepo{
		Repository: orz.NewRepository[models.Agent, string](db),
		db:         db,
	}
}

// UpdateStatus 更新探针状态
func (r *AgentRepo) UpdateStatus(ctx context.Context, agentID string, status int) error {
	return r.db.WithContext(ctx).
		Model(&models.Agent{}).
		Where("id = ?", agentID).
		Updates(map[string]interface{}{
			"status":       status,
			"last_seen_at": time.Now().UnixMilli(),
		}).Error
}

// FindOnlineAgents 查找所有在线探针
func (r *AgentRepo) FindOnlineAgents(ctx context.Context) ([]models.Agent, error) {
	var agents []models.Agent
	err := r.db.WithContext(ctx).
		Where("status = ?", 1).
		Find(&agents).Error
	return agents, err
}

// FindByIP 根据IP查找探针
func (r *AgentRepo) FindByIP(ctx context.Context, ip string) (*models.Agent, error) {
	var agent models.Agent
	err := r.db.WithContext(ctx).
		Where("ip = ?", ip).
		First(&agent).Error
	if err != nil {
		return nil, err
	}
	return &agent, nil
}

// FindByHostname 根据主机名查找探针
func (r *AgentRepo) FindByHostname(ctx context.Context, hostname string) (*models.Agent, error) {
	var agent models.Agent
	err := r.db.WithContext(ctx).
		Where("hostname = ?", hostname).
		First(&agent).Error
	if err != nil {
		return nil, err
	}
	return &agent, nil
}

// FindByHostnameAndIP 根据主机名和IP查找探针
func (r *AgentRepo) FindByHostnameAndIP(ctx context.Context, hostname, ip string) (*models.Agent, error) {
	var agent models.Agent
	err := r.db.WithContext(ctx).
		Where("hostname = ? AND ip = ?", hostname, ip).
		First(&agent).Error
	if err != nil {
		return nil, err
	}
	return &agent, nil
}

// SaveAuditResult 保存审计结果
func (r *AgentRepo) SaveAuditResult(ctx context.Context, audit *models.AuditResult) error {
	return r.db.WithContext(ctx).Create(audit).Error
}

// GetLatestAuditResult 获取最新的审计结果
func (r *AgentRepo) GetLatestAuditResult(ctx context.Context, agentID string) (*models.AuditResult, error) {
	var audit models.AuditResult
	err := r.db.WithContext(ctx).
		Where("agent_id = ?", agentID).
		Order("created_at DESC").
		First(&audit).Error
	if err != nil {
		return nil, err
	}
	return &audit, nil
}

// GetLatestAuditResultByType 根据类型获取最新的审计结果
func (r *AgentRepo) GetLatestAuditResultByType(ctx context.Context, agentID string, resultType string) (*models.AuditResult, error) {
	var audit models.AuditResult
	err := r.db.WithContext(ctx).
		Where("agent_id = ? AND type = ?", agentID, resultType).
		Order("created_at DESC").
		First(&audit).Error
	if err != nil {
		return nil, err
	}
	return &audit, nil
}

// ListAuditResults 获取审计结果列表
func (r *AgentRepo) ListAuditResults(ctx context.Context, agentID string) ([]models.AuditResult, error) {
	var audits []models.AuditResult
	err := r.db.WithContext(ctx).
		Where("agent_id = ?", agentID).
		Order("created_at DESC").
		Limit(50).
		Find(&audits).Error
	return audits, err
}

// UpdateInfo 更新探针信息（名称、平台、位置、到期时间）
func (r *AgentRepo) UpdateInfo(ctx context.Context, agentID string, updates map[string]interface{}) error {
	return r.db.WithContext(ctx).
		Model(&models.Agent{}).
		Where("id = ?", agentID).
		Updates(updates).Error
}

// GetStatistics 获取探针统计数据
func (r *AgentRepo) GetStatistics(ctx context.Context) (total int64, online int64, err error) {
	// 获取总数
	err = r.db.WithContext(ctx).
		Model(&models.Agent{}).
		Count(&total).Error
	if err != nil {
		return 0, 0, err
	}

	// 获取在线数量
	err = r.db.WithContext(ctx).
		Model(&models.Agent{}).
		Where("status = ?", 1).
		Count(&online).Error

	return total, online, err
}

// ListByIDs 根据ID列表获取探针
func (r *AgentRepo) ListByIDs(ctx context.Context, ids []string) ([]models.Agent, error) {
	var agents []models.Agent
	if len(ids) == 0 {
		return agents, nil
	}
	err := r.db.WithContext(ctx).
		Where("id IN ?", ids).
		Find(&agents).Error
	return agents, err
}

// DeleteAuditResults 删除探针的所有审计结果
func (r *AgentRepo) DeleteAuditResults(ctx context.Context, agentID string) error {
	return r.db.WithContext(ctx).
		Where("agent_id = ?", agentID).
		Delete(&models.AuditResult{}).Error
}

// FindPublicAgents 查找所有公开可见的探针
func (r *AgentRepo) FindPublicAgents(ctx context.Context) ([]models.Agent, error) {
	var agents []models.Agent
	err := r.db.WithContext(ctx).
		Where("visibility = ?", "public").
		Find(&agents).Error
	return agents, err
}

// FindPublicAgentByID 查找指定ID的公开可见探针
func (r *AgentRepo) FindPublicAgentByID(ctx context.Context, id string) (*models.Agent, error) {
	var agent models.Agent
	err := r.db.WithContext(ctx).
		Where("id = ? AND visibility = ?", id, "public").
		First(&agent).Error
	if err != nil {
		return nil, err
	}
	return &agent, nil
}

// GetAllTags 获取所有探针的标签（去重）
func (r *AgentRepo) GetAllTags(ctx context.Context) ([]string, error) {
	var agents []models.Agent
	err := r.db.WithContext(ctx).
		Select("tags").
		Find(&agents).Error
	if err != nil {
		return nil, err
	}

	// 使用map去重
	tagMap := make(map[string]bool)
	for _, agent := range agents {
		if agent.Tags != nil {
			for _, tag := range agent.Tags {
				if tag != "" {
					tagMap[tag] = true
				}
			}
		}
	}

	// 转换为切片
	tags := make([]string, 0, len(tagMap))
	for tag := range tagMap {
		tags = append(tags, tag)
	}

	return tags, nil
}
