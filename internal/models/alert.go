package models

// AlertRecord 告警记录
type AlertRecord struct {
	ID            int64   `gorm:"primaryKey;autoIncrement" json:"id"`    // 记录ID
	AgentID       string  `gorm:"index" json:"agentId"`                  // 探针ID
	AgentName     string  `json:"agentName"`                             // 探针名称
	AlertType     string  `json:"alertType"`                             // 告警类型: cpu, memory, disk, network
	Message       string  `json:"message"`                               // 告警消息
	Threshold     float64 `json:"threshold"`                             // 告警阈值
	ActualValue   float64 `json:"actualValue"`                           // 告警触发时的实际值
	ResolvedValue float64 `json:"resolvedValue,omitempty"`               // 恢复时的实际值
	Level         string  `json:"level"`                                 // 告警级别: info, warning, critical
	Status        string  `json:"status"`                                // 状态: firing（告警中）, resolved（已恢复）
	FiredAt       int64   `gorm:"index" json:"firedAt"`                  // 触发时间（时间戳毫秒）
	ResolvedAt    int64   `json:"resolvedAt,omitempty"`                  // 恢复时间（时间戳毫秒）
	CreatedAt     int64   `json:"createdAt"`                             // 创建时间（时间戳毫秒）
	UpdatedAt     int64   `json:"updatedAt" gorm:"autoUpdateTime:milli"` // 更新时间（时间戳毫秒）
}

func (AlertRecord) TableName() string {
	return "alert_records"
}

// AlertState 告警状态（持久化到数据库，用于判断是否持续超过阈值）
type AlertState struct {
	ID            string  `gorm:"primaryKey" json:"id"`                  // 状态ID（格式：agentId:configId:alertType）
	AgentID       string  `gorm:"index" json:"agentId"`                  // 探针ID
	AlertType     string  `gorm:"index" json:"alertType"`                // 告警类型
	Value         float64 `json:"value"`                                 // 当前值
	Threshold     float64 `json:"threshold"`                             // 阈值
	StartTime     int64   `json:"startTime"`                             // 开始超过阈值的时间
	Duration      int     `json:"duration"`                              // 需要持续的时间（秒）
	LastCheckTime int64   `json:"lastCheckTime"`                         // 上次检查时间
	IsFiring      bool    `json:"isFiring"`                              // 是否正在告警
	LastRecordID  int64   `json:"lastRecordId"`                          // 最后一条告警记录ID
	CreatedAt     int64   `json:"createdAt"`                             // 创建时间（时间戳毫秒）
	UpdatedAt     int64   `json:"updatedAt" gorm:"autoUpdateTime:milli"` // 更新时间（时间戳毫秒）
}

func (AlertState) TableName() string {
	return "alert_states"
}
