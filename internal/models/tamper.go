package models

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
