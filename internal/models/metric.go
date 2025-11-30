package models

// CPUMetric CPU指标
type CPUMetric struct {
	ID            uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID       string  `gorm:"index:idx_cpu_agent_ts,priority:1" json:"agentId"`                    // 探针ID
	UsagePercent  float64 `json:"usagePercent"`                                                        // CPU使用率
	LogicalCores  int     `json:"logicalCores"`                                                        // 逻辑核心数
	PhysicalCores int     `json:"physicalCores"`                                                       // 物理核心数
	ModelName     string  `json:"modelName"`                                                           // CPU型号
	Timestamp     int64   `gorm:"index:idx_cpu_agent_ts,priority:2;index:idx_cpu_ts" json:"timestamp"` // 时间戳（毫秒）
}

func (CPUMetric) TableName() string {
	return "cpu_metrics"
}

// MemoryMetric 内存指标
type MemoryMetric struct {
	ID           uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID      string  `gorm:"index:idx_mem_agent_ts,priority:1" json:"agentId"`                    // 探针ID
	Total        uint64  `json:"total"`                                                               // 总内存(字节)
	Used         uint64  `json:"used"`                                                                // 已使用(字节)
	Free         uint64  `json:"free"`                                                                // 空闲(字节)
	UsagePercent float64 `json:"usagePercent"`                                                        // 使用率
	SwapTotal    uint64  `json:"swapTotal"`                                                           // 总交换空间(字节)
	SwapUsed     uint64  `json:"swapUsed"`                                                            // 已使用交换空间(字节)
	SwapFree     uint64  `json:"swapFree"`                                                            // 空闲交换空间(字节)
	Timestamp    int64   `gorm:"index:idx_mem_agent_ts,priority:2;index:idx_mem_ts" json:"timestamp"` // 时间戳（毫秒）
}

func (MemoryMetric) TableName() string {
	return "memory_metrics"
}

// DiskMetric 磁盘指标
type DiskMetric struct {
	ID           uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID      string  `gorm:"index:idx_disk_agent_ts,priority:1" json:"agentId"`                     // 探针ID
	MountPoint   string  `json:"mountPoint"`                                                            // 挂载点
	Total        uint64  `json:"total"`                                                                 // 总容量(字节)
	Used         uint64  `json:"used"`                                                                  // 已使用(字节)
	Free         uint64  `json:"free"`                                                                  // 空闲(字节)
	UsagePercent float64 `json:"usagePercent"`                                                          // 使用率
	Timestamp    int64   `gorm:"index:idx_disk_agent_ts,priority:2;index:idx_disk_ts" json:"timestamp"` // 时间戳（毫秒）
	TotalDisks   int     `json:"totalDisks"`                                                            // 磁盘总数量
}

func (DiskMetric) TableName() string {
	return "disk_metrics"
}

// NetworkMetric 网络指标
type NetworkMetric struct {
	ID              uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID         string `gorm:"index:idx_net_agent_ts,priority:1" json:"agentId"`                    // 探针ID
	Interface       string `json:"interface"`                                                           // 网卡名称
	BytesSentRate   uint64 `json:"bytesSentRate"`                                                       // 发送速率(字节/秒)
	BytesRecvRate   uint64 `json:"bytesRecvRate"`                                                       // 接收速率(字节/秒)
	BytesSentTotal  uint64 `json:"bytesSentTotal"`                                                      // 累计发送字节数
	BytesRecvTotal  uint64 `json:"bytesRecvTotal"`                                                      // 累计接收字节数
	Timestamp       int64  `gorm:"index:idx_net_agent_ts,priority:2;index:idx_net_ts" json:"timestamp"` // 时间戳（毫秒）
	TotalInterfaces int    `json:"totalInterfaces"`                                                     // 网卡总数量
}

func (NetworkMetric) TableName() string {
	return "network_metrics"
}

// NetworkConnectionMetric 网络连接统计指标
type NetworkConnectionMetric struct {
	ID          uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID     string `gorm:"index:idx_netconn_agent_ts,priority:1" json:"agentId"`                        // 探针ID
	Established uint32 `json:"established"`                                                                 // ESTABLISHED 状态连接数
	SynSent     uint32 `json:"synSent"`                                                                     // SYN_SENT 状态连接数
	SynRecv     uint32 `json:"synRecv"`                                                                     // SYN_RECV 状态连接数
	FinWait1    uint32 `json:"finWait1"`                                                                    // FIN_WAIT1 状态连接数
	FinWait2    uint32 `json:"finWait2"`                                                                    // FIN_WAIT2 状态连接数
	TimeWait    uint32 `json:"timeWait"`                                                                    // TIME_WAIT 状态连接数
	Close       uint32 `json:"close"`                                                                       // CLOSE 状态连接数
	CloseWait   uint32 `json:"closeWait"`                                                                   // CLOSE_WAIT 状态连接数
	LastAck     uint32 `json:"lastAck"`                                                                     // LAST_ACK 状态连接数
	Listen      uint32 `json:"listen"`                                                                      // LISTEN 状态连接数
	Closing     uint32 `json:"closing"`                                                                     // CLOSING 状态连接数
	Total       uint32 `json:"total"`                                                                       // 总连接数
	Timestamp   int64  `gorm:"index:idx_netconn_agent_ts,priority:2;index:idx_netconn_ts" json:"timestamp"` // 时间戳（毫秒）
}

func (NetworkConnectionMetric) TableName() string {
	return "network_connection_metrics"
}

// DiskIOMetric 磁盘IO指标
type DiskIOMetric struct {
	ID             uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID        string `gorm:"index:idx_diskio_agent_ts,priority:1" json:"agentId"`                       // 探针ID
	Device         string `json:"device"`                                                                    // 设备名称
	ReadCount      uint64 `json:"readCount"`                                                                 // 读取次数
	WriteCount     uint64 `json:"writeCount"`                                                                // 写入次数
	ReadBytes      uint64 `json:"readBytes"`                                                                 // 读取字节数
	WriteBytes     uint64 `json:"writeBytes"`                                                                // 写入字节数
	ReadBytesRate  uint64 `json:"readBytesRate"`                                                             // 读取速率(字节/秒)
	WriteBytesRate uint64 `json:"writeBytesRate"`                                                            // 写入速率(字节/秒)
	ReadTime       uint64 `json:"readTime"`                                                                  // 读取时间(毫秒)
	WriteTime      uint64 `json:"writeTime"`                                                                 // 写入时间(毫秒)
	IoTime         uint64 `json:"ioTime"`                                                                    // IO时间(毫秒)
	IopsInProgress uint64 `json:"iopsInProgress"`                                                            // 正在进行的IO操作数
	Timestamp      int64  `gorm:"index:idx_diskio_agent_ts,priority:2;index:idx_diskio_ts" json:"timestamp"` // 时间戳（毫秒）
}

func (DiskIOMetric) TableName() string {
	return "disk_io_metrics"
}

// GPUMetric GPU指标
type GPUMetric struct {
	ID               uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID          string  `gorm:"index:idx_gpu_agent_idx_ts,priority:1" json:"agentId"`                    // 探针ID
	Index            int     `gorm:"index:idx_gpu_agent_idx_ts,priority:2" json:"index"`                      // GPU索引
	Name             string  `json:"name"`                                                                    // GPU名称
	Utilization      float64 `json:"utilization"`                                                             // GPU使用率(%)
	MemoryTotal      uint64  `json:"memoryTotal"`                                                             // 总显存(字节)
	MemoryUsed       uint64  `json:"memoryUsed"`                                                              // 已使用显存(字节)
	MemoryFree       uint64  `json:"memoryFree"`                                                              // 空闲显存(字节)
	Temperature      float64 `json:"temperature"`                                                             // 温度(℃)
	PowerDraw        float64 `json:"powerDraw"`                                                               // 功耗(瓦)
	FanSpeed         float64 `json:"fanSpeed"`                                                                // 风扇转速(%)
	PerformanceState string  `json:"performanceState"`                                                        // 性能状态
	Timestamp        int64   `gorm:"index:idx_gpu_agent_idx_ts,priority:3;index:idx_gpu_ts" json:"timestamp"` // 时间戳（毫秒）
}

func (GPUMetric) TableName() string {
	return "gpu_metrics"
}

// TemperatureMetric 温度指标
type TemperatureMetric struct {
	ID          uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID     string  `gorm:"index:idx_temp_agent_sensor_ts,priority:1" json:"agentId"`                     // 探针ID
	SensorKey   string  `gorm:"index:idx_temp_agent_sensor_ts,priority:2" json:"sensorKey"`                   // 传感器标识
	SensorLabel string  `json:"sensorLabel"`                                                                  // 传感器标签
	Temperature float64 `json:"temperature"`                                                                  // 温度(℃)
	Timestamp   int64   `gorm:"index:idx_temp_agent_sensor_ts,priority:3;index:idx_temp_ts" json:"timestamp"` // 时间戳（毫秒）
}

func (TemperatureMetric) TableName() string {
	return "temperature_metrics"
}

// HostMetric 主机信息指标
type HostMetric struct {
	ID              uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID         string `gorm:"uniqueIndex:ux_host_agent" json:"agentId"` // 探针ID（唯一约束用于 upsert）
	OS              string `json:"os"`                                       // 操作系统
	Platform        string `json:"platform"`                                 // 平台
	PlatformVersion string `json:"platformVersion"`                          // 平台版本
	KernelVersion   string `json:"kernelVersion"`                            // 内核版本
	KernelArch      string `json:"kernelArch"`                               // 内核架构
	Uptime          uint64 `json:"uptime"`                                   // 运行时间(秒)
	BootTime        uint64 `json:"bootTime"`                                 // 启动时间(Unix时间戳-秒)
	Procs           uint64 `json:"procs"`                                    // 进程数
	Timestamp       int64  `gorm:"index:idx_host_ts" json:"timestamp"`       // 时间戳（毫秒）
}

func (HostMetric) TableName() string {
	return "host_metrics"
}

// MonitorMetric 监控指标
type MonitorMetric struct {
	ID             uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentId        string `gorm:"index:idx_mon_agent_monitor_ts,priority:1" json:"agentId"`                                                             // 探针ID
	MonitorId      string `gorm:"index:idx_mon_agent_monitor_ts,priority:2;index:idx_mon_type_monitor_ts,priority:2" json:"monitorId"`                  // 监控项ID
	Type           string `gorm:"index:idx_mon_type_monitor_ts,priority:1" json:"type"`                                                                 // 监控类型: http, tcp
	Target         string `json:"target"`                                                                                                               // 监控目标
	Status         string `json:"status"`                                                                                                               // 状态: up, down
	StatusCode     int    `json:"statusCode"`                                                                                                           // HTTP状态码
	ResponseTime   int64  `json:"responseTime"`                                                                                                         // 响应时间(毫秒)
	Error          string `json:"error"`                                                                                                                // 错误信息
	Message        string `json:"message"`                                                                                                              // 附加信息
	ContentMatch   bool   `json:"contentMatch"`                                                                                                         // 内容匹配结果
	CertExpiryTime int64  `json:"certExpiryTime"`                                                                                                       // 证书过期时间(毫秒时间戳), 0表示无证书
	CertDaysLeft   int    `json:"certDaysLeft"`                                                                                                         // 证书剩余天数
	Timestamp      int64  `gorm:"index:idx_mon_agent_monitor_ts,priority:3;index:idx_mon_type_monitor_ts,priority:3;index:idx_mon_ts" json:"timestamp"` // 时间戳（毫秒）
}

func (MonitorMetric) TableName() string {
	return "monitor_metrics"
}

// ----------- 聚合表 -----------

// AggregatedCPUMetricModel CPU聚合表
type AggregatedCPUMetricModel struct {
	ID            uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID       string  `gorm:"index:idx_cpuagg_agent_bucket,priority:1;uniqueIndex:ux_cpuagg_bucket,priority:1" json:"agentId"`
	BucketSeconds int     `gorm:"index:idx_cpuagg_agent_bucket,priority:2;uniqueIndex:ux_cpuagg_bucket,priority:2" json:"bucketSeconds"`
	BucketStart   int64   `gorm:"index:idx_cpuagg_agent_bucket,priority:3;uniqueIndex:ux_cpuagg_bucket,priority:3" json:"bucketStart"` // 毫秒
	MaxUsage      float64 `json:"maxUsage"`
	LogicalCores  int     `json:"logicalCores"`
}

func (AggregatedCPUMetricModel) TableName() string {
	return "cpu_metrics_aggs"
}

// AggregatedMemoryMetricModel 内存聚合表
type AggregatedMemoryMetricModel struct {
	ID            uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID       string  `gorm:"index:idx_memagg_agent_bucket,priority:1;uniqueIndex:ux_memagg_bucket,priority:1" json:"agentId"`
	BucketSeconds int     `gorm:"index:idx_memagg_agent_bucket,priority:2;uniqueIndex:ux_memagg_bucket,priority:2" json:"bucketSeconds"`
	BucketStart   int64   `gorm:"index:idx_memagg_agent_bucket,priority:3;uniqueIndex:ux_memagg_bucket,priority:3" json:"bucketStart"` // 毫秒
	MaxUsage      float64 `json:"maxUsage"`
	Total         uint64  `json:"total"`
}

func (AggregatedMemoryMetricModel) TableName() string {
	return "memory_metrics_aggs"
}

// AggregatedDiskMetricModel 磁盘聚合表
type AggregatedDiskMetricModel struct {
	ID            uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID       string  `gorm:"index:idx_diskagg_agent_bucket_mp,priority:1;uniqueIndex:ux_diskagg_bucket,priority:1" json:"agentId"`
	BucketSeconds int     `gorm:"index:idx_diskagg_agent_bucket_mp,priority:2;uniqueIndex:ux_diskagg_bucket,priority:2" json:"bucketSeconds"`
	BucketStart   int64   `gorm:"index:idx_diskagg_agent_bucket_mp,priority:3;uniqueIndex:ux_diskagg_bucket,priority:3" json:"bucketStart"` // 毫秒
	MountPoint    string  `gorm:"index:idx_diskagg_agent_bucket_mp,priority:4;uniqueIndex:ux_diskagg_bucket,priority:4" json:"mountPoint"`
	MaxUsage      float64 `json:"maxUsage"`
	Total         uint64  `json:"total"`
}

func (AggregatedDiskMetricModel) TableName() string {
	return "disk_metrics_aggs"
}

// AggregatedNetworkMetricModel 网络聚合表（按网卡分组）
type AggregatedNetworkMetricModel struct {
	ID            uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID       string  `gorm:"index:idx_netagg_agent_bucket_iface,priority:1;uniqueIndex:ux_netagg_bucket,priority:1" json:"agentId"`
	BucketSeconds int     `gorm:"index:idx_netagg_agent_bucket_iface,priority:2;uniqueIndex:ux_netagg_bucket,priority:2" json:"bucketSeconds"`
	BucketStart   int64   `gorm:"index:idx_netagg_agent_bucket_iface,priority:3;uniqueIndex:ux_netagg_bucket,priority:3" json:"bucketStart"` // 毫秒
	Interface     string  `gorm:"index:idx_netagg_agent_bucket_iface,priority:4;uniqueIndex:ux_netagg_bucket,priority:4" json:"interface"`
	MaxSentRate   float64 `json:"maxSentRate"`
	MaxRecvRate   float64 `json:"maxRecvRate"`
}

func (AggregatedNetworkMetricModel) TableName() string {
	return "network_metrics_aggs"
}

// AggregatedNetworkConnectionMetricModel 网络连接聚合表
type AggregatedNetworkConnectionMetricModel struct {
	ID             uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID        string `gorm:"index:idx_netconnagg_agent_bucket,priority:1;uniqueIndex:ux_netconnagg_bucket,priority:1" json:"agentId"`
	BucketSeconds  int    `gorm:"index:idx_netconnagg_agent_bucket,priority:2;uniqueIndex:ux_netconnagg_bucket,priority:2" json:"bucketSeconds"`
	BucketStart    int64  `gorm:"index:idx_netconnagg_agent_bucket,priority:3;uniqueIndex:ux_netconnagg_bucket,priority:3" json:"bucketStart"` // 毫秒
	MaxEstablished uint32 `json:"maxEstablished"`
	MaxSynSent     uint32 `json:"maxSynSent"`
	MaxSynRecv     uint32 `json:"maxSynRecv"`
	MaxFinWait1    uint32 `json:"maxFinWait1"`
	MaxFinWait2    uint32 `json:"maxFinWait2"`
	MaxTimeWait    uint32 `json:"maxTimeWait"`
	MaxClose       uint32 `json:"maxClose"`
	MaxCloseWait   uint32 `json:"maxCloseWait"`
	MaxLastAck     uint32 `json:"maxLastAck"`
	MaxListen      uint32 `json:"maxListen"`
	MaxClosing     uint32 `json:"maxClosing"`
	MaxTotal       uint32 `json:"maxTotal"`
}

func (AggregatedNetworkConnectionMetricModel) TableName() string {
	return "network_connection_metrics_aggs"
}

// AggregatedDiskIOMetricModel 磁盘IO聚合表（汇总所有磁盘）
type AggregatedDiskIOMetricModel struct {
	ID                uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID           string `gorm:"index:idx_diskioagg_agent_bucket,priority:1;uniqueIndex:ux_diskioagg_bucket,priority:1" json:"agentId"`
	BucketSeconds     int    `gorm:"index:idx_diskioagg_agent_bucket,priority:2;uniqueIndex:ux_diskioagg_bucket,priority:2" json:"bucketSeconds"`
	BucketStart       int64  `gorm:"index:idx_diskioagg_agent_bucket,priority:3;uniqueIndex:ux_diskioagg_bucket,priority:3" json:"bucketStart"` // 毫秒
	MaxReadBytesRate  uint64 `json:"maxReadBytesRate"`
	MaxWriteBytesRate uint64 `json:"maxWriteBytesRate"`
	MaxIopsInProgress uint64 `json:"maxIopsInProgress"`
}

func (AggregatedDiskIOMetricModel) TableName() string {
	return "disk_io_metrics_aggs"
}

// AggregatedGPUMetricModel GPU聚合表
type AggregatedGPUMetricModel struct {
	ID             uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID        string  `gorm:"index:idx_gpuagg_agent_bucket_idx,priority:1;uniqueIndex:ux_gpuagg_bucket,priority:1" json:"agentId"`
	BucketSeconds  int     `gorm:"index:idx_gpuagg_agent_bucket_idx,priority:2;uniqueIndex:ux_gpuagg_bucket,priority:2" json:"bucketSeconds"`
	BucketStart    int64   `gorm:"index:idx_gpuagg_agent_bucket_idx,priority:3;uniqueIndex:ux_gpuagg_bucket,priority:3" json:"bucketStart"` // 毫秒
	Index          int     `gorm:"index:idx_gpuagg_agent_bucket_idx,priority:4;uniqueIndex:ux_gpuagg_bucket,priority:4" json:"index"`
	Name           string  `json:"name"`
	MaxUtilization float64 `json:"maxUtilization"`
	MaxMemoryUsed  uint64  `json:"maxMemoryUsed"`
	MaxTemperature float64 `json:"maxTemperature"`
	MaxPowerDraw   float64 `json:"maxPowerDraw"`
	MemoryTotal    uint64  `json:"memoryTotal"`
}

func (AggregatedGPUMetricModel) TableName() string {
	return "gpu_metrics_aggs"
}

// AggregatedTemperatureMetricModel 温度聚合表
type AggregatedTemperatureMetricModel struct {
	ID             uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	AgentID        string  `gorm:"index:idx_tempagg_agent_bucket_sensor,priority:1;uniqueIndex:ux_tempagg_bucket,priority:1" json:"agentId"`
	BucketSeconds  int     `gorm:"index:idx_tempagg_agent_bucket_sensor,priority:2;uniqueIndex:ux_tempagg_bucket,priority:2" json:"bucketSeconds"`
	BucketStart    int64   `gorm:"index:idx_tempagg_agent_bucket_sensor,priority:3;uniqueIndex:ux_tempagg_bucket,priority:3" json:"bucketStart"` // 毫秒
	SensorKey      string  `gorm:"index:idx_tempagg_agent_bucket_sensor,priority:4;uniqueIndex:ux_tempagg_bucket,priority:4" json:"sensorKey"`
	SensorLabel    string  `json:"sensorLabel"`
	MaxTemperature float64 `json:"maxTemperature"`
}

func (AggregatedTemperatureMetricModel) TableName() string {
	return "temperature_metrics_aggs"
}

// AggregationProgress 聚合进度记录
type AggregationProgress struct {
	MetricType    string `gorm:"primaryKey"` // cpu/memory/disk/network
	BucketSeconds int    `gorm:"primaryKey"`
	LastBucket    int64  `json:"lastBucket"` // 已完成的最后 bucket 起始时间（毫秒）
	UpdatedAt     int64  `json:"updatedAt" gorm:"autoUpdateTime:milli"`
	CreatedAt     int64  `json:"createdAt" gorm:"autoCreateTime:milli"`
}

func (AggregationProgress) TableName() string {
	return "aggregation_progress"
}
