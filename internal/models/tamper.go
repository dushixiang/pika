package models

import "gorm.io/datatypes"

// TamperProtectConfig 防篡改保护配置
type TamperProtectConfig struct {
	ID        string                      `gorm:"primaryKey" json:"id"`                  // 配置ID (UUID)
	AgentID   string                      `gorm:"index;not null" json:"agentId"`         // 探针ID
	Paths     datatypes.JSONSlice[string] `json:"paths"`                                 // 受保护的目录列表
	CreatedAt int64                       `json:"createdAt"`                             // 创建时间（时间戳毫秒）
	UpdatedAt int64                       `json:"updatedAt" gorm:"autoUpdateTime:milli"` // 更新时间（时间戳毫秒）
}

func (TamperProtectConfig) TableName() string {
	return "tamper_protect_configs"
}

// TamperEvent 防篡改事件
type TamperEvent struct {
	ID        string `gorm:"primaryKey" json:"id"`          // 事件ID (UUID)
	AgentID   string `gorm:"index;not null" json:"agentId"` // 探针ID
	Path      string `gorm:"index" json:"path"`             // 被修改的路径
	Operation string `json:"operation"`                     // 操作类型: write, remove, rename, chmod, create
	Details   string `json:"details"`                       // 详细信息
	Timestamp int64  `gorm:"index" json:"timestamp"`        // 事件时间（时间戳毫秒）
	CreatedAt int64  `json:"createdAt"`                     // 记录创建时间（时间戳毫秒）
}

func (TamperEvent) TableName() string {
	return "tamper_events"
}

// TamperAlert 防篡改属性告警
type TamperAlert struct {
	ID        string `gorm:"primaryKey" json:"id"`          // 告警ID (UUID)
	AgentID   string `gorm:"index;not null" json:"agentId"` // 探针ID
	Path      string `gorm:"index" json:"path"`             // 被篡改的路径
	Details   string `json:"details"`                       // 详细信息
	Restored  bool   `json:"restored"`                      // 是否已自动恢复
	Timestamp int64  `gorm:"index" json:"timestamp"`        // 检测时间（时间戳毫秒）
	CreatedAt int64  `json:"createdAt"`                     // 记录创建时间（时间戳毫秒）
}

func (TamperAlert) TableName() string {
	return "tamper_alerts"
}
