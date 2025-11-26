import {get, put} from './request';

const PROPERTY_ID_SYSTEM_CONFIG = 'system_config';

export interface SystemConfig {
    systemNameEn: string;  // 英文名称
    systemNameZh: string;  // 中文名称
    logoBase64: string;    // Logo 的 base64 编码
    icpCode: string;       // ICP 备案号
}

// 获取系统配置（管理后台使用）
export const getSystemConfig = async (): Promise<SystemConfig> => {
    const response = await get<{ id: string; name: string; value: SystemConfig }>(
        `/admin/properties/${PROPERTY_ID_SYSTEM_CONFIG}`
    );
    return response.data.value;
};

// 保存系统配置
export const saveSystemConfig = async (config: SystemConfig): Promise<void> => {
    await put(`/admin/properties/${PROPERTY_ID_SYSTEM_CONFIG}`, {
        name: '系统配置',
        value: config,
    });
};
