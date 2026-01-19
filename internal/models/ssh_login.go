package models

// SSHLoginEvent SSH登录事件
type SSHLoginEvent struct {
	ID         string `gorm:"primaryKey" json:"id"`              // 事件ID (UUID)
	AgentID    string `gorm:"index;not null" json:"agentId"`     // 探针ID
	Username   string `gorm:"index" json:"username"`             // 用户名
	IP         string `gorm:"index" json:"ip"`                   // 来源IP
	IPLocation string `gorm:"index" json:"ipLocation,omitempty"` // IP归属地
	Hostname   string `gorm:"index" json:"hostname,omitempty"`   // 主机名 (反向解析)
	Port       string `json:"port,omitempty"`                    // 来源端口
	Status     string `gorm:"index" json:"status"`               // 状态: success
	TTY        string `json:"tty,omitempty"`                     // 终端
	SessionID  string `json:"sessionId,omitempty"`               // 会话ID
	Timestamp  int64  `gorm:"index" json:"timestamp"`            // 登录时间（毫秒时间戳）
	CreatedAt  int64  `json:"createdAt"`                         // 记录创建时间（毫秒）
}

func (SSHLoginEvent) TableName() string {
	return "ssh_login_events"
}
