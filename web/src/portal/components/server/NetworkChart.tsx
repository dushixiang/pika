import {useEffect, useMemo, useState} from 'react';
import {Network} from 'lucide-react';
import {Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {ChartPlaceholder} from '@portal/components/ChartPlaceholder';
import {CustomTooltip} from '@portal/components/CustomTooltip';
import {useMetricsQuery, useNetworkInterfacesQuery} from '@portal/hooks/server';
import {INTERFACE_COLORS} from '@portal/constants/server';
import {ChartContainer} from './ChartContainer';
import {formatChartTime} from '@portal/utils/util';

interface NetworkChartProps {
    agentId: string;
    timeRange: string;
    start?: number;
    end?: number;
}

/**
 * 网络流量图表组件
 * 支持网卡切换
 */
export const NetworkChart = ({agentId, timeRange, start, end}: NetworkChartProps) => {
    const [selectedInterface, setSelectedInterface] = useState<string>('all');
    const rangeMs = start !== undefined && end !== undefined ? end - start : undefined;

    // 查询网卡列表
    const {data: interfacesData} = useNetworkInterfacesQuery(agentId);
    const availableInterfaces = interfacesData?.data.interfaces || [];

    // 当网卡列表变化时，验证选中的网卡
    useEffect(() => {
        if (selectedInterface !== 'all' && availableInterfaces.length > 0) {
            if (!availableInterfaces.includes(selectedInterface)) {
                setSelectedInterface('all');
            }
        }
    }, [availableInterfaces, selectedInterface]);

    // 查询网络数据
    const {data: metricsResponse, isLoading} = useMetricsQuery({
        agentId,
        type: 'network',
        range: start !== undefined && end !== undefined ? undefined : timeRange,
        start,
        end,
        interfaceName: selectedInterface !== 'all' ? selectedInterface : undefined,
    });

    // 数据转换
    const chartData = useMemo(() => {
        if (!metricsResponse?.data.series || metricsResponse.data.series?.length === 0) return [];

        const uploadSeries = metricsResponse.data.series?.find(s => s.name === 'upload');
        const downloadSeries = metricsResponse.data.series?.find(s => s.name === 'download');

        if (!uploadSeries || !downloadSeries) return [];

        const timeMap = new Map<number, any>();

        uploadSeries.data.forEach(point => {
            timeMap.set(point.timestamp, {
                timestamp: point.timestamp,
                upload: Number((point.value / 1024 / 1024).toFixed(2)), // 转换为 MB/s
            });
        });

        downloadSeries.data.forEach(point => {
            const existing = timeMap.get(point.timestamp);
            if (existing) {
                existing.download = Number((point.value / 1024 / 1024).toFixed(2));
            }
        });

        return Array.from(timeMap.values());
    }, [metricsResponse, timeRange, start, end]);

    // 网卡选择器
    const interfaceSelector = availableInterfaces.length > 0 && (
        <select
            value={selectedInterface}
            onChange={(e) => setSelectedInterface(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-cyan-900/50 bg-white dark:bg-black/40 px-3 py-1.5 text-xs font-mono text-gray-700 dark:text-cyan-300 hover:border-slate-300 dark:hover:border-cyan-700 focus:border-slate-400 dark:focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-cyan-500/20"
        >
            {availableInterfaces.map((iface) => (
                <option key={iface} value={iface}>
                    {iface}
                </option>
            ))}
        </select>
    );

    // 渲染
    if (isLoading) {
        return (
            <ChartContainer title="网络流量（MB/s）" icon={Network} action={interfaceSelector}>
                <ChartPlaceholder/>
            </ChartContainer>
        );
    }

    return (
        <ChartContainer title="网络流量（MB/s）" icon={Network} action={interfaceSelector}>
            {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="color-upload" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={INTERFACE_COLORS[0].upload} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={INTERFACE_COLORS[0].upload} stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="color-download" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={INTERFACE_COLORS[0].download} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={INTERFACE_COLORS[0].download} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="currentColor" strokeDasharray="4 4" className="stroke-slate-200 dark:stroke-cyan-900/30"/>
                        <XAxis
                            dataKey="timestamp"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(value) => formatChartTime(Number(value), timeRange, rangeMs)}
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
                        <Tooltip content={<CustomTooltip unit=" MB/s"/>}/>
                        <Legend/>
                        <Area
                            type="monotone"
                            dataKey="upload"
                            name="上行"
                            stroke={INTERFACE_COLORS[0].upload}
                            strokeWidth={2}
                            fill="url(#color-upload)"
                            activeDot={{r: 3}}
                        />
                        <Area
                            type="monotone"
                            dataKey="download"
                            name="下行"
                            stroke={INTERFACE_COLORS[0].download}
                            strokeWidth={2}
                            fill="url(#color-download)"
                            activeDot={{r: 3}}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <ChartPlaceholder subtitle="稍后再次尝试刷新网络流量"/>
            )}
        </ChartContainer>
    );
};
