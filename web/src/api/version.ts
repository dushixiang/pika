// 获取服务端版本信息
import {get} from "@/api/request.ts";

export interface VersionInfo {
    version: string;
    agentVersion: string;
}

export const getServerVersion = () => {
    return get<VersionInfo>('/admin/version');
};