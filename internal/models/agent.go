package models

import "gorm.io/datatypes"

// Agent 探针信息
type Agent struct {
	ID         string                      `gorm:"primaryKey" json:"id"`                  // 探针ID (UUID)
	Name       string                      `gorm:"index" json:"name"`                     // 探针名称
	Hostname   string                      `gorm:"index" json:"hostname,omitempty"`       // 主机名
	IP         string                      `gorm:"index" json:"ip,omitempty"`             // IP地址
	OS         string                      `json:"os"`                                    // 操作系统
	Arch       string                      `json:"arch"`                                  // 架构
	Version    string                      `json:"version"`                               // 探针版本
	Tags       datatypes.JSONSlice[string] `json:"tags"`                                  // 标签
	ExpireTime int64                       `json:"expireTime"`                            // 到期时间（时间戳毫秒）
	Status     int                         `json:"status"`                                // 状态: 0-离线, 1-在线
	Visibility string                      `gorm:"default:public" json:"visibility"`      // 可见性: public-匿名可见, private-登录可见
	LastSeenAt int64                       `gorm:"index" json:"lastSeenAt"`               // 最后上线时间（时间戳毫秒）
	CreatedAt  int64                       `json:"createdAt"`                             // 创建时间（时间戳毫秒）
	UpdatedAt  int64                       `json:"updatedAt" gorm:"autoUpdateTime:milli"` // 更新时间（时间戳毫秒）

	// 流量统计相关字段
	TrafficStats datatypes.JSONType[TrafficStatsData] `json:"trafficStats,omitempty"` // 流量统计

	// 防篡改保护配置
	TamperProtectConfig datatypes.JSONType[TamperProtectConfigData] `json:"tamperProtectConfig,omitempty"` // 防篡改保护配置

	// SSH登录监控配置
	SSHLoginConfig datatypes.JSONType[SSHLoginConfigData] `json:"sshLoginConfig,omitempty"` // SSH登录监控配置
}

// TrafficStatsData 流量统计数据
type TrafficStatsData struct {
	Limit        uint64 `json:"limit"`        // 流量限额(字节), 0表示不限制
	Used         uint64 `json:"used"`         // 当前周期已使用流量(字节)
	ResetDay     int    `json:"resetDay"`     // 流量重置日期(1-31), 0表示不自动重置
	PeriodStart  int64  `json:"periodStart"`  // 当前周期开始时间(时间戳毫秒)
	BaselineRecv uint64 `json:"baselineRecv"` // 当前周期流量基线(BytesRecvTotal)
	AlertSent80  bool   `json:"alertSent80"`  // 是否已发送80%告警
	AlertSent90  bool   `json:"alertSent90"`  // 是否已发送90%告警
	AlertSent100 bool   `json:"alertSent100"` // 是否已发送100%告警
}

// TamperProtectConfigData 防篡改保护配置数据
type TamperProtectConfigData struct {
	Enabled      bool     `json:"enabled"`                // 是否启用
	Paths        []string `json:"paths"`                  // 受保护的目录列表
	ApplyStatus  string   `json:"applyStatus,omitempty"`  // 配置应用状态: success/failed/pending
	ApplyMessage string   `json:"applyMessage,omitempty"` // 应用结果消息
}

// SSHLoginConfigData SSH登录监控配置数据
type SSHLoginConfigData struct {
	Enabled      bool   `json:"enabled"`                // 是否启用
	ApplyStatus  string `json:"applyStatus,omitempty"`  // 配置应用状态: success/failed/pending
	ApplyMessage string `json:"applyMessage,omitempty"` // 应用结果消息
}

func (Agent) TableName() string {
	return "agents"
}
