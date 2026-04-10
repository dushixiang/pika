import {useMemo} from 'react';
import {Area, AreaChart, ResponsiveContainer} from 'recharts';

interface DataPoint {
    timestamp: number;
    value: number;
}

interface MiniChartProps {
    data: DataPoint[];
    lastValue?: number;
    id: string;
}

/**
 * 迷你图表组件
 * 用于监控卡片中显示响应时间趋势
 */
export const MiniChart = ({data, lastValue, id}: MiniChartProps) => {
    // 处理图表数据 - 保持原始 timestamp 用于精确的时间轴计算
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        // 按时间戳排序并返回原始数据
        return [...data].sort((a, b) => a.timestamp - b.timestamp);
    }, [data]);

    if (chartData.length === 0) {
        return (
            <div className="h-16 w-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                暂无数据
            </div>
        );
    }

    // 根据最后一个值决定颜色
    const color = lastValue && lastValue <= 200 ? '#22d3ee' : '#fbbf24';

    return (
        <div className="h-16 w-full -mb-2">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id={`colorLatency-${id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.3}/>
                            <stop offset="100%" stopColor={color} stopOpacity={0}/>
                        </linearGradient>
                        <filter id={`glow-${id}`} height="300%" width="300%" x="-75%" y="-75%">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        fill={`url(#colorLatency-${id})`}
                        strokeWidth={2}
                        filter={`url(#glow-${id})`}
                        isAnimationActive={false}
                        connectNulls
                        dot={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};
