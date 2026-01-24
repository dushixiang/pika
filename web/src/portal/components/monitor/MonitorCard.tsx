// 监控卡片组件
import type {PublicMonitor} from "@/types";
import {useQuery} from "@tanstack/react-query";
import {type GetMetricsResponse, getMonitorHistory} from "@/api/monitor.ts";
import {useMemo} from "react";
import CyberCard from "@portal/components/CyberCard.tsx";
import {StatusBadge} from "@portal/components/StatusBadge";
import {CertBadge} from "@portal/components/monitor/CertBadge.tsx";
import {formatDateTime} from "@portal/utils/util.ts";
import {MiniChart} from "@portal/components/monitor/MiniChart.tsx";
import {TypeIcon} from "@portal/components/monitor/TypeIcon";

export type DisplayMode = 'avg' | 'max';

const MonitorCard = ({monitor, displayMode}: {
    monitor: PublicMonitor;
    displayMode: DisplayMode;
}) => {
    // 为每个监控卡片查询历史数据
    const {data: historyData} = useQuery<GetMetricsResponse>({
        queryKey: ['monitorHistory', monitor.id, '12h'], // 对应后端 60 秒步长
        queryFn: async () => {
            const response = await getMonitorHistory(monitor.id, {range: '1h'});
            return response.data;
        },
        refetchInterval: 60000,
        staleTime: 30000,
    });

    // 转换时序数据为图表数据 - 保持原始 timestamp
    const chartData = useMemo(() => {
        if (!historyData?.series || historyData.series.length === 0) {
            return [];
        }

        // 按时间戳聚合多个探针的数据
        const timeMap = new Map<number, number[]>();

        historyData.series.forEach(series => {
            series.data?.forEach(point => {
                if (!timeMap.has(point.timestamp)) {
                    timeMap.set(point.timestamp, []);
                }
                timeMap.get(point.timestamp)!.push(point.value);
            });
        });

        // 根据显示模式计算聚合值
        return Array.from(timeMap.entries()).map(([timestamp, values]) => ({
            timestamp,
            value: displayMode === 'avg'
                ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
                : Math.max(...values),
        }));
    }, [historyData, displayMode]);

    const displayValue = displayMode === 'avg' ? monitor.responseTime : monitor.responseTimeMax;
    const displayLabel = displayMode === 'avg' ? '平均延迟' : '最差节点延迟';

    return (
        <CyberCard className={'p-5'} animation={true} hover={true}>
            {/* 头部 */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex gap-3 flex-1 min-w-0">
                    <div
                        className="p-2.5 bg-gray-100 dark:bg-cyan-950/30 border border-slate-200 dark:border-cyan-500/20 rounded-lg flex-shrink-0">
                        <TypeIcon type={monitor.type}/>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-slate-800 dark:text-cyan-100 tracking-wide truncate group-hover:text-cyan-500 transition-colors">
                            {monitor.name}
                        </h3>
                        <div className="text-xs font-mono text-gray-600 dark:text-cyan-500/80 mb-0.5 tracking-wider truncate">
                            {monitor.target}
                        </div>
                    </div>
                </div>
                <div className="flex-shrink-0 ml-2">
                    <StatusBadge status={monitor.status}/>
                </div>
            </div>

            {/* 指标信息 */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <p className="text-xs text-gray-600 dark:text-cyan-500 mb-1 flex items-center gap-1">
                        {displayLabel}
                        {monitor.agentCount > 0 && (
                            <span
                                className="bg-slate-200 dark:bg-slate-700 text-xs px-1.5 rounded-full text-slate-700 dark:text-cyan-300">
                                    {monitor.agentCount} 节点
                                </span>
                        )}
                    </p>
                    <div
                        className={`text-xl font-bold flex items-baseline gap-1 ${displayValue > 200 ? 'text-amber-600 dark:text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)] dark:drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-slate-800 dark:text-white drop-shadow-none dark:drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]'}`}>
                        {displayValue}<span className="text-xs text-gray-600 dark:text-cyan-500 font-normal">ms</span>
                    </div>
                </div>
                <div>
                    {monitor.type === 'https' && monitor.certExpiryTime ? (
                        <>
                            <p className="text-xs text-gray-600 dark:text-cyan-500 mb-1">SSL 证书</p>
                            <CertBadge
                                expiryTime={monitor.certExpiryTime}
                                daysLeft={monitor.certDaysLeft}
                            />
                        </>
                    ) : (
                        <>
                            <p className="text-xs text-gray-600 dark:text-cyan-500 mb-1">上次检测</p>
                            <p className="md:text-sm text-xs text-gray-700 dark:text-cyan-300 font-mono">
                                {formatDateTime(monitor.lastCheckTime)}
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* 迷你走势图 */}
            <MiniChart
                data={chartData}
                lastValue={displayValue}
                id={monitor.id}
            />
        </CyberCard>
    );
};

export default MonitorCard;
