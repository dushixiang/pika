package metric

import "github.com/dushixiang/pika/internal/protocol"

// LatestMonitorMetrics 监控任务的最新指标（按 agent 分组）
type LatestMonitorMetrics struct {
	MonitorID string                           `json:"monitorId"`
	Agents    map[string]*protocol.MonitorData `json:"agents"`    // key: agentID
	UpdatedAt int64                            `json:"updatedAt"` // 最后更新时间
}

// MonitorStatsResult 监控统计结果（所有探针的聚合数据）
type MonitorStatsResult struct {
	Status         string `json:"status"`                   // 聚合状态（up/down/unknown）
	ResponseTime   int64  `json:"responseTime"`             // 当前平均响应时间(ms)
	CertExpiryTime int64  `json:"certExpiryTime,omitempty"` // 证书过期时间(毫秒时间戳)
	CertDaysLeft   int    `json:"certDaysLeft,omitempty"`   // 证书剩余天数
	AgentCount     int    `json:"agentCount"`               // 探针数量
	LastCheckTime  int64  `json:"lastCheckTime"`            // 最后检测时间(毫秒时间戳)
}

// PublicMonitorOverview 用于公开展示的监控配置及汇总数据
type PublicMonitorOverview struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Type             string `json:"type"`
	Target           string `json:"target"`
	ShowTargetPublic bool   `json:"showTargetPublic"` // 在公开页面是否显示目标地址
	Description      string `json:"description"`
	Enabled          bool   `json:"enabled"`
	Interval         int    `json:"interval"`
	AgentCount       int    `json:"agentCount"`
	Status           string `json:"status"`                   // up/down/unknown
	ResponseTime     int64  `json:"responseTime"`             // 当前响应时间(ms)
	CertExpiryTime   int64  `json:"certExpiryTime,omitempty"` // 证书过期时间(毫秒时间戳)
	CertDaysLeft     int    `json:"certDaysLeft,omitempty"`   // 证书剩余天数
	LastCheckTime    int64  `json:"lastCheckTime"`            // 最后检测时间
}
