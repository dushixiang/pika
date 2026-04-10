import {useEffect, useMemo, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {type GetMetricsResponse, getMonitorHistory} from '@/api/monitor';
import {MONITOR_TIME_RANGE_OPTIONS} from '@portal/constants/time';
import {useIsMobile} from '@portal/hooks/use-mobile';
import type {AgentMonitorStat} from '@/types';
import CyberCard from "@portal/components/CyberCard.tsx";
import {ChartPlaceholder} from "@portal/components/ChartPlaceholder";
import {CustomTooltip} from "@portal/components/CustomTooltip";
import {TimeRangeSelector} from "@portal/components/TimeRangeSelector";
import {formatChartTime} from '@/lib/format.ts';
import {RotateCcw, ChevronDown, ChevronUp} from 'lucide-react';

interface ResponseTimeChartProps {
    monitorId: string;
    monitorStats: AgentMonitorStat[];
}

// 移除 LTTB 降采样，改用统一格点对齐插值以获得更好的多序列对齐效果


/**
 * 根据时间范围确定最大数据点数
 */
const getMaxDataPoints = (timeRange: string): number => {
    switch (timeRange) {
        case '15m':
        case '1h':
            return 200; // 短时间：详细数据
        case '12h':
            return 300;
        case '24h':
            return 400;
        case '7d':
            return 500;
        case '30d':
            return 600;
        default:
            return 400;
    }
};

/**
 * 生成不重复的颜色
 * 使用 HSL 色轮均匀分布，支持无限数量的探针
 */
const generateColors = (count: number): string[] => {
    const colors: string[] = [];
    const hueStep = 360 / count;
    
    for (let i = 0; i < count; i++) {
        const hue = (i * hueStep) % 360;
        const saturation = 65 + (i % 3) * 10;
        const lightness = 45 + (i % 2) * 10;
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
    
    return colors;
};

/**
 * 自定义图例组件
 */
const CustomLegend = ({ onClick, selectedAgents, allAgents, colors, collapsed }: any) => {
    if (!allAgents || allAgents.length === 0) return null;
    
    if (collapsed) return null;
    
    return (
        <div className="flex flex-wrap justify-center gap-4 pt-4">
            {allAgents.map((agent: { id: string; name: string }, index: number) => {
                const isSelected = selectedAgents.has(agent.id);
                const color = colors[index];
                
                return (
                    <div
                        key={agent.id}
                        onClick={() => onClick(agent.id)}
                        className="flex items-center gap-2 cursor-pointer transition-opacity"
                        style={{
                            opacity: isSelected ? 1 : 0.4,
                        }}
                    >
                        <svg width="32" height="12" className="overflow-visible">
                            <line
                                x1="0"
                                y1="6"
                                x2="32"
                                y2="6"
                                stroke={isSelected ? color : '#9ca3af'}
                                strokeWidth="2"
                            />
                        </svg>
                        <span
                            className="text-xs font-medium"
                            style={{
                                color: isSelected ? color : '#9ca3af',
                            }}
                        >
                            {agent.name}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

/**
 * 响应时间趋势图表组件
 * 显示监控各探针的响应时间变化
 */
export const ResponseTimeChart = ({monitorId, monitorStats}: ResponseTimeChartProps) => {
    const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
    const [timeRange, setTimeRange] = useState<string>('12h');
    const [customRange, setCustomRange] = useState<{ start: number; end: number } | null>(null);
    const [legendCollapsed, setLegendCollapsed] = useState(true); // 移动端默认收起
    const isMobile = useIsMobile();
    const customStart = timeRange === 'custom' ? customRange?.start : undefined;
    const customEnd = timeRange === 'custom' ? customRange?.end : undefined;
    const rangeMs = customStart !== undefined && customEnd !== undefined ? customEnd - customStart : undefined;

    // 获取历史数据
    const {data: historyData} = useQuery<GetMetricsResponse>({
        queryKey: ['monitorHistory', monitorId, timeRange, customStart, customEnd],
        queryFn: async () => {
            if (!monitorId) throw new Error('Monitor ID is required');
            const response = await getMonitorHistory(monitorId, {
                range: timeRange,
                start: customStart,
                end: customEnd,
            });
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

    // 初始化选中所有探针
    useEffect(() => {
        if (availableAgents.length > 0 && selectedAgents.size === 0) {
            setSelectedAgents(new Set(availableAgents.map(a => a.id)));
        }
    }, [availableAgents, selectedAgents.size]);

    // 动态生成颜色
    const colors = useMemo(() => {
        return generateColors(availableAgents.length);
    }, [availableAgents.length]);

    // 点击图例切换选中状态
    const handleLegendClick = (agentId: string) => {
        const newSelected = new Set(selectedAgents);
        
        // 判断是否是全选状态
        const isAllSelected = selectedAgents.size === availableAgents.length;
        
        if (isAllSelected) {
            // 全选状态下，点击某个 → 只选这一个
            setSelectedAgents(new Set([agentId]));
        } else {
            // 非全选状态下，点击切换
            if (newSelected.has(agentId)) {
                newSelected.delete(agentId);
            } else {
                newSelected.add(agentId);
            }
            setSelectedAgents(newSelected);
        }
    };

    // 点击图表线条切换选中状态
    const handleAreaClick = (data: any) => {
        if (!data || !data.dataKey) return;
        
        // 从 dataKey 中提取 agentId (格式: agent_${agentId})
        const agentId = data.dataKey.replace('agent_', '');
        
        const newSelected = new Set(selectedAgents);
        
        // 判断是否是全选状态
        const isAllSelected = selectedAgents.size === availableAgents.length;
        
        if (isAllSelected) {
            // 全选状态下，点击某个 → 只选这一个
            setSelectedAgents(new Set([agentId]));
        } else {
            // 非全选状态下，点击切换
            if (newSelected.has(agentId)) {
                newSelected.delete(agentId);
            } else {
                newSelected.add(agentId);
            }
            setSelectedAgents(newSelected);
        }
    };

    // 恢复全选
    const handleSelectAll = () => {
        setSelectedAgents(new Set(availableAgents.map(a => a.id)));
    };

    // 是否有探针未选中
    const hasUnselected = selectedAgents.size < availableAgents.length;

    // 切换图例显示/隐藏（仅移动端）
    const toggleLegend = () => {
        setLegendCollapsed(!legendCollapsed);
    };

    // 生成图表数据 - 使用统一时间网格对齐
    const chartData = useMemo(() => {
        if (!historyData?.series) return [];

        const seriesList = historyData.series.filter(s => s.name === 'response_time');
        if (seriesList.length === 0) return [];

        // 收集所有选中探针的数据
        const selectedSeriesData: Array<{ key: string; data: Array<{ timestamp: number; value: number }> }> = [];
        
        seriesList.forEach((s) => {
            const agentId = s.labels?.agent_id || 'unknown';
            if (!selectedAgents.has(agentId)) return;
            if (!s.data || s.data.length === 0) return;
            
            selectedSeriesData.push({
                key: `agent_${agentId}`,
                data: [...s.data].sort((a, b) => a.timestamp - b.timestamp)
            });
        });

        if (selectedSeriesData.length === 0) return [];

        // 确定全局时间范围
        let minTime = Infinity, maxTime = -Infinity;
        selectedSeriesData.forEach(s => {
            minTime = Math.min(minTime, s.data[0].timestamp);
            maxTime = Math.max(maxTime, s.data[s.data.length - 1].timestamp);
        });

        if (minTime >= maxTime) return [];

        // 生成均匀的目标时间点
        const maxPoints = getMaxDataPoints(timeRange);
        const timeStep = (maxTime - minTime) / (maxPoints - 1);
        const targetTimestamps: number[] = [];
        for (let i = 0; i < maxPoints; i++) {
            targetTimestamps.push(minTime + i * timeStep);
        }

        // 线性插值函数
        const interpolate = (data: Array<{ timestamp: number; value: number }>, targetTime: number): number | null => {
            if (data.length === 0) return null;
            if (data.length === 1) return data[0].timestamp === targetTime ? data[0].value : null;
            
            // 超出范围不插值（防止产生虚假连线）
            if (targetTime < data[0].timestamp || targetTime > data[data.length - 1].timestamp) {
                // 如果距离最近的点足够近（比如小于两个采样间隔），可以考虑保留，否则返回null
                return null;
            }
            
            // 二分查找
            let left = 0, right = data.length - 1;
            while (right - left > 1) {
                const mid = Math.floor((left + right) / 2);
                if (data[mid].timestamp <= targetTime) {
                    left = mid;
                } else {
                    right = mid;
                }
            }
            
            const leftPoint = data[left];
            const rightPoint = data[right];
            const ratio = (targetTime - leftPoint.timestamp) / (rightPoint.timestamp - leftPoint.timestamp);
            return leftPoint.value + ratio * (rightPoint.value - leftPoint.value);
        };

        // 对齐所有探针数据
        return targetTimestamps.map(timestamp => {
            const dataPoint: any = { timestamp };
            selectedSeriesData.forEach(s => {
                const value = interpolate(s.data, timestamp);
                if (value !== null) {
                    dataPoint[s.key] = Number(value.toFixed(2));
                }
            });
            return dataPoint;
        });
    }, [historyData, selectedAgents, timeRange, customStart, customEnd]);

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
                        enableCustom
                        customRange={customRange}
                        onCustomRangeApply={(range) => {
                            setCustomRange(range);
                        }}
                    />
                </div>
            </div>

            {/* 使用提示和恢复按钮 */}
            {availableAgents.length > 0 && (
                <div className="mb-3 flex items-center justify-between">
                    <div className="text-xs text-gray-500 dark:text-cyan-600">
                        💡 点击图表线条或图例切换显示
                    </div>
                    {hasUnselected && (
                        <button
                            onClick={handleSelectAll}
                            className="p-1.5 rounded
                                text-gray-500 dark:text-cyan-500 
                                hover:text-gray-700 dark:hover:text-cyan-400
                                hover:bg-gray-100 dark:hover:bg-cyan-900/30
                                transition-colors"
                            title="恢复全选"
                        >
                            <RotateCcw size={16} />
                        </button>
                    )}
                </div>
            )}

            {chartData.length > 0 ? (
                <div>
                    <ResponsiveContainer width="100%" height={360}>
                        <AreaChart data={chartData}>
                            <defs>
                                {Array.from(selectedAgents).map((agentId, index) => {
                                    const originalIndex = availableAgents.findIndex(a => a.id === agentId);
                                    const agentKey = `agent_${agentId}`;
                                    return (
                                        <linearGradient key={agentKey} id={`gradient_${agentKey}`} x1="0" y1="0"
                                                        x2="0" y2="1">
                                            <stop offset="5%" stopColor={colors[originalIndex]} stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor={colors[originalIndex]} stopOpacity={0}/>
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
                                tickFormatter={(value) => formatChartTime(Number(value), timeRange, rangeMs)}
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
                            {Array.from(selectedAgents).map((agentId) => {
                                const originalIndex = availableAgents.findIndex(a => a.id === agentId);
                                const agentKey = `agent_${agentId}`;
                                const agent = availableAgents.find(a => a.id === agentId);
                                return (
                                    <Area
                                        key={agentKey}
                                        type="monotone"
                                        dataKey={agentKey}
                                        name={agent?.name || agentId.substring(0, 8)}
                                        stroke={colors[originalIndex]}
                                        strokeWidth={2}
                                        fill={`url(#gradient_${agentKey})`}
                                        activeDot={{r: 5, strokeWidth: 0}}
                                        dot={false}
                                        connectNulls
                                        onClick={handleAreaClick}
                                        style={{cursor: 'pointer'}}
                                    />
                                );
                            })}
                        </AreaChart>
                    </ResponsiveContainer>
                    
                    {/* 桌面端：直接显示图例 */}
                    {!isMobile && availableAgents.length > 0 && (
                        <CustomLegend
                            onClick={handleLegendClick}
                            selectedAgents={selectedAgents}
                            allAgents={availableAgents}
                            colors={colors}
                        />
                    )}
                    
                    {/* 移动端：可折叠图例 */}
                    {isMobile && availableAgents.length > 0 && (
                        <div className="pt-4">
                            <button
                                onClick={toggleLegend}
                                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-gray-600 dark:text-cyan-400 hover:text-gray-900 dark:hover:text-cyan-300"
                            >
                                <span>{legendCollapsed ? '显示图例' : '收起图例'}</span>
                                {legendCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            </button>
                            <CustomLegend
                                onClick={handleLegendClick}
                                selectedAgents={selectedAgents}
                                allAgents={availableAgents}
                                colors={colors}
                                collapsed={legendCollapsed}
                            />
                        </div>
                    )}
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
