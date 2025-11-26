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
// webhook:  { "url": "https://..." }

type SystemConfig struct {
	SystemNameZh string `json:"systemNameZh"` // 系统名称（中文）
	SystemNameEn string `json:"systemNameEn"` // 系统名称（英文）
	LogoBase64   string `json:"logoBase64"`   // 系统logo（base64编码）
	ICPCode      string `json:"icpCode"`      // ICP备案号
}
