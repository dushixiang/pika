// 用户相关（简化版，仅用于登录）
export interface User {
    username: string;
    nickname: string;
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
    platform?: string;       // 平台
    location?: string;       // 位置
    expireTime?: number;     // 到期时间（时间戳毫秒）
    status: number;
    lastSeenAt: string | number;  // 支持字符串或时间戳
    createdAt?: string;
    updatedAt?: string;
}

export interface AgentInfo {
    name: string;
    hostname: string;
    ip: string;
    os: string;
    arch: string;
    version: string;
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
    totalSent: number;
    totalRecv: number;
}

export interface AggregatedLoadMetric {
    timestamp: number;
    maxLoad1: number;
    maxLoad5: number;
    maxLoad15: number;
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
    usagePercent: number;
    swapTotal: number;
    swapUsed: number;
    swapFree: number;
}

export interface LoadMetric {
    id: string;
    agentId: string;
    timestamp: number;
    load1: number;
    load5: number;
    load15: number;
}

// 磁盘汇总数据
export interface DiskSummary {
    avgUsagePercent: number;  // 平均使用率
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

export interface MonitorTask {
    id: number;
    name: string;
    type: 'http' | 'https' | 'tcp';
    target: string;
    description?: string;
    enabled: boolean;
    showTargetPublic: boolean;
    interval: number;
    httpConfig?: MonitorHttpConfig | null;
    tcpConfig?: MonitorTcpConfig | null;
    agentIds?: string[];
    createdAt: number;
    updatedAt: number;
}

export interface MonitorTaskRequest {
    name: string;
    type: 'http' | 'https' | 'tcp';
    target: string;
    description?: string;
    enabled?: boolean;
    showTargetPublic?: boolean;
    interval: number;
    httpConfig?: MonitorHttpConfig | null;
    tcpConfig?: MonitorTcpConfig | null;
    agentIds?: string[];
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
    type: 'http' | 'https' | 'tcp';
    target: string;
    showTargetPublic: boolean;
    description?: string;
    enabled: boolean;
    interval: number;
    agentIds: string[];
    agentCount: number;
    lastCheckStatus: string;
    currentResponse: number;
    avgResponse24h: number;
    uptime24h: number;
    uptime30d: number;
    certExpiryDate: number;
    certExpiryDays: number;
    lastCheckTime: number;
}

// 监控统计数据
export interface MonitorStats {
    id: number;
    agentId: string;
    agentName?: string;           // 探针名称
    monitorId: string;            // 监控项ID
    name: string;                 // 监控项名称
    type: string;
    target: string;
    showTargetPublic: boolean;    // 在公开页面是否显示目标地址
    currentResponse: number;      // 当前响应时间(ms)
    avgResponse24h: number;       // 24小时平均响应时间(ms)
    uptime24h: number;            // 24小时在线率(百分比)
    uptime30d: number;            // 30天在线率(百分比)
    certExpiryDate: number;       // 证书过期时间(毫秒时间戳)
    certExpiryDays: number;       // 证书剩余天数
    totalChecks24h: number;       // 24小时总检测次数
    successChecks24h: number;     // 24小时成功次数
    totalChecks30d: number;       // 30天总检测次数
    successChecks30d: number;     // 30天成功次数
    lastCheckTime: number;        // 最后检测时间
    lastCheckStatus: string;      // 最后检测状态: up/down
    updatedAt: number;            // 更新时间
}

// 监控指标（原始数据，用于图表）
export interface MonitorMetric {
    id: number;
    agentId: string;
    name: string;
    type: string;
    target: string;
    status: string;
    statusCode: number;
    responseTime: number;
    error: string;
    message: string;
    contentMatch: boolean;
    certExpiryTime: number;
    certDaysLeft: number;
    timestamp: number;
}

// 磁盘IO指标
export interface DiskIOMetric {
    id: number;
    agentId: string;
    device: string;
    readCount: number;
    writeCount: number;
    readBytes: number;
    writeBytes: number;
    readBytesRate: number;
    writeBytesRate: number;
    readTime: number;
    writeTime: number;
    ioTime: number;
    iopsInProgress: number;
    timestamp: number;
}

export interface LatestMetrics {
    cpu?: CPUMetric;
    memory?: MemoryMetric;
    disk?: DiskSummary;       // 改为汇总数据
    network?: NetworkSummary; // 改为汇总数据
    load?: LoadMetric;
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
    networkDuration: number;
}

export interface AlertConfig {
    id?: string;
    agentId: string;
    agentIds?: string[]; // 监控的探针列表，空数组表示监控所有
    name: string;
    enabled: boolean;
    rules: AlertRules;
    notificationChannelIds: string[]; // 通知渠道类型列表（dingtalk, wecom, feishu, webhook）
    createdAt?: number;
    updatedAt?: number;
}

// 通知渠道配置（通过 type 标识，不再使用独立ID）
export interface NotificationChannel {
    type: 'dingtalk' | 'wecom' | 'feishu' | 'email' | 'webhook'; // 渠道类型，作为唯一标识
    enabled: boolean; // 是否启用
    config: Record<string, any>; // JSON配置，根据type不同而不同
}

// 各种通知渠道的配置类型
export interface DingTalkConfig {
    secretKey: string;      // 访问令牌
    signSecret?: string;    // 加签密钥（可选）
}

export interface WeComConfig {
    secretKey: string;      // Webhook Key
}

export interface FeishuConfig {
    secretKey: string;      // Webhook Token
    signSecret?: string;    // 签名密钥（可选）
}

export interface WebhookConfig {
    url: string;            // 自定义URL
    method?: string;        // HTTP方法，默认POST
    headers?: Record<string, string>; // 自定义请求头
}

export interface EmailConfig {
    smtpHost: string;
    smtpPort: number;
    username: string;
    password: string;
    from: string;
    to: string[];
}

export interface AlertRecord {
    id: number;
    agentId: string;
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
