import {useMemo} from 'react';
import {Zap} from 'lucide-react';
import {CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {ChartPlaceholder, CustomTooltip} from '@/components/common';
import {useMetricsQuery} from '@/hooks/server/queries';
import {ChartContainer} from './ChartContainer';
import {formatChartTime} from '@/utils/util';

interface GpuChartProps {
    agentId: string;
    timeRange: string;
    aggregation?: 'avg' | 'max';
}

/**
 * GPU 使用率与温度图表组件
 * 使用双 Y 轴显示使用率和温度
 */
export const GpuChart = ({agentId, timeRange, aggregation}: GpuChartProps) => {
    // 数据查询
    const {data: metricsResponse, isLoading} = useMetricsQuery({
        agentId,
        type: 'gpu',
        range: timeRange,
        aggregation,
    });

    // 数据转换
    const chartData = useMemo(() => {
        if (!metricsResponse?.data.series || metricsResponse.data.series?.length === 0) return [];

        // 按时间戳聚合利用率和温度系列
        const timeMap = new Map<number, any>();

        const utilizationSeries = metricsResponse.data?.series?.find(s => s.name === 'utilization');
        const temperatureSeries = metricsResponse.data?.series?.find(s => s.name === 'temperature');

        // 添加利用率数据
        utilizationSeries?.data.forEach(point => {
            timeMap.set(point.timestamp, {
                timestamp: point.timestamp,
                utilization: Number(point.value.toFixed(2)),
            });
        });

        // 添加温度数据
        temperatureSeries?.data.forEach(point => {
            const existing = timeMap.get(point.timestamp);
            if (existing) {
                existing.temperature = Number(point.value.toFixed(2));
            }
        });

        return Array.from(timeMap.values());
    }, [metricsResponse, timeRange]);

    // 渲染
    if (isLoading) {
        return (
            <ChartContainer title="GPU 使用率与温度" icon={Zap}>
                <ChartPlaceholder/>
            </ChartContainer>
        );
    }

    // 如果没有 GPU 数据，不渲染组件
    if (chartData.length === 0) {
        return null;
    }

    return (
        <ChartContainer title="GPU 使用率与温度" icon={Zap}>
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                    <CartesianGrid stroke="currentColor" strokeDasharray="4 4" className="stroke-slate-200 dark:stroke-cyan-900/30"/>
                    <XAxis
                        dataKey="timestamp"
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(value) => formatChartTime(Number(value), timeRange)}
                        stroke="currentColor"
                        className="stroke-gray-400 dark:stroke-cyan-600"
                        style={{fontSize: '12px'}}
                    />
                    <YAxis
                        yAxisId="left"
                        stroke="currentColor"
                        className="stroke-gray-400 dark:stroke-cyan-600"
                        style={{fontSize: '12px'}}
                        tickFormatter={(value) => `${value}%`}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="currentColor"
                        className="stroke-gray-400 dark:stroke-cyan-600"
                        style={{fontSize: '12px'}}
                        tickFormatter={(value) => `${value}°C`}
                    />
                    <Tooltip content={<CustomTooltip unit=""/>}/>
                    <Legend/>
                    <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="utilization"
                        name="使用率 (%)"
                        stroke="#7c3aed"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{r: 3}}
                    />
                    <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="temperature"
                        name="温度 (°C)"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{r: 3}}
                    />
                </LineChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};
