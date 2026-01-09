import request from './request';
import qs from 'qs';

export interface TamperConfig {
    id: string;
    agentId: string;
    enabled: boolean;
    paths: string[];
    applyStatus?: string;
    applyMessage?: string;
    createdAt: number;
    updatedAt: number;
}

export interface TamperEvent {
    id: string;
    agentId: string;
    path: string;
    operation: string;
    details: string;
    timestamp: number;
    createdAt: number;
}

export interface TamperAlert {
    id: string;
    agentId: string;
    path: string;
    details: string;
    restored: boolean;
    timestamp: number;
    createdAt: number;
}

export interface PagedTamperEvents {
    items: TamperEvent[];
    total: number;
}

export interface PagedTamperAlerts {
    items: TamperAlert[];
    total: number;
}

// 获取防篡改配置
export const getTamperConfig = (agentId: string) => {
    return request.get<TamperConfig>(`/admin/agents/${agentId}/tamper/config`);
};

// 更新防篡改配置
export const updateTamperConfig = (agentId: string, enabled: boolean, paths: string[]) => {
    return request.put<TamperConfig>(
        `/admin/agents/${agentId}/tamper/config`,
        {enabled, paths}
    );
};

// 获取防篡改事件
export const getTamperEvents = (agentId: string, params?: {
    pageIndex?: number;
    pageSize?: number;
    path?: string;
    operation?: string;
    details?: string;
}) => {
    const queryParams = {
        pageIndex: params?.pageIndex || 1,
        pageSize: params?.pageSize || 20,
        path: params?.path,
        operation: params?.operation,
        details: params?.details,
    };
    const paramStr = qs.stringify(queryParams, { skipNulls: true });
    return request.get<PagedTamperEvents>(
        `/admin/agents/${agentId}/tamper/events?${paramStr}`,
    );
};

// 获取防篡改告警
export const getTamperAlerts = (agentId: string, pageIndex: number = 1, pageSize: number = 20) => {
    let params = {pageIndex: pageIndex, pageSize: pageSize}
    let paramStr = qs.stringify(params);
    return request.get<{ success: boolean; data: PagedTamperAlerts }>(
        `/admin/agents/${agentId}/tamper/alerts?${paramStr}`,
    );
};

// 删除防篡改事件
export const deleteTamperEvents = (agentId: string) => {
    return request.delete<void>(`/admin/agents/${agentId}/tamper/events`);
};
