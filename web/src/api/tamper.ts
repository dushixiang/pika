import request from './request';
import qs from 'qs';

export interface TamperConfig {
    id: string;
    agentId: string;
    paths: string[];
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
    return request.get<{ success: boolean; data: TamperConfig }>(`/admin/agents/${agentId}/tamper/config`);
};

// 更新防篡改配置
export const updateTamperConfig = (agentId: string, paths: string[]) => {
    return request.put<{ success: boolean; message: string; data: TamperConfig }>(
        `/admin/agents/${agentId}/tamper/config`,
        {paths}
    );
};

// 获取防篡改事件
export const getTamperEvents = (agentId: string, pageIndex: number = 1, pageSize: number = 20) => {
    let params = {pageIndex: pageIndex, pageSize: pageSize}
    let paramStr = qs.stringify(params);
    return request.get<{ success: boolean; data: PagedTamperEvents }>(
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
