import {useMemo} from 'react';
import {HardDrive} from 'lucide-react';
import {Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {ChartPlaceholder, CustomTooltip} from '@/components/common';
import {useMetricsQuery} from '@/hooks/server/queries';
import {ChartContainer} from './ChartContainer';
import {formatChartTime} from '@/utils/util';

interface DiskIOChartProps {
    agentId: string;
    timeRange: string;
    aggregation?: 'avg' | 'max';
}

/**
 * 磁盘 I/O 图表组件
 */
export const DiskIOChart = ({agentId, timeRange, aggregation}: DiskIOChartProps) => {
    // 数据查询
    const {data: metricsResponse, isLoading} = useMetricsQuery({
        agentId,
        type: 'disk_io',
        range: timeRange,
        aggregation,
    });

    // 数据转换
    const chartData = useMemo(() => {
        if (!metricsResponse?.data.series || metricsResponse.data.series?.length === 0) return [];

        const readSeries = metricsResponse.data.series?.find(s => s.name === 'read');
        const writeSeries = metricsResponse.data.series?.find(s => s.name === 'write');

        if (!readSeries || !writeSeries) return [];

        // 按时间戳对齐数据
        const timeMap = new Map<number, any>();

        readSeries.data.forEach(point => {
            timeMap.set(point.timestamp, {
                timestamp: point.timestamp,
                read: Number((point.value / 1024 / 1024).toFixed(2)), // 转换为 MB/s
            });
        });

        writeSeries.data.forEach(point => {
            const existing = timeMap.get(point.timestamp);
            if (existing) {
                existing.write = Number((point.value / 1024 / 1024).toFixed(2));
            }
        });

        return Array.from(timeMap.values());
    }, [metricsResponse, timeRange]);

    // 渲染
    if (isLoading) {
        return (
            <ChartContainer title="磁盘 I/O (MB/s)" icon={HardDrive}>
                <ChartPlaceholder/>
            </ChartContainer>
        );
    }

    return (
        <ChartContainer title="磁盘 I/O (MB/s)" icon={HardDrive}>
            {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorDiskRead" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2C70F6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#2C70F6" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorDiskWrite" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6FD598" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#6FD598" stopOpacity={0}/>
                            </linearGradient>
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
                            tickFormatter={(value) => `${value} MB`}
                        />
                        <Tooltip content={<CustomTooltip unit=" MB"/>}/>
                        <Legend/>
                        <Area
                            type="monotone"
                            dataKey="read"
                            name="读取"
                            stroke="#2C70F6"
                            strokeWidth={2}
                            fill="url(#colorDiskRead)"
                            activeDot={{r: 3}}
                        />
                        <Area
                            type="monotone"
                            dataKey="write"
                            name="写入"
                            stroke="#6FD598"
                            strokeWidth={2}
                            fill="url(#colorDiskWrite)"
                            activeDot={{r: 3}}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <ChartPlaceholder subtitle="暂无磁盘 I/O 采集数据"/>
            )}
        </ChartContainer>
    );
};
