package models

// MonitorStats 监控统计数据
type MonitorStats struct {
	ID               string  `gorm:"primaryKey" json:"id"`                  // ID
	AgentID          string  `json:"agentId"`                               // 探针ID
	AgentName        string  `gorm:"-" json:"agentName,omitempty"`          // 探针名称（不存储在数据库，仅用于 API 返回）
	MonitorId        string  `json:"monitorId"`                             // 监控项ID
	MonitorName      string  `gorm:"-" json:"name"`                         // 监控项名称（不存储在数据库，仅用于 API 返回）
	MonitorType      string  `json:"type"`                                  // 监控类型
	Target           string  `json:"target"`                                // 目标地址
	ShowTargetPublic bool    `gorm:"-" json:"showTargetPublic"`             // 在公开页面是否显示目标地址（不存储在数据库，仅用于 API 返回）
	CurrentResponse  int64   `json:"currentResponse"`                       // 当前响应时间(ms)
	AvgResponse24h   int64   `json:"avgResponse24h"`                        // 24小时平均响应时间(ms)
	Uptime24h        float64 `json:"uptime24h"`                             // 24小时在线率(百分比)
	Uptime30d        float64 `json:"uptime30d"`                             // 30天在线率(百分比)
	CertExpiryDate   int64   `json:"certExpiryDate"`                        // 证书过期时间(毫秒时间戳)，0表示无证书
	CertExpiryDays   int     `json:"certExpiryDays"`                        // 证书剩余天数
	TotalChecks24h   int64   `json:"totalChecks24h"`                        // 24小时总检测次数
	SuccessChecks24h int64   `json:"successChecks24h"`                      // 24小时成功次数
	TotalChecks30d   int64   `json:"totalChecks30d"`                        // 30天总检测次数
	SuccessChecks30d int64   `json:"successChecks30d"`                      // 30天成功次数
	LastCheckTime    int64   `json:"lastCheckTime"`                         // 最后检测时间
	LastCheckStatus  string  `json:"lastCheckStatus"`                       // 最后检测状态: up/down
	UpdatedAt        int64   `gorm:"autoUpdateTime:milli" json:"updatedAt"` // 更新时间
}

func (MonitorStats) TableName() string {
	return "monitor_stats"
}
