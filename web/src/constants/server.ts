// 网卡颜色配置（上行和下行使用不同的色调）
export const INTERFACE_COLORS = [
    {upload: '#6FD598', download: '#2C70F6'}, // 绿/蓝
    {upload: '#f59e0b', download: '#8b5cf6'}, // 橙/紫
    {upload: '#ec4899', download: '#06b6d4'}, // 粉/青
    {upload: '#10b981', download: '#f97316'}, // 翠绿/深橙
    {upload: '#14b8a6', download: '#2563eb'}, // 青绿/深蓝
];

// 温度类型颜色映射
export const TEMPERATURE_COLORS: Record<string, string> = {
    'CPU': '#f97316',      // 橙色
    'GPU': '#8b5cf6',      // 紫色
    'DISK': '#06b6d4',     // 青色
    'BATTERY': '#10b981',  // 绿色
    'CHIPSET': '#f59e0b',  // 琥珀色
    'SYSTEM': '#6366f1',   // 靛蓝色
    'PSU': '#ec4899',      // 粉色
};

// 主题配色方案
export const ACCENT_THEMES: Record<'blue' | 'emerald' | 'purple' | 'amber', { icon: string; badge: string; highlight: string }> = {
    blue: {
        icon: 'text-blue-400',
        badge: 'text-blue-400',
        highlight: 'text-blue-400',
    },
    emerald: {
        icon: 'text-emerald-400',
        badge: 'text-emerald-400',
        highlight: 'text-emerald-400',
    },
    purple: {
        icon: 'text-purple-400',
        badge: 'text-purple-400',
        highlight: 'text-purple-400',
    },
    amber: {
        icon: 'text-amber-400',
        badge: 'text-amber-400',
        highlight: 'text-amber-400',
    },
};
