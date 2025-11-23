package protocol

import "encoding/json"

// Message WebSocket消息结构
type Message struct {
	Type MessageType     `json:"type"`
	Data json.RawMessage `json:"data"`
}

// RegisterRequest 注册请求
type RegisterRequest struct {
	AgentInfo AgentInfo `json:"agentInfo"`
	ApiKey    string    `json:"apiKey"`
}

// RegisterResponse 注册响应
type RegisterResponse struct {
	AgentID string `json:"agentId"`
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

// AgentInfo 探针信息
type AgentInfo struct {
	ID       string `json:"id"`       // 探针唯一标识（持久化）
	Name     string `json:"name"`     // 探针名称
	Hostname string `json:"hostname"` // 主机名
	OS       string `json:"os"`       // 操作系统
	Arch     string `json:"arch"`     // 架构
	Version  string `json:"version"`  // 版本号
}

// MetricsWrapper 指标数据包装
type MetricsWrapper struct {
	Type MetricType      `json:"type"`
	Data json.RawMessage `json:"data"`
}

type MessageType string

// 控制消息
const (
	MessageTypeRegister    MessageType = "register"
	MessageTypeRegisterAck MessageType = "register_ack"
	MessageTypeRegisterErr MessageType = "register_error"
	MessageTypeHeartbeat   MessageType = "heartbeat"
	MessageTypeCommand     MessageType = "command"
	MessageTypeCommandResp MessageType = "command_response"
	// 指标消息
	MessageTypeMetrics       MessageType = "metrics"
	MessageTypeMonitorConfig MessageType = "monitor_config"
	// 防篡改消息
	MessageTypeTamperProtect MessageType = "tamper_protect"
	MessageTypeTamperEvent   MessageType = "tamper_event"
	MessageTypeTamperAlert   MessageType = "tamper_alert"
)

type MetricType string

// 消息类型常量
const (
	MetricTypeCPU         MetricType = "cpu"
	MetricTypeMemory      MetricType = "memory"
	MetricTypeDisk        MetricType = "disk"
	MetricTypeDiskIO      MetricType = "disk_io"
	MetricTypeNetwork     MetricType = "network"
	MetricTypeLoad        MetricType = "load"
	MetricTypeHost        MetricType = "host"
	MetricTypeGPU         MetricType = "gpu"
	MetricTypeTemperature MetricType = "temperature"
	MetricTypeMonitor     MetricType = "monitor"
)

// CPUData CPU数据
type CPUData struct {
	// 静态信息(不常变化,但每次都发送)
	LogicalCores  int    `json:"logicalCores"`
	PhysicalCores int    `json:"physicalCores"`
	ModelName     string `json:"modelName"`
	// 动态信息
	UsagePercent float64   `json:"usagePercent"`
	PerCore      []float64 `json:"perCore,omitempty"`
}

// MemoryData 内存数据
type MemoryData struct {
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Free         uint64  `json:"free"`
	Available    uint64  `json:"available"`
	UsagePercent float64 `json:"usagePercent"`
	Cached       uint64  `json:"cached,omitempty"`
	Buffers      uint64  `json:"buffers,omitempty"`
	SwapTotal    uint64  `json:"swapTotal,omitempty"`
	SwapUsed     uint64  `json:"swapUsed,omitempty"`
	SwapFree     uint64  `json:"swapFree,omitempty"`
}

// DiskData 磁盘数据
type DiskData struct {
	MountPoint   string  `json:"mountPoint"`
	Device       string  `json:"device"`
	Fstype       string  `json:"fstype"`
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Free         uint64  `json:"free"`
	UsagePercent float64 `json:"usagePercent"`
}

// DiskIOData 磁盘IO数据
type DiskIOData struct {
	Device         string `json:"device"`
	ReadCount      uint64 `json:"readCount"`
	WriteCount     uint64 `json:"writeCount"`
	ReadBytes      uint64 `json:"readBytes"`
	WriteBytes     uint64 `json:"writeBytes"`
	ReadBytesRate  uint64 `json:"readBytesRate"`  // 读取速率(字节/秒)
	WriteBytesRate uint64 `json:"writeBytesRate"` // 写入速率(字节/秒)
	ReadTime       uint64 `json:"readTime"`
	WriteTime      uint64 `json:"writeTime"`
	IoTime         uint64 `json:"ioTime"`
	IopsInProgress uint64 `json:"iopsInProgress"`
}

// NetworkData 网络数据
type NetworkData struct {
	Interface      string   `json:"interface"`
	MacAddress     string   `json:"macAddress,omitempty"`
	Addrs          []string `json:"addrs,omitempty"`
	BytesSentRate  uint64   `json:"bytesSentRate"`  // 发送速率(字节/秒)
	BytesRecvRate  uint64   `json:"bytesRecvRate"`  // 接收速率(字节/秒)
	BytesSentTotal uint64   `json:"bytesSentTotal"` // 累计发送字节数
	BytesRecvTotal uint64   `json:"bytesRecvTotal"` // 累计接收字节数
}

// LoadData 系统负载数据
type LoadData struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

// HostInfoData 主机信息
type HostInfoData struct {
	Hostname             string `json:"hostname"`
	Uptime               uint64 `json:"uptime"`
	BootTime             uint64 `json:"bootTime"`
	Procs                uint64 `json:"procs"`
	OS                   string `json:"os"`
	Platform             string `json:"platform"`
	PlatformFamily       string `json:"platformFamily"`
	PlatformVersion      string `json:"platformVersion"`
	KernelVersion        string `json:"kernelVersion"`
	KernelArch           string `json:"kernelArch"`
	VirtualizationSystem string `json:"virtualizationSystem,omitempty"`
	VirtualizationRole   string `json:"virtualizationRole,omitempty"`
}

// GPUData GPU数据
type GPUData struct {
	Index       int     `json:"index"`
	Name        string  `json:"name"`
	UUID        string  `json:"uuid,omitempty"`
	Temperature float64 `json:"temperature,omitempty"`
	Utilization float64 `json:"utilization,omitempty"`
	MemoryTotal uint64  `json:"memoryTotal,omitempty"`
	MemoryUsed  uint64  `json:"memoryUsed,omitempty"`
	MemoryFree  uint64  `json:"memoryFree,omitempty"`
	PowerUsage  float64 `json:"powerUsage,omitempty"`
	FanSpeed    float64 `json:"fanSpeed,omitempty"`
}

// TemperatureData 温度数据
type TemperatureData struct {
	SensorKey   string  `json:"sensorKey"`
	Temperature float64 `json:"temperature"`
	High        float64 `json:"high,omitempty"`
	Critical    float64 `json:"critical,omitempty"`
}

// CommandRequest 指令请求
type CommandRequest struct {
	ID   string `json:"id"`   // 指令ID
	Type string `json:"type"` // 指令类型: vps_audit
	Args string `json:"args,omitempty"`
}

// CommandResponse 指令响应
type CommandResponse struct {
	ID     string `json:"id"`               // 指令ID
	Type   string `json:"type"`             // 指令类型
	Status string `json:"status"`           // running/success/error
	Error  string `json:"error,omitempty"`  // 错误信息
	Result string `json:"result,omitempty"` // 结果数据(JSON字符串)
}

// VPSAuditResult VPS安全审计结果
type VPSAuditResult struct {
	// 系统信息
	SystemInfo SystemInfo `json:"systemInfo"`
	// 安全检查结果
	SecurityChecks []SecurityCheck `json:"securityChecks"`
	// 审计开始时间
	StartTime int64 `json:"startTime"`
	// 审计结束时间
	EndTime int64 `json:"endTime"`
	// 风险评分 (0-100)
	RiskScore int `json:"riskScore"`
	// 威胁等级: low/medium/high/critical
	ThreatLevel string `json:"threatLevel"`
	// 修复建议
	Recommendations []string `json:"recommendations,omitempty"`
	// 审计警告（权限不足、检查失败等非安全问题）
	AuditWarnings []string `json:"auditWarnings,omitempty"`
}

// SystemInfo 系统信息
type SystemInfo struct {
	Hostname      string `json:"hostname"`
	OS            string `json:"os"`
	KernelVersion string `json:"kernelVersion"`
	Uptime        uint64 `json:"uptime"`
	PublicIP      string `json:"publicIP,omitempty"`
}

// SecurityCheck 安全检查项
type SecurityCheck struct {
	Category string             `json:"category"` // 检查类别
	Status   string             `json:"status"`   // pass/fail/warn/skip
	Message  string             `json:"message"`  // 检查消息
	Details  []SecurityCheckSub `json:"details,omitempty"`
}

// SecurityCheckSub 安全检查子项
type SecurityCheckSub struct {
	Name     string    `json:"name"`               // 子检查名称
	Status   string    `json:"status"`             // pass/fail/warn/skip
	Message  string    `json:"message"`            // 检查消息
	Evidence *Evidence `json:"evidence,omitempty"` // 证据信息
}

// Evidence 安全事件证据
type Evidence struct {
	FileHash    string   `json:"fileHash,omitempty"`    // 文件SHA256哈希
	ProcessTree []string `json:"processTree,omitempty"` // 进程树
	FilePath    string   `json:"filePath,omitempty"`    // 文件路径
	Timestamp   int64    `json:"timestamp,omitempty"`   // 时间戳(毫秒)
	NetworkConn string   `json:"networkConn,omitempty"` // 网络连接信息
	RiskLevel   string   `json:"riskLevel,omitempty"`   // 风险等级: low/medium/high
}

// MonitorData 监控数据
type MonitorData struct {
	ID           string `json:"id"`                     // 监控项ID
	Type         string `json:"type"`                   // 监控类型: http, tcp
	Target       string `json:"target"`                 // 监控目标
	Status       string `json:"status"`                 // 状态: up, down
	StatusCode   int    `json:"statusCode,omitempty"`   // HTTP 状态码
	ResponseTime int64  `json:"responseTime"`           // 响应时间(毫秒)
	Error        string `json:"error,omitempty"`        // 错误信息
	CheckedAt    int64  `json:"checkedAt"`              // 检测时间(毫秒时间戳)
	Message      string `json:"message,omitempty"`      // 附加信息
	ContentMatch bool   `json:"contentMatch,omitempty"` // 内容匹配结果
	// TLS 证书信息（仅用于 HTTPS）
	CertExpiryTime int64 `json:"certExpiryTime,omitempty"` // 证书过期时间(毫秒时间戳)
	CertDaysLeft   int   `json:"certDaysLeft,omitempty"`   // 证书剩余天数
}

// TamperProtectConfig 防篡改保护配置（增量更新）
type TamperProtectConfig struct {
	Added   []string `json:"added,omitempty"`   // 新增保护的目录
	Removed []string `json:"removed,omitempty"` // 移除保护的目录
}

// TamperProtectResponse 防篡改保护响应
type TamperProtectResponse struct {
	Success bool     `json:"success"`           // 是否成功
	Message string   `json:"message"`           // 响应消息
	Paths   []string `json:"paths"`             // 当前保护的目录列表
	Added   []string `json:"added,omitempty"`   // 新增的目录
	Removed []string `json:"removed,omitempty"` // 移除的目录
	Error   string   `json:"error,omitempty"`   // 错误信息
}

// TamperEventData 防篡改事件数据
type TamperEventData struct {
	Path      string `json:"path"`      // 被修改的路径
	Operation string `json:"operation"` // 操作类型: write, remove, rename, chmod, create
	Timestamp int64  `json:"timestamp"` // 事件时间(毫秒)
	Details   string `json:"details"`   // 详细信息
}

// TamperAlertData 防篡改属性告警数据
type TamperAlertData struct {
	Path      string `json:"path"`      // 被篡改的路径
	Timestamp int64  `json:"timestamp"` // 检测时间(毫秒)
	Details   string `json:"details"`   // 详细信息(如: "不可变属性被移除")
	Restored  bool   `json:"restored"`  // 是否已自动恢复
}
