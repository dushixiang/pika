package models

import (
	"github.com/dushixiang/pika/internal/protocol"
	"gorm.io/datatypes"
)

// MonitorTask 描述一个服务监控任务
type MonitorTask struct {
	ID               string                                         `gorm:"primaryKey" json:"id"`                  // 任务 ID
	Name             string                                         `gorm:"uniqueIndex" json:"name"`               // 任务名称
	Type             string                                         `gorm:"index" json:"type"`                     // 监控类型 http/tcp
	Target           string                                         `json:"target"`                                // 目标地址
	Description      string                                         `json:"description"`                           // 描述信息
	Enabled          bool                                           `json:"enabled"`                               // 是否启用
	ShowTargetPublic bool                                           `json:"showTargetPublic"`                      // 在公开页面是否显示目标地址
	Interval         int                                            `json:"interval"`                              // 检测频率（秒），默认 60
	AgentIds         datatypes.JSONSlice[string]                    `json:"agentIds"`                              // 指定的探针 ID 列表（JSON 数组）
	HTTPConfig       datatypes.JSONType[protocol.HTTPMonitorConfig] `json:"httpConfig"`                            // HTTP 监控配置
	TCPConfig        datatypes.JSONType[protocol.TCPMonitorConfig]  `json:"tcpConfig"`                             // TCP 监控配置
	CreatedAt        int64                                          `gorm:"autoCreateTime:milli" json:"createdAt"` // 创建时间
	UpdatedAt        int64                                          `gorm:"autoUpdateTime:milli" json:"updatedAt"` // 更新时间
}

func (MonitorTask) TableName() string {
	return "monitor_tasks"
}
