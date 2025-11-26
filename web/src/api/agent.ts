import {del, get, post, put} from './request';
import type {Agent, LatestMetrics} from '../types';

export interface ListAgentsResponse {
    items: Agent[];
    total: number;
}

export interface GetAgentMetricsRequest {
    agentId: string;
    type: 'cpu' | 'memory' | 'disk' | 'network' | 'load' | 'disk_io' | 'gpu' | 'temperature';
    range?: '1m' | '5m' | '15m' | '30m' | '1h';
}

export interface GetAgentMetricsResponse {
    agentId: string;
    type: string;
    range: string;
    start: number;
    end: number;
    interval: number;
    metrics: any[];
}

// 管理员接口 - 获取所有探针（需要认证）
export const getAgentPaging = (pageIndex: number = 1, pageSize: number = 10, hostname?: string, ip?: string, status?: string) => {
    const params = new URLSearchParams();
    params.append('pageIndex', pageIndex.toString());
    params.append('pageSize', pageSize.toString());
    if (hostname) {
        params.append('hostname', hostname);
    }
    if (ip) {
        params.append('ip', ip);
    }
    if (status) {
        params.append('status', status);
    }
    params.set('sortOrder', 'asc');
    params.set('sortField', 'name');
    return get<ListAgentsResponse>(`/admin/agents?${params.toString()}`);
};

export const listAgents = () => {
    return get<ListAgentsResponse>('/agents');
};

// 获取所有探针（不分页，用于选择器）
export const getAgents = async () => {
    const response = await get<ListAgentsResponse>('/admin/agents');
    return response.data;
};

export const getAgent = (id: string) => {
    return get<Agent>(`/agents/${id}`);
};

// 管理员接口 - 获取探针详情（显示完整信息）
export const getAgentForAdmin = (id: string) => {
    return get<Agent>(`/admin/agents/${id}`);
};

export const getAgentMetrics = (params: GetAgentMetricsRequest) => {
    const {agentId, type, range = '1h'} = params;
    const query = new URLSearchParams();
    query.append('type', type);
    query.append('range', range);
    return get<GetAgentMetricsResponse>(`/agents/${agentId}/metrics?${query.toString()}`);
};

export const getAgentLatestMetrics = (agentId: string) => {
    return get<LatestMetrics>(`/agents/${agentId}/metrics/latest`);
};

export interface GetNetworkMetricsByInterfaceRequest {
    agentId: string;
    range?: '1m' | '5m' | '15m' | '30m' | '1h';
}

export interface NetworkMetricByInterface {
    timestamp: number;
    interface: string;
    maxSentRate: number;
    maxRecvRate: number;
}

export interface GetNetworkMetricsByInterfaceResponse {
    agentId: string;
    type: string;
    range: string;
    start: number;
    end: number;
    interval: number;
    metrics: NetworkMetricByInterface[];
}

export const getNetworkMetricsByInterface = (params: GetNetworkMetricsByInterfaceRequest) => {
    const {agentId, range = '1h'} = params;
    const query = new URLSearchParams();
    query.append('range', range);
    return get<GetNetworkMetricsByInterfaceResponse>(`/agents/${agentId}/metrics/network-by-interface?${query.toString()}`);
};

// VPS 安全审计相关接口

export interface SystemInfo {
    hostname: string;
    os: string;
    kernelVersion: string;
    uptime: number;
    publicIP?: string;
}

export interface SecurityCheckSub {
    name?: string;
    status: 'pass' | 'fail' | 'warn' | 'skip';
    severity?: 'high' | 'medium' | 'low';
    message: string;
    evidence?: string; // 简化为字符串
}

export interface SecurityCheck {
    category: string;
    status: 'pass' | 'fail' | 'warn' | 'skip';
    message: string;
    details?: SecurityCheckSub[];
}

// 资产清单相关类型
export interface ListeningPort {
    protocol: string;
    address: string;
    port: number;
    processName?: string;
    processPid?: number;
    processPath?: string;
    isPublic: boolean;
}

export interface NetworkAssets {
    listeningPorts?: ListeningPort[];
    connections?: any[];
    interfaces?: any[];
}

export interface ProcessInfo {
    pid: number;
    name: string;
    cmdline?: string;
    exe?: string;
    username?: string;
    cpuPercent: number;
    memPercent: number;
    memoryMb: number;
}

export interface ProcessAssets {
    topCpuProcesses?: ProcessInfo[];
    topMemoryProcesses?: ProcessInfo[];
}

export interface UserInfo {
    username: string;
    uid: string;
    gid: string;
    homeDir?: string;
    shell?: string;
    isLoginable: boolean;
    isRootEquiv: boolean;
    hasPassword: boolean;
}

export interface UserAssets {
    systemUsers?: UserInfo[];
    loginHistory?: any[];
    sshKeys?: any[];
    sudoUsers?: any[];
}

export interface FileAssets {
    cronJobs?: any[];
    systemdServices?: any[];
    startupScripts?: any[];
    recentModified?: any[];
    largeFiles?: any[];
}

export interface KernelAssets {
    loadedModules?: any[];
    kernelParameters?: Record<string, string>;
    securityModules?: any;
}

export interface AssetInventory {
    networkAssets?: NetworkAssets;
    processAssets?: ProcessAssets;
    userAssets?: UserAssets;
    fileAssets?: FileAssets;
    kernelAssets?: KernelAssets;
}

export interface AuditStatistics {
    networkStats?: any;
    processStats?: any;
    userStats?: any;
    fileStats?: any;
}

// VPS审计结果(Agent端收集的原始数据)
export interface VPSAuditResult {
    systemInfo: SystemInfo;
    assetInventory: AssetInventory;
    statistics: AuditStatistics;
    startTime: number;
    endTime: number;
    collectWarnings?: string[];
}

// VPS安全分析结果(Server端分析后的结果)
export interface VPSAuditAnalysis {
    auditId: string;
    securityChecks: SecurityCheck[];
    riskScore: number;
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendations?: string[];
    analyzedAt: number;
}

export interface AuditResultSummary {
    id: number;
    agentId: string;
    type: string;
    startTime: number;
    endTime: number;
    createdAt: number;
    passCount: number;
    failCount: number;
    warnCount: number;
    totalCount: number;
    systemInfo: SystemInfo;
}

export interface SendCommandResponse {
    commandId: string;
    status: string;
}

// 发送审计指令
export const sendAuditCommand = (agentId: string) => {
    return post<SendCommandResponse>(`/admin/agents/${agentId}/command?type=vps_audit`, {});
};

// 获取最新的审计结果（管理员接口）
export const getAuditResult = (agentId: string) => {
    return get<VPSAuditResult>(`/admin/agents/${agentId}/audit/result`);
};

// 获取审计结果列表（管理员接口）
export const listAuditResults = (agentId: string) => {
    return get<{ items: AuditResultSummary[]; total: number }>(`/admin/agents/${agentId}/audit/results`);
};

// 更新探针名称
export const updateAgentName = (agentId: string, name: string) => {
    return put(`/admin/agents/${agentId}/name`, {name});
};

// 更新探针信息（名称、标签、到期时间、可见性）
export interface UpdateAgentInfoRequest {
    name?: string;
    tags?: string[];
    expireTime?: number;
    visibility?: string;
}

export const updateAgentInfo = (agentId: string, data: UpdateAgentInfoRequest) => {
    return put(`/admin/agents/${agentId}`, data);
};

// 获取探针统计数据
export interface AgentStatistics {
    total: number;
    online: number;
    offline: number;
    onlineRate: number;
}

export const getAgentStatistics = () => {
    return get<AgentStatistics>('/admin/agents/statistics');
};

// 获取服务端版本信息
export interface VersionInfo {
    version: string;
}

export const getServerVersion = () => {
    return get<VersionInfo>('/agent/version');
};

// 删除探针
export const deleteAgent = (agentId: string) => {
    return del(`/admin/agents/${agentId}`);
};

// 获取所有探针的标签
export interface GetTagsResponse {
    tags: string[];
}

export const getTags = () => {
    return get<GetTagsResponse>('/admin/agents/tags');
};
