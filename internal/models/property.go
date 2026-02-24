package models

// Property 通用属性配置表
type Property struct {
	ID        string `gorm:"primaryKey" json:"id"`                  // 属性ID (如: notification_channels)
	Name      string `json:"name"`                                  // 可读名称
	Value     string `json:"value" gorm:"type:text"`                // JSON配置
	CreatedAt int64  `json:"createdAt"`                             // 创建时间（时间戳毫秒）
	UpdatedAt int64  `json:"updatedAt" gorm:"autoUpdateTime:milli"` // 更新时间（时间戳毫秒）
}

func (Property) TableName() string {
	return "properties"
}

// NotificationChannelConfig 通知渠道配置（存储在 Property 中）
type NotificationChannelConfig struct {
	Type    string                 `json:"type"`    // 类型: dingtalk, wecom, feishu, webhook
	Enabled bool                   `json:"enabled"` // 是否启用
	Config  map[string]interface{} `json:"config"`  // 配置对象
}

// 配置格式说明：
// dingtalk: { "secretKey": "xxx", "signSecret": "xxx" }
// wecom:    { "secretKey": "xxx" }
// feishu:   { "secretKey": "xxx", "signSecret": "xxx" }
// webhook:  {
//   "url": "https://...",
//   "method": "POST",  // 可选：GET, POST, PUT, PATCH, DELETE，默认 POST
//   "headers": {"key": "value"},  // 可选：自定义请求头
//   "customBody": ""  // 自定义请求体模板，支持变量替换
// }

// DNSProviderConfig DNS 服务商配置（存储在 Property 中）
type DNSProviderConfig struct {
	Provider string                 `json:"provider"` // 服务商类型: aliyun, tencentcloud, cloudflare, huaweicloud
	Enabled  bool                   `json:"enabled"`  // 是否启用
	Config   map[string]interface{} `json:"config"`   // 配置对象（敏感信息）
}

// DNS Provider 配置格式说明：
// aliyun:       { "accessKeyId": "xxx", "accessKeySecret": "xxx" }
// tencentcloud: { "secretId": "xxx", "secretKey": "xxx" }
// cloudflare:   { "apiToken": "xxx" }
// huaweicloud:  { "accessKeyId": "xxx", "secretAccessKey": "xxx", "region": "cn-south-1" }

// WebhookConfig 自定义 Webhook 配置结构
type WebhookConfig struct {
	URL        string            `json:"url"`                  // Webhook URL
	Method     string            `json:"method,omitempty"`     // 请求方法，默认 POST
	Headers    map[string]string `json:"headers,omitempty"`    // 自定义请求头
	CustomBody string            `json:"customBody,omitempty"` // 自定义请求体模板（支持变量）
}

type SystemConfig struct {
	SystemNameZh string `json:"systemNameZh"` // 系统名称（中文）
	SystemNameEn string `json:"systemNameEn"` // 系统名称（英文）
	LogoBase64   string `json:"logoBase64"`   // 系统logo（base64编码）
	ICPCode      string `json:"icpCode"`      // ICP备案号
	DefaultView  string `json:"defaultView"`  // 默认视图 grid | list
	CustomCSS    string `json:"customCSS"`    // 自定义 CSS
	CustomJS     string `json:"customJS"`     // 自定义 JS
	Version      string `json:"-"`            // 系统版本
}

// PublicIPConfig 公网 IP 采集配置
type PublicIPConfig struct {
	Enabled         bool     `json:"enabled"`         // 是否启用采集
	IntervalSeconds int      `json:"intervalSeconds"` // 采集间隔（秒）
	IPv4Scope       string   `json:"ipv4Scope"`       // IPv4 采集范围: all/custom
	IPv4AgentIDs    []string `json:"ipv4AgentIds"`    // IPv4 自定义探针列表
	IPv6Scope       string   `json:"ipv6Scope"`       // IPv6 采集范围: all/custom
	IPv6AgentIDs    []string `json:"ipv6AgentIds"`    // IPv6 自定义探针列表
	IPv4Enabled     bool     `json:"ipv4Enabled"`     // 是否采集 IPv4
	IPv6Enabled     bool     `json:"ipv6Enabled"`     // 是否采集 IPv6
	IPv4APIs        []string `json:"ipv4Apis"`        // IPv4 API 列表
	IPv6APIs        []string `json:"ipv6Apis"`        // IPv6 API 列表
}

func (c *PublicIPConfig) IsIPv4Target(agentID string) bool {
	if c == nil || !c.IPv4Enabled {
		return false
	}
	if c.IPv4Scope != "custom" {
		return true
	}
	for _, id := range c.IPv4AgentIDs {
		if id == agentID {
			return true
		}
	}
	return false
}

func (c *PublicIPConfig) IsIPv6Target(agentID string) bool {
	if c == nil || !c.IPv6Enabled {
		return false
	}
	if c.IPv6Scope != "custom" {
		return true
	}
	for _, id := range c.IPv6AgentIDs {
		if id == agentID {
			return true
		}
	}
	return false
}

// AlertConfig 全局告警配置
type AlertConfig struct {
	Enabled       bool               `json:"enabled"`       // 是否启用全局告警
	MaskIP        bool               `json:"maskIP"`        // 是否在通知中打码 IP 地址
	Rules         AlertRules         `json:"rules"`         // 告警规则
	Notifications AlertNotifications `json:"notifications"` // 通知开关
}

// AlertRules 告警规则
type AlertRules struct {
	// CPU 告警配置
	CPUEnabled   bool    `json:"cpuEnabled"`   // 是否启用CPU告警
	CPUThreshold float64 `json:"cpuThreshold"` // CPU使用率阈值(0-100)
	CPUDuration  int     `json:"cpuDuration"`  // 持续时间（秒）

	// 内存告警配置
	MemoryEnabled   bool    `json:"memoryEnabled"`   // 是否启用内存告警
	MemoryThreshold float64 `json:"memoryThreshold"` // 内存使用率阈值(0-100)
	MemoryDuration  int     `json:"memoryDuration"`  // 持续时间（秒）

	// 磁盘告警配置
	DiskEnabled   bool    `json:"diskEnabled"`   // 是否启用磁盘告警
	DiskThreshold float64 `json:"diskThreshold"` // 磁盘使用率阈值(0-100)
	DiskDuration  int     `json:"diskDuration"`  // 持续时间（秒）

	// 网络告警配置
	NetworkEnabled   bool    `json:"networkEnabled"`   // 是否启用网络告警
	NetworkThreshold float64 `json:"networkThreshold"` // 网速阈值(MB/s)
	NetworkDuration  int     `json:"networkDuration"`  // 持续时间（秒）

	// HTTPS 证书告警配置
	CertEnabled   bool    `json:"certEnabled"`   // 是否启用证书告警
	CertThreshold float64 `json:"certThreshold"` // 证书剩余天数阈值

	// 服务下线告警配置
	ServiceEnabled  bool `json:"serviceEnabled"`  // 是否启用服务下线告警
	ServiceDuration int  `json:"serviceDuration"` // 持续时间（秒）

	// 探针离线告警配置
	AgentOfflineEnabled  bool `json:"agentOfflineEnabled"`  // 是否启用探针离线告警
	AgentOfflineDuration int  `json:"agentOfflineDuration"` // 持续时间（秒）
}

// AlertNotifications 告警通知开关
type AlertNotifications struct {
	TrafficEnabled         bool `json:"trafficEnabled"`         // 流量告警通知
	SSHLoginSuccessEnabled bool `json:"sshLoginSuccessEnabled"` // SSH 登录成功通知
	TamperEventEnabled     bool `json:"tamperEventEnabled"`     // 防篡改事件通知
}

// AgentInstallConfig 探针安装配置
type AgentInstallConfig struct {
	ServerURL string `json:"serverUrl"` // 服务端地址
}
