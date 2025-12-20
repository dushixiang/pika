import {useMemo} from 'react';
import {Activity} from 'lucide-react';
import {Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {ChartPlaceholder, CustomTooltip, MobileLegend} from '@/components/common';
import {useMetricsQuery} from '@/hooks/server/queries';
import {useIsMobile} from '@/hooks/use-mobile';
import {ChartContainer} from './ChartContainer';
import {formatChartTime} from '@/utils/util';

interface MonitorChartProps {
    agentId: string;
    timeRange: string;
    aggregation?: 'avg' | 'max';
}

/**
 * 监控响应时间图表组件
 */
export const MonitorChart = ({agentId, timeRange, aggregation}: MonitorChartProps) => {
    const isMobile = useIsMobile();

    // 数据查询
    const {data: metricsResponse, isLoading} = useMetricsQuery({
        agentId,
        type: 'monitor',
        range: timeRange,
        aggregation,
    });

    // 数据转换 - 支持多个监控任务
    const chartData = useMemo(() => {
        const series = metricsResponse?.data.series || [];
        if (series.length === 0) return [];

        // 收集所有时间戳
        const timestampMap = new Map<number, any>();

        series.forEach((s) => {
            s.data.forEach((point) => {
                if (!timestampMap.has(point.timestamp)) {
                    timestampMap.set(point.timestamp, {
                        timestamp: point.timestamp,
                    });
                }

                const dataPoint = timestampMap.get(point.timestamp);
                // 使用 monitor_name 作为 key，如果没有则使用 monitor_id
                const monitorKey = s.labels?.monitor_name || s.labels?.monitor_id || s.name;
                dataPoint[monitorKey] = Number(point.value.toFixed(2));
            });
        });

        // 转换为数组并排序
        return Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    }, [metricsResponse, timeRange]);

    // 获取所有监控任务的列表（使用名称）
    const monitorKeys = useMemo(() => {
        const series = metricsResponse?.data.series || [];
        return series.map(s => s.labels?.monitor_name || s.labels?.monitor_id || s.name);
    }, [metricsResponse]);

    // 颜色配置
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    // 准备移动端图例数据
    const legendItems = useMemo(() => {
        return monitorKeys.map((key, index) => ({
            key,
            label: key,
            color: colors[index % colors.length],
        }));
    }, [monitorKeys]);

    // 如果没有数据且不是加载中，不渲染组件
    if (!isLoading && chartData.length === 0) {
        return null;
    }

    // 渲染
    if (isLoading) {
        return (
            <ChartContainer title="监控响应时间" icon={Activity}>
                <ChartPlaceholder/>
            </ChartContainer>
        );
    }

    return (
        <ChartContainer title="监控响应时间" icon={Activity}>
            {chartData.length > 0 ? (
                <>
                    <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={chartData}>
                            <defs>
                                {monitorKeys.map((key, index) => (
                                    <linearGradient key={key} id={`monitorAreaGradient-${index}`} x1="0" y1="0" x2="0"
                                                    y2="1">
                                        <stop offset="5%" stopColor={colors[index % colors.length]} stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor={colors[index % colors.length]} stopOpacity={0}/>
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid stroke="currentColor" strokeDasharray="4 4" className="stroke-slate-200 dark:stroke-cyan-900/30"/>
                            <XAxis
                                dataKey="timestamp"
                                type="number"
                                scale="time"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(value) => formatChartTime(Number(value), timeRange)}
                                stroke="currentColor"
                                angle={-15}
                                textAnchor="end"
                                className="text-xs text-gray-600 dark:text-cyan-500 font-mono"
                                height={45}
                            />
                            <YAxis
                                stroke="currentColor"
                                className="stroke-gray-400 dark:stroke-cyan-600 text-xs"
                                tickFormatter={(value) => `${value}ms`}
                            />
                            <Tooltip
                                content={<CustomTooltip unit="ms"/>}
                                wrapperStyle={{zIndex: 9999,}}
                            />
                            {!isMobile && monitorKeys.length > 1 && (
                                <Legend
                                    wrapperStyle={{fontSize: '12px'}}
                                    iconType="line"
                                />
                            )}
                            {monitorKeys.map((key, index) => (
                                <Area
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    name={key}
                                    stroke={colors[index % colors.length]}
                                    strokeWidth={2}
                                    fill={`url(#monitorAreaGradient-${index})`}
                                    activeDot={{r: 3}}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>

                    <MobileLegend items={legendItems} show={isMobile}/>
                </>
            ) : (
                <ChartPlaceholder/>
            )}
        </ChartContainer>
    );
};
