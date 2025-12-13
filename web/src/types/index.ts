// 用户相关（简化版，仅用于登录）
export interface User {
    username: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: User;
}

// 探针相关
export interface Agent {
    id: string;
    name: string;
    hostname: string;
    ip: string;
    os: string;
    arch: string;
    version: string;
    tags?: string[];         // 标签
    expireTime?: number;     // 到期时间（时间戳毫秒）
    status: number;
    visibility?: string;     // 可见性: public-匿名可见, private-登录可见
    lastSeenAt: string | number;  // 支持字符串或时间戳
    createdAt?: string;
    updatedAt?: string;
    // 流量统计相关字段
    trafficLimit?: number;        // 流量限额(字节), 0表示不限制
    trafficUsed?: number;         // 当前周期已使用流量(字节)
    trafficResetDay?: number;     // 流量重置日期(1-31), 0表示不自动重置
    trafficPeriodStart?: number;  // 当前周期开始时间(时间戳毫秒)
    trafficBaselineRecv?: number; // 当前周期流量基线(BytesRecvTotal)
    trafficAlertSent80?: boolean; // 是否已发送80%告警
    trafficAlertSent90?: boolean; // 是否已发送90%告警
    trafficAlertSent100?: boolean;// 是否已发送100%告警
}

// 聚合指标数据（所有图表查询只返回聚合数据）
export interface AggregatedCPUMetric {
    timestamp: number;
    maxUsage: number;
    logicalCores: number;
}

export interface AggregatedMemoryMetric {
    timestamp: number;
    maxUsage: number;
    total: number;
}

export interface AggregatedNetworkMetric {
    timestamp: number;
    interface: string;
    maxSentRate: number;
    maxRecvRate: number;
}

export interface AggregatedDiskMetric {
    timestamp: number;
    mountPoint: string;
    maxUsage: number;
    total: number;
}

export interface AggregatedDiskIOMetric {
    timestamp: number;
    device: string;
    maxReadRate: number;
    maxWriteRate: number;
    totalReadBytes: number;
    totalWriteBytes: number;
}

export interface AggregatedGPUMetric {
    timestamp: number;
    maxUtilization: number;
    maxMemoryUsed: number;
    maxTemperature: number;
    maxPowerDraw: number;
}

export interface AggregatedTemperatureMetric {
    timestamp: number;
    sensorKey: string;
    sensorLabel: string;
    maxTemperature: number;
}

export interface AggregatedNetworkConnectionMetric {
    timestamp: number;
    maxEstablished: number;
    maxSynSent: number;
    maxSynRecv: number;
    maxFinWait1: number;
    maxFinWait2: number;
    maxTimeWait: number;
    maxClose: number;
    maxCloseWait: number;
    maxLastAck: number;
    maxListen: number;
    maxClosing: number;
    maxTotal: number;
}

// 最新实时数据（单点数据，不需要聚合）
export interface CPUMetric {
    id: string;
    agentId: string;
    timestamp: number;
    logicalCores: number;
    physicalCores: number;
    modelName: string;
    usagePercent: number;
}

export interface MemoryMetric {
    id: string;
    agentId: string;
    timestamp: number;
    total: number;
    used: number;
    free: number;
    available: number;
    usagePercent: number;
    swapTotal: number;
    swapUsed: number;
    swapFree: number;
}

// 磁盘汇总数据
export interface DiskSummary {
    usagePercent: number;  // 平均使用率
    totalDisks: number;       // 磁盘数量
    total: number;            // 总容量(字节)
    used: number;             // 已使用(字节)
    free: number;             // 空闲(字节)
}

// 磁盘详细数据
export interface DiskMetric {
    id: string;
    agentId: string;
    timestamp: number;
    device: string;
    mountPoint: string;
    fsType: string;
    total: number;
    used: number;
    free: number;
    usagePercent: number;
}

// 网络详细数据
export interface NetworkMetric {
    id: string;
    agentId: string;
    timestamp: number;
    interface: string;
    bytesSent: number;
    bytesRecv: number;
    packetsSent: number;
    packetsRecv: number;
}

// 网络汇总数据
export interface NetworkSummary {
    totalBytesSentRate: number;   // 总发送速率(字节/秒)
    totalBytesRecvRate: number;   // 总接收速率(字节/秒)
    totalBytesSentTotal: number;  // 累计总发送流量
    totalBytesRecvTotal: number;  // 累计总接收流量
    totalInterfaces: number;      // 网卡数量
}

// 主机信息指标
export interface HostMetric {
    id: number;
    agentId: string;
    hostname: string;
    os: string;
    platform: string;
    platformVersion: string;
    kernelVersion: string;
    kernelArch: string;
    uptime: number;          // 运行时间(秒)
    bootTime: number;        // 启动时间(Unix时间戳-秒)
    procs: number;           // 进程数
    timestamp: number;       // 时间戳（毫秒）
}

// GPU 指标
export interface GPUMetric {
    id: number;
    agentId: string;
    index: number;
    name: string;
    utilization: number;
    memoryTotal: number;
    memoryUsed: number;
    memoryFree: number;
    temperature: number;
    powerDraw: number;
    fanSpeed: number;
    performanceState: string;
    timestamp: number;
}

// 温度指标
export interface TemperatureMetric {
    id: number;
    agentId: string;
    sensorKey: string;
    sensorLabel: string;
    temperature: number;
    timestamp: number;
}

// 服务监控配置
export interface MonitorHttpConfig {
    method?: string;
    expectedStatusCode?: number;
    expectedContent?: string;
    timeout?: number;
    headers?: Record<string, string>;
    body?: string;
}

export interface MonitorTcpConfig {
    timeout?: number;
}

export interface MonitorIcmpConfig {
    timeout?: number;
    count?: number;
}

export interface MonitorTask {
    id: number;
    name: string;
    type: 'http' | 'https' | 'tcp' | 'icmp' | 'ping';
    target: string;
    description?: string;
    enabled: boolean;
    showTargetPublic: boolean;
    visibility?: string;     // 可见性: public-匿名可见, private-登录可见
    interval: number;
    httpConfig?: MonitorHttpConfig | null;
    tcpConfig?: MonitorTcpConfig | null;
    icmpConfig?: MonitorIcmpConfig | null;
    agentIds?: string[];
    agentNames?: string[];
    tags?: string[];       // 标签列表，拥有这些标签的探针都会执行此监控
    createdAt: number;
    updatedAt: number;
}

export interface MonitorTaskRequest {
    name: string;
    type: 'http' | 'https' | 'tcp' | 'icmp' | 'ping';
    target: string;
    description?: string;
    enabled?: boolean;
    showTargetPublic?: boolean;
    visibility?: string;     // 可见性: public-匿名可见, private-登录可见
    interval: number;
    httpConfig?: MonitorHttpConfig | null;
    tcpConfig?: MonitorTcpConfig | null;
    icmpConfig?: MonitorIcmpConfig | null;
    agentIds?: string[];
    tags?: string[];       // 标签列表
}

export interface MonitorListResponse {
    items: MonitorTask[];
    total: number;
    page: number;
    pageSize: number;
}

// 面向公开页面的监控项及聚合统计
export interface PublicMonitor {
    id: string;
    name: string;
    type: 'http' | 'https' | 'tcp' | 'icmp' | 'ping';
    target: string;
    showTargetPublic: boolean;
    description?: string;
    enabled: boolean;
    interval: number;
    agentIds: string[];
    agentCount: number;

    status: string;
    responseTime: number;
    certExpiryTime: number;
    certDaysLeft: number;
    lastCheckTime: number;
}

// 监控统计数据
export interface CertStats {
    certExpiryTime: number;
    certDaysLeft: number;
}

// 网络连接统计
export interface NetworkConnectionMetric {
    id: number;
    agentId: string;
    established: number;  // ESTABLISHED 状态连接数
    synSent: number;      // SYN_SENT 状态连接数
    synRecv: number;      // SYN_RECV 状态连接数
    finWait1: number;     // FIN_WAIT1 状态连接数
    finWait2: number;     // FIN_WAIT2 状态连接数
    timeWait: number;     // TIME_WAIT 状态连接数
    close: number;        // CLOSE 状态连接数
    closeWait: number;    // CLOSE_WAIT 状态连接数
    lastAck: number;      // LAST_ACK 状态连接数
    listen: number;       // LISTEN 状态连接数
    closing: number;      // CLOSING 状态连接数
    total: number;        // 总连接数
    timestamp: number;
}

export interface LatestMetrics {
    cpu?: CPUMetric;
    memory?: MemoryMetric;
    disk?: DiskSummary;       // 改为汇总数据
    network?: NetworkSummary; // 改为汇总数据
    networkConnection?: NetworkConnectionMetric; // 网络连接统计
    host?: HostMetric;        // 主机信息
    gpu?: GPUMetric[];        // GPU 列表
    temperature?: TemperatureMetric[];  // 温度传感器列表
}

// API Key 相关
export interface ApiKey {
    id: string;
    name: string;
    key: string;
    enabled: boolean;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}

export interface GenerateApiKeyRequest {
    name: string;
}

export interface UpdateApiKeyNameRequest {
    name: string;
}

// 告警配置相关
export interface AlertRules {
    cpuEnabled: boolean;
    cpuThreshold: number;
    cpuDuration: number;
    memoryEnabled: boolean;
    memoryThreshold: number;
    memoryDuration: number;
    diskEnabled: boolean;
    diskThreshold: number;
    diskDuration: number;
    networkEnabled: boolean;
    networkThreshold: number;  // 网速阈值(MB/s)
    networkDuration: number;
    certEnabled: boolean;      // HTTPS 证书告警开关
    certThreshold: number;     // 证书剩余天数阈值（天）
    serviceEnabled: boolean;   // 服务下线告警开关
    serviceDuration: number;   // 服务下线持续时间（秒）
    agentOfflineEnabled: boolean;   // 探针离线告警开关
    agentOfflineDuration: number;   // 探针离线持续时间（秒）
}

// 全局告警配置（现在存储在 Property 中）
export interface AlertConfig {
    enabled: boolean;  // 全局告警开关
    rules: AlertRules;
}

export interface AlertRecord {
    id: number;
    agentId: string;
    agentName: string;
    configId: string;
    configName: string;
    alertType: string;
    message: string;
    threshold: number;
    actualValue: number;
    level: string;
    status: string;
    firedAt: number;
    resolvedAt?: number;
    createdAt: number;
    updatedAt: number;
}

// 流量统计相关
export interface TrafficAlerts {
    sent80: boolean;
    sent90: boolean;
    sent100: boolean;
}

export interface TrafficStats {
    trafficLimit: number;
    trafficUsed: number;
    trafficUsedPercent: number;
    trafficRemaining: number;
    trafficResetDay: number;
    periodStart: number;
    periodEnd: number;
    daysUntilReset: number;
    alerts: TrafficAlerts;
}

export interface UpdateTrafficConfigRequest {
    trafficLimit: number;    // 流量限额(字节), 0表示不限制
    trafficResetDay: number; // 流量重置日期(1-31), 0表示不自动重置
}

// 导出 DDNS 相关类型
export * from './ddns';
