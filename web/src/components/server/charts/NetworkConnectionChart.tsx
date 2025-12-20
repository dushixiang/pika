import {useMemo} from 'react';
import {Network} from 'lucide-react';
import {CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {ChartPlaceholder, CustomTooltip} from '@/components/common';
import {useMetricsQuery} from '@/hooks/server/queries';
import {ChartContainer} from './ChartContainer';
import {formatChartTime} from '@/utils/util';

interface NetworkConnectionChartProps {
    agentId: string;
    timeRange: string;
}

/**
 * 网络连接统计图表组件
 */
export const NetworkConnectionChart = ({agentId, timeRange}: NetworkConnectionChartProps) => {
    // 数据查询
    const {data: metricsResponse, isLoading} = useMetricsQuery({
        agentId,
        type: 'network_connection',
        range: timeRange,
    });

    // 数据转换
    const chartData = useMemo(() => {
        if (!metricsResponse?.data.series || metricsResponse.data.series?.length === 0) return [];

        // 按时间戳聚合所有连接状态系列
        const timeMap = new Map<number, any>();

        metricsResponse.data.series?.forEach(series => {
            const stateName = series.name; // established, time_wait, close_wait, listen
            series.data.forEach(point => {
                if (!timeMap.has(point.timestamp)) {
                    timeMap.set(point.timestamp, {
                        timestamp: point.timestamp,
                        established: 0,
                        time_wait: 0,
                        close_wait: 0,
                        listen: 0
                    });
                }

                const existing = timeMap.get(point.timestamp)!;
                // 直接使用下划线命名
                existing[stateName] = Number(point.value.toFixed(0));
            });
        });

        return Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    }, [metricsResponse, timeRange]);

    // 渲染
    if (isLoading) {
        return (
            <ChartContainer title="网络连接统计" icon={Network}>
                <ChartPlaceholder/>
            </ChartContainer>
        );
    }

    return (
        <ChartContainer title="网络连接统计" icon={Network}>
            {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
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
                        />
                        <Tooltip content={<CustomTooltip unit=""/>}/>
                        <Legend/>
                        <Line
                            type="monotone"
                            dataKey="established"
                            name="ESTABLISHED"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{r: 3}}
                        />
                        <Line
                            type="monotone"
                            dataKey="time_wait"
                            name="TIME_WAIT"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{r: 3}}
                        />
                        <Line
                            type="monotone"
                            dataKey="close_wait"
                            name="CLOSE_WAIT"
                            stroke="#ef4444"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{r: 3}}
                        />
                        <Line
                            type="monotone"
                            dataKey="listen"
                            name="LISTEN"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{r: 3}}
                        />
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <ChartPlaceholder subtitle="暂无网络连接统计数据"/>
            )}
        </ChartContainer>
    );
};
