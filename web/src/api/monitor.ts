import {del, get, post, put} from './request';
import type {AgentMonitorStat, MonitorDetail, MonitorListResponse, MonitorTask, MonitorTaskRequest, PublicMonitor} from '../types';

export const listMonitors = (page: number = 1, pageSize: number = 10, keyword?: string) => {
    const params = new URLSearchParams();
    params.append('pageIndex', page.toString());
    params.append('pageSize', pageSize.toString());
    if (keyword) {
        params.append('keyword', keyword);
    }
    params.set('sortOrder', 'asc');
    params.set('sortField', 'name');
    return get<MonitorListResponse>(`/admin/monitors?${params.toString()}`);
};

export const createMonitor = (data: MonitorTaskRequest) => {
    return post<MonitorTask>('/admin/monitors', data);
};

export const getMonitor = (id: number) => {
    return get<MonitorTask>(`/admin/monitors/${id}`);
};

export const updateMonitor = (id: number, data: MonitorTaskRequest) => {
    return put<MonitorTask>(`/admin/monitors/${id}`, data);
};

export const deleteMonitor = (id: number) => {
    return del(`/admin/monitors/${id}`);
};

// 公开接口 - 获取监控配置及聚合统计
export const getPublicMonitors = () => {
    return get<PublicMonitor[]>('/monitors');
};

// 公开接口 - 获取指定监控的统计数据（聚合后的单个监控详情）
export const getMonitorStatsById = (id: string) => {
    return get<PublicMonitor>(`/monitors/${encodeURIComponent(id)}/stats`);
};

// 公开接口 - 获取指定监控各探针的统计数据（直接从 VictoriaMetrics 查询）
export const getMonitorAgentStats = (id: string) => {
    return get<AgentMonitorStat[]>(`/monitors/${encodeURIComponent(id)}/agents`);
};

// VictoriaMetrics 时序数据点
export interface MetricDataPoint {
    timestamp: number;  // 毫秒时间戳
    value: number;
}

// VictoriaMetrics 时序数据系列
export interface MetricSeries {
    name: string;                        // 系列名称（如 "response_time"）
    labels?: Record<string, string>;     // 标签（如 { agent_id: "xxx", monitor_id: "yyy" }）
    data: MetricDataPoint[];            // 数据点数组
}

// VictoriaMetrics 查询响应（直接返回时序数据）
export interface GetMetricsResponse {
    agentId: string;   // 为空表示多探针
    type: string;      // "monitor"
    range: string;     // 时间范围描述
    series: MetricSeries[];  // 时序数据系列（每个探针一个系列）
}

// 公开接口 - 获取指定监控的历史数据（VictoriaMetrics 原始时序数据）
export type MonitorHistoryAggregation = 'avg' | 'max';

export const getMonitorHistory = (id: string, range: string = '15m', aggregation?: MonitorHistoryAggregation) => {
    const params = new URLSearchParams();
    params.append('range', range);
    if (aggregation) {
        params.append('aggregation', aggregation);
    }
    return get<GetMetricsResponse>(`/monitors/${encodeURIComponent(id)}/history?${params.toString()}`);
};
