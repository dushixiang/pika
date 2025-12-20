import {useEffect, useMemo, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {type GetMetricsResponse, getMonitorHistory} from '@/api/monitor';
import {AGENT_COLORS} from '@/constants/colors';
import {MONITOR_TIME_RANGE_OPTIONS} from '@/constants/time';
import {AGGREGATION_OPTIONS, type AggregationOptionValue} from '@/constants/metrics';
import {useIsMobile} from '@/hooks/use-mobile';
import type {AgentMonitorStat} from '@/types';
import CyberCard from "@/components/CyberCard.tsx";
import {AggregationSelector, ChartPlaceholder, CustomTooltip, MobileLegend, TimeRangeSelector} from "@/components/common";
import {formatChartTime} from '@/utils/util';

interface ResponseTimeChartProps {
    monitorId: string;
    monitorStats: AgentMonitorStat[];
}

/**
 * 响应时间趋势图表组件
 * 显示监控各探针的响应时间变化
 */
export const ResponseTimeChart = ({monitorId, monitorStats}: ResponseTimeChartProps) => {
    const [selectedAgent, setSelectedAgent] = useState<string>('all');
    const [timeRange, setTimeRange] = useState<string>('1h');
    const [aggregation, setAggregation] = useState<AggregationOptionValue>('avg');
    const isMobile = useIsMobile();

    // 获取历史数据
    const {data: historyData} = useQuery<GetMetricsResponse>({
        queryKey: ['monitorHistory', monitorId, timeRange, aggregation],
        queryFn: async () => {
            if (!monitorId) throw new Error('Monitor ID is required');
            const response = await getMonitorHistory(monitorId, timeRange, aggregation);
            return response.data;
        },
        refetchInterval: 30000,
        enabled: !!monitorId,
    });

    // 获取所有可用的探针列表
    const availableAgents = useMemo(() => {
        if (monitorStats.length === 0) return [];
        return monitorStats.map(stat => ({
            id: stat.agentId,
            name: stat.agentName || stat.agentId.substring(0, 8),
        }));
    }, [monitorStats]);

    // 当可用探针列表变化时，检查当前选择的探针是否还存在
    useEffect(() => {
        if (selectedAgent === 'all') return;
        if (!availableAgents.find(agent => agent.id === selectedAgent)) {
            setSelectedAgent('all');
        }
    }, [availableAgents, selectedAgent]);

    // 生成图表数据
    const chartData = useMemo(() => {
        if (!historyData?.series) return [];

        // 过滤出响应时间指标的 series
        const responseTimeSeries = historyData.series?.filter(s => s.name === 'response_time');

        // 根据选择的探针过滤（使用 agent_id）
        const filteredSeries = selectedAgent === 'all'
            ? responseTimeSeries
            : responseTimeSeries.filter(s => s.labels?.agent_id === selectedAgent);

        if (filteredSeries.length === 0) return [];

        // 按时间戳分组数据
        const grouped: Record<number, any> = {};

        filteredSeries.forEach(series => {
            // 使用 agent_id 作为标识符
            const agentId = series.labels?.agent_id || 'unknown';
            const agentKey = `agent_${agentId}`;

            series.data.forEach(point => {
                if (!grouped[point.timestamp]) {
                    grouped[point.timestamp] = {
                        timestamp: point.timestamp,
                    };
                }
                grouped[point.timestamp][agentKey] = point.value;
            });
        });

        // 按时间戳排序
        return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
    }, [historyData, selectedAgent, timeRange]);

    const visibleMonitorStats = useMemo(() => {
        return monitorStats.filter(stat => selectedAgent === 'all' || stat.agentId === selectedAgent);
    }, [monitorStats, selectedAgent]);

    // 准备移动端图例数据
    const legendItems = useMemo(() => {
        return visibleMonitorStats.map((stat) => {
            const originalIndex = monitorStats.findIndex(s => s.agentId === stat.agentId);
            const color = AGENT_COLORS[originalIndex % AGENT_COLORS.length];
            const label = stat.agentName || stat.agentId.substring(0, 8);
            return {
                key: stat.agentId,
                label,
                color,
            };
        });
    }, [visibleMonitorStats, monitorStats]);

    return (
        <CyberCard className={'p-6'}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h3 className="text-lg font-bold tracking-wide text-slate-800 dark:text-cyan-100 uppercase">响应时间趋势</h3>
                    <p className="text-xs text-gray-600 dark:text-cyan-500 mt-1 font-mono">监控各探针的响应时间变化</p>
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
                    <TimeRangeSelector
                        value={timeRange}
                        onChange={setTimeRange}
                        options={MONITOR_TIME_RANGE_OPTIONS}
                    />
                    <AggregationSelector
                        value={aggregation}
                        onChange={setAggregation}
                        options={AGGREGATION_OPTIONS}
                    />
                    {availableAgents.length > 0 && (
                        <select
                            value={selectedAgent}
                            onChange={(e) => setSelectedAgent(e.target.value)}
                            className="rounded-lg border border-slate-200 dark:border-cyan-900/50 bg-white dark:bg-black/40 px-3 py-2 text-xs font-medium text-gray-700 dark:text-cyan-300 hover:border-slate-300 dark:hover:border-cyan-500/50 focus:border-slate-400 dark:focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-cyan-500/20 transition-colors font-mono"
                        >
                            <option value="all">所有探针</option>
                            {availableAgents.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                    {agent.name}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {chartData.length > 0 ? (
                <div>
                    <ResponsiveContainer width="100%" height={360}>
                        <AreaChart data={chartData}>
                            <defs>
                                {visibleMonitorStats.map((stat) => {
                                    const originalIndex = monitorStats.findIndex(s => s.agentId === stat.agentId);
                                    const agentKey = `agent_${stat.agentId}`;
                                    const color = AGENT_COLORS[originalIndex % AGENT_COLORS.length];
                                    return (
                                        <linearGradient key={agentKey} id={`gradient_${agentKey}`} x1="0" y1="0"
                                                        x2="0" y2="1">
                                            <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor={color} stopOpacity={0}/>
                                        </linearGradient>
                                    );
                                })}
                            </defs>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                className="stroke-slate-200 dark:stroke-cyan-900/30"
                                vertical={false}
                            />
                            <XAxis
                                dataKey="timestamp"
                                type="number"
                                scale="time"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(value) => formatChartTime(Number(value), timeRange)}
                                className="text-xs text-gray-600 dark:text-cyan-500 font-mono"
                                stroke="currentColor"
                                tickLine={false}
                                axisLine={false}
                                angle={-15}
                                textAnchor="end"
                            />
                            <YAxis
                                className="text-xs text-gray-600 dark:text-cyan-500 font-mono"
                                stroke="currentColor"
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}ms`}
                            />
                            <Tooltip
                                content={<CustomTooltip unit={'ms'}/>}
                                wrapperStyle={{zIndex: 9999}}
                            />
                            {!isMobile && (
                                <Legend
                                    wrapperStyle={{paddingTop: '20px', zIndex: 1}}
                                    iconType="circle"
                                />
                            )}
                            {visibleMonitorStats.map((stat) => {
                                const originalIndex = monitorStats.findIndex(s => s.agentId === stat.agentId);
                                const agentKey = `agent_${stat.agentId}`;
                                const color = AGENT_COLORS[originalIndex % AGENT_COLORS.length];
                                const agentLabel = stat.agentName || stat.agentId.substring(0, 8);
                                return (
                                    <Area
                                        key={agentKey}
                                        type="monotone"
                                        dataKey={agentKey}
                                        name={agentLabel}
                                        stroke={color}
                                        strokeWidth={2}
                                        fill={`url(#gradient_${agentKey})`}
                                        activeDot={{r: 5, strokeWidth: 0}}
                                        dot={false}
                                    />
                                );
                            })}
                        </AreaChart>
                    </ResponsiveContainer>

                    <MobileLegend items={legendItems} show={isMobile}/>
                </div>
            ) : (
                <ChartPlaceholder
                    subtitle="正在收集数据，请稍后查看历史趋势"
                    heightClass="h-80"
                />
            )}
        </CyberCard>
    );
};
