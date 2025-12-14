// 探针颜色方案（用于 MonitorDetail 区分不同探针）
export const AGENT_COLORS = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
    '#14b8a6', // teal
];

// 重新导出其他颜色配置
export {INTERFACE_COLORS, TEMPERATURE_COLORS, ACCENT_THEMES} from './server';
export type {TimeRangeOption} from '@/api/property.ts';
