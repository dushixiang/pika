import type {TimeRangeOption} from '@/api/property.ts';

// 服务器详情页时间范围选项
export const SERVER_TIME_RANGE_OPTIONS: TimeRangeOption[] = [
    {label: '15分钟', value: '15m'},
    {label: '30分钟', value: '30m'},
    {label: '1小时', value: '1h'},
    {label: '3小时', value: '3h'},
    {label: '6小时', value: '6h'},
    {label: '12小时', value: '12h'},
    {label: '1天', value: '1d'},
    {label: '3天', value: '3d'},
    {label: '7天', value: '7d'},
];

// 监控详情页时间范围选项
export const MONITOR_TIME_RANGE_OPTIONS: TimeRangeOption[] = [
    {label: '12小时', value: '12h'},
    {label: '1天', value: '1d'},
    {label: '3天', value: '3d'},
    {label: '7天', value: '7d'},
];
