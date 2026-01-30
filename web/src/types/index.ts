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
    ip: string; // 通信 IP
    ipv4?: string;
    ipv6?: string;
    os: string;
    arch: string;
    version: string;
    tags?: string[];         // 标签
    expireTime?: number;     // 到期时间（时间戳毫秒）
    status: number;
    visibility?: string;     // 可见性: public-匿名可见, private-登录可见
    weight?: number;         // 权重排序（数字越大越靠前）
    remark?: string;         // 备注信息
    lastSeenAt: string | number;  // 支持字符串或时间戳
    createdAt?: string;
    updatedAt?: string;
    // 流量统计相关字段
    trafficStats?: TrafficStatsData; // 流量统计配置
    tamperProtectConfig?: TamperProtectConfig; // 防篡改保护配置
    sshLoginConfig?: SSHLoginConfigData; // SSH登录监控配置
}

export interface TrafficStatsData {
    enabled: boolean;
    type: string;         // 统计类型: recv进站/send出站/both全部
    limit: number;        // 流量限额(字节), 0表示不限制
    used: number;         // 当前周期已使用流量(字节)
    resetDay: number;     // 流量重置日期(1-31), 0表示不自动重置
    periodStart: number;  // 当前周期开始时间(时间戳毫秒)
    periodEnd: number;    // 当前周期结束时间(时间戳毫秒)
    daysUntilReset: number; // 距离重置的天数
    baselineRecv: number; // 当前周期流量基线(接收)
    baselineSend: number; // 当前周期流量基线(发送)
    alertSent80: boolean;
    alertSent90: boolean;
    alertSent100: boolean;
}

export interface TamperProtectConfig {
    enabled: boolean;
    paths?: string[];
    applyStatus?: string;
    applyMessage?: string;
}

export interface SSHLoginConfigData {
    enabled: boolean;
    ipWhitelist?: string[];  // IP白名单，白名单中的IP只记录不发送通知
    applyStatus?: string;
    applyMessage?: string;
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

export interface NetworkInterfaceMetric {
    interface: string;
    macAddress?: string;
    addrs?: string[];
    bytesSentRate: number;
    bytesRecvRate: number;
    bytesSentTotal: number;
    bytesRecvTotal: number;
}

// 主机信息
export interface HostInfo {
    hostname: string;
    uptime: number;          // 运行时间(秒)
    bootTime: number;        // 启动时间(Unix时间戳-秒)
    procs: number;           // 进程数
    load1: number;           // 1分钟平均负载
    load5: number;           // 5分钟平均负载
    load15: number;          // 15分钟平均负载
    os: string;
    platform: string;
    platformFamily: string;
    platformVersion: string;
    kernelVersion: string;
    kernelArch: string;
    virtualizationSystem?: string;
    virtualizationRole?: string;
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
    powerUsage: number;
    fanSpeed: number;
    performanceState: string;
    timestamp: number;
}

// 温度指标
export interface TemperatureMetric {
    id: number;
    agentId: string;
    sensorKey: string;
    type: string;
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
    id: string;
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
    responseTimeMin: number;
    responseTimeMax: number;
    certExpiryTime: number;
    certDaysLeft: number;
    agentStats: {
        up: number;
        down: number;
        unknown: number;
    };
    lastCheckTime: number;
}

// 探针监控统计
export interface AgentMonitorStat {
    agentId: string;
    agentName: string;
    monitorId: string;
    type: string;
    target: string;
    status: string;
    statusCode: number;
    responseTime: number;
    checkedAt: number;
    message: string;
    certExpiryTime: number;
    certDaysLeft: number;
}

// 监控详情（整合版）
export interface MonitorDetail {
    id: string;
    name: string;
    type: 'http' | 'https' | 'tcp' | 'icmp' | 'ping';
    target: string;
    showTargetPublic: boolean;
    description?: string;
    enabled: boolean;
    interval: number;
    stats: {
        status: string;
        responseTime: number;
        responseTimeMin: number;
        responseTimeMax: number;
        lastCheckTime: number;
        agentCount: number;
        agentStats: {
            up: number;
            down: number;
            unknown: number;
        };
        certExpiryTime: number;
        certDaysLeft: number;
    };
    agents: AgentMonitorStat[];
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
    networkInterfaces?: NetworkInterfaceMetric[];
    networkConnection?: NetworkConnectionMetric; // 网络连接统计
    host?: HostInfo;          // 主机信息
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

export interface AlertNotifications {
    trafficEnabled: boolean;         // 流量告警通知
    sshLoginSuccessEnabled: boolean; // SSH 登录成功通知
    tamperEventEnabled: boolean;     // 防篡改事件通知
}

// 全局告警配置（现在存储在 Property 中）
export interface AlertConfig {
    enabled: boolean;  // 全局告警开关
    maskIP: boolean;   // 是否在通知中打码 IP 地址
    rules: AlertRules;
    notifications: AlertNotifications;
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
    enabled: boolean;
    type: string;      // 统计类型: recv进站/send出站/both全部
    limit: number;
    used: number;
    usedPercent: number;
    remaining: number;
    resetDay: number;
    periodStart: number;
    periodEnd: number;
    daysUntilReset: number;
    alerts: TrafficAlerts;
}

export interface UpdateTrafficConfigRequest {
    enabled: boolean;  // 是否启用
    type: string;      // 统计类型: recv进站/send出站/both全部
    limit: number;     // 流量限额(字节), 0表示不限制
    resetDay: number;  // 流量重置日期(1-31), 0表示不自动重置
}

// SSH 登录监控相关
export interface SSHLoginConfig {
    enabled: boolean;
    ipWhitelist?: string[];  // IP白名单，白名单中的IP只记录不发送通知
    applyStatus?: string;  // 配置应用状态: success/failed/pending
    applyMessage?: string; // 应用结果消息
}

export interface SSHLoginEvent {
    id: string;
    agentId: string;
    username: string;
    ip: string;
    ipLocation?: string;
    port?: string;
    status: 'success' | 'failed';
    method?: string;
    tty?: string;
    sessionId?: string;
    timestamp: number;
    createdAt: number;
}

export interface UpdateSSHLoginConfigRequest {
    enabled: boolean;
    ipWhitelist?: string[];  // IP白名单，白名单中的IP只记录不发送通知
}

// 导出 DDNS 相关类型
export * from './ddns';
