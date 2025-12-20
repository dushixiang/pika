import {useEffect, useMemo, useState} from 'react';
import {Thermometer} from 'lucide-react';
import {CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {ChartPlaceholder, CustomTooltip} from '@/components/common';
import {useMetricsQuery} from '@/hooks/server/queries';
import {TEMPERATURE_COLORS} from '@/constants/server';
import {ChartContainer} from './ChartContainer';
import {formatChartTime} from '@/utils/util';

interface TemperatureChartProps {
    agentId: string;
    timeRange: string;
    aggregation?: 'avg' | 'max';
}

/**
 * 系统温度图表组件
 * 支持温度类型切换
 */
export const TemperatureChart = ({agentId, timeRange, aggregation}: TemperatureChartProps) => {
    const [selectedTempType, setSelectedTempType] = useState<string>('all');

    // 数据查询
    const {data: metricsResponse, isLoading} = useMetricsQuery({
        agentId,
        type: 'temperature',
        range: timeRange,
        aggregation,
    });

    // 数据转换
    const chartData = useMemo(() => {
        if (!metricsResponse?.data.series || metricsResponse.data.series?.length === 0) return [];

        // 按时间戳聚合所有温度系列
        const timeMap = new Map<number, any>();

        metricsResponse.data.series?.forEach(series => {
            const sensorName = series.name; // 使用系列名称作为传感器标识
            series.data.forEach(point => {
                if (!timeMap.has(point.timestamp)) {
                    timeMap.set(point.timestamp, {timestamp: point.timestamp});
                }

                const existing = timeMap.get(point.timestamp)!;
                existing[sensorName] = Number(point.value.toFixed(2));
            });
        });

        return Array.from(timeMap.values());
    }, [metricsResponse, timeRange]);

    // 提取所有唯一的温度类型
    const temperatureTypes = useMemo(() => {
        return metricsResponse?.data.series?.map(s => s.name).sort() || [];
    }, [metricsResponse]);

    // 根据选中的类型过滤温度数据
    const filteredTemperatureTypes = useMemo(() => {
        if (selectedTempType === 'all') {
            return temperatureTypes;
        }
        return temperatureTypes.filter(type => type === selectedTempType);
    }, [temperatureTypes, selectedTempType]);

    // 当温度类型列表变化时，如果当前选中的类型不在列表中，重置为 'all'
    useEffect(() => {
        if (selectedTempType !== 'all' && temperatureTypes.length > 0) {
            if (!temperatureTypes.includes(selectedTempType)) {
                setSelectedTempType('all');
            }
        }
    }, [temperatureTypes, selectedTempType]);

    // 温度类型选择器
    const tempTypeSelector = temperatureTypes.length > 1 && (
        <select
            value={selectedTempType}
            onChange={(e) => setSelectedTempType(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-cyan-900/50 bg-white dark:bg-black/40 px-3 py-1.5 text-xs font-mono text-gray-700 dark:text-cyan-300 hover:border-slate-300 dark:hover:border-cyan-700 focus:border-slate-400 dark:focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-cyan-500/20"
        >
            <option value="all">所有类型</option>
            {temperatureTypes.map((type) => (
                <option key={type} value={type}>
                    {type}
                </option>
            ))}
        </select>
    );

    // 渲染
    if (isLoading) {
        return (
            <ChartContainer title="系统温度" icon={Thermometer} action={tempTypeSelector}>
                <ChartPlaceholder/>
            </ChartContainer>
        );
    }

    // 如果没有温度数据，不渲染组件
    if (chartData.length === 0 || temperatureTypes.length === 0) {
        return null;
    }

    return (
        <ChartContainer title="系统温度" icon={Thermometer} action={tempTypeSelector}>
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
                        tickFormatter={(value) => `${value}°C`}
                    />
                    <Tooltip content={<CustomTooltip unit="°C"/>}/>
                    <Legend/>
                    {/* 为选中的温度类型渲染线条 */}
                    {filteredTemperatureTypes.map((type, index) => {
                        // 使用预定义颜色，如果没有则使用默认颜色
                        const color = TEMPERATURE_COLORS[type] || `hsl(${(index * 60) % 360}, 70%, 50%)`;
                        return (
                            <Line
                                key={type}
                                type="monotone"
                                dataKey={type}
                                name={type}
                                stroke={color}
                                strokeWidth={2}
                                dot={false}
                                activeDot={{r: 3}}
                                connectNulls
                            />
                        );
                    })}
                </LineChart>
            </ResponsiveContainer>
        </ChartContainer>
    );
};
