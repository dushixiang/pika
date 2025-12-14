import {useEffect, useMemo, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {
    Activity,
    AlertCircle,
    BarChart3,
    CheckCircle2,
    Clock,
    Globe,
    Loader2,
    Maximize2,
    Search,
    Server,
    Shield,
    ShieldCheck,
    Wifi
} from 'lucide-react';
import {type GetMetricsResponse, getMonitorHistory, getPublicMonitors} from '@/api/monitor.ts';
import type {PublicMonitor} from '@/types';
import {cn} from '@/lib/utils';
import {formatDateTime} from "@/utils/util.ts";
import {StatusBadge} from '@/components/monitor/StatusBadge';
import {CertBadge} from '@/components/monitor/CertBadge';
import {MiniChart} from '@/components/monitor/MiniChart';
import StatCard from "@/components/StatCard.tsx";
import CyberCard from "@/components/CyberCard.tsx";

const LoadingSpinner = () => (
    <div className="flex min-h-[400px] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-cyan-600">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400"/>
            <span className="text-sm font-mono">加载监控数据中...</span>
        </div>
    </div>
);

const EmptyState = () => (
    <div className="flex min-h-[400px] flex-col items-center justify-center text-cyan-500">
        <Shield className="mb-4 h-16 w-16 opacity-20"/>
        <p className="text-lg font-medium font-mono">暂无监控数据</p>
        <p className="mt-2 text-sm text-cyan-600">请先在管理后台添加监控任务</p>
    </div>
);

type DisplayMode = 'avg' | 'max';
type FilterStatus = 'all' | 'up' | 'down' | 'unknown';

// 类型图标组件
const TypeIcon = ({type}: { type: string }) => {
    switch (type.toUpperCase()) {
        case 'HTTPS':
            return <ShieldCheck className="w-4 h-4 text-purple-400"/>;
        case 'HTTP':
            return <Globe className="w-4 h-4 text-blue-400"/>;
        case 'TCP':
            return <Server className="w-4 h-4 text-amber-400"/>;
        case 'ICMP':
            return <Wifi className="w-4 h-4 text-cyan-400"/>;
        default:
            return <Activity className="w-4 h-4 text-slate-400"/>;
    }
};

// 监控卡片组件
const MonitorCard = ({monitor, displayMode}: {
    monitor: PublicMonitor;
    displayMode: DisplayMode;
}) => {
    // 为每个监控卡片查询历史数据
    const {data: historyData} = useQuery<GetMetricsResponse>({
        queryKey: ['monitorHistory', monitor.id, '1h'],
        queryFn: async () => {
            const response = await getMonitorHistory(monitor.id, '1h');
            return response.data;
        },
        refetchInterval: 60000,
        staleTime: 30000,
    });

    // 将 VictoriaMetrics 的时序数据转换为图表数据
    const chartData = useMemo(() => {
        if (!historyData || !historyData.series || historyData.series?.length === 0) {
            return [];
        }

        const timeMap = new Map<number, number[]>();

        historyData.series?.forEach(series => {
            if (series.data && series.data.length > 0) {
                series.data.forEach(point => {
                    if (!timeMap.has(point.timestamp)) {
                        timeMap.set(point.timestamp, []);
                    }
                    timeMap.get(point.timestamp)!.push(point.value);
                });
            }
        });

        const result = Array.from(timeMap.entries())
            .map(([timestamp, values]) => {
                let aggregatedValue: number;
                if (displayMode === 'avg') {
                    aggregatedValue = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
                } else {
                    aggregatedValue = Math.max(...values);
                }

                return {
                    time: new Date(timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
                    value: aggregatedValue,
                };
            });

        return result;
    }, [historyData, displayMode]);

    const displayValue = displayMode === 'avg' ? monitor.responseTime : monitor.responseTimeMax;
    const displayLabel = displayMode === 'avg' ? '平均延迟' : '最差节点延迟';

    return (
        <CyberCard className={'p-5'} animation={true} hover={true}>
            {/* 头部 */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex gap-3 flex-1 min-w-0">
                    <div
                        className="p-2.5 bg-cyan-950/30 border border-cyan-500/20 rounded-lg flex-shrink-0">
                        <TypeIcon type={monitor.type}/>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-cyan-500/60 mb-0.5 tracking-wider">
                            TARGET_ID: {monitor.id.toString().substring(0, 8)}
                        </div>
                        <h3 className="font-bold text-sm text-cyan-100 tracking-wide truncate group-hover:text-cyan-400 transition-colors">
                            {monitor.name}
                        </h3>
                    </div>
                </div>
                <div className="flex-shrink-0 ml-2">
                    <StatusBadge status={monitor.status}/>
                </div>
            </div>

            {/* 指标信息 */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <p className="text-xs text-cyan-500/60 mb-1 flex items-center gap-1">
                        {displayLabel}
                        {monitor.agentCount > 0 && (
                            <span
                                className="bg-slate-700 text-[10px] px-1.5 rounded-full text-cyan-300">
                                    {monitor.agentCount} 节点
                                </span>
                        )}
                    </p>
                    <p className={cn(
                        "text-xl font-bold flex items-end gap-1 font-mono",
                        displayValue > 200 ? 'text-amber-400' : 'text-cyan-100'
                    )}>
                        {displayValue} <span className="text-xs font-normal text-cyan-600 mb-1">ms</span>
                    </p>
                </div>
                <div>
                    {monitor.type === 'https' && monitor.certExpiryTime ? (
                        <>
                            <p className="text-xs text-cyan-500/60 mb-1">SSL 证书</p>
                            <CertBadge
                                expiryTime={monitor.certExpiryTime}
                                daysLeft={monitor.certDaysLeft}
                            />
                        </>
                    ) : (
                        <>
                            <p className="text-xs text-cyan-500/60 mb-1">上次检测</p>
                            <p className="text-sm font-medium text-cyan-300 font-mono">
                                {formatDateTime(monitor.lastCheckTime)}
                            </p>
                        </>
                    )}
                </div>
            </div>

            {/* 迷你走势图 */}
            <MiniChart
                data={chartData}
                status={monitor.status}
                id={monitor.id}
            />
        </CyberCard>
    );
};

interface Stats {
    total: number;
    online: number;
    issues: number;
    avgLatency: number;
}

const MonitorList = () => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState<FilterStatus>('all');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [displayMode, setDisplayMode] = useState<DisplayMode>('max');

    const {data: monitors = [], isLoading} = useQuery<PublicMonitor[]>({
        queryKey: ['publicMonitors'],
        queryFn: async () => {
            const response = await getPublicMonitors();
            return response.data || [];
        },
        refetchInterval: 30000,
    });

    let [stats, setStats] = useState<Stats>();

    // 过滤和搜索
    const filteredMonitors = useMemo(() => {
        let result = monitors;

        // 状态过滤
        if (filter !== 'all') {
            result = result.filter(m => m.status === filter);
        }

        // 搜索过滤
        if (searchKeyword.trim()) {
            const keyword = searchKeyword.toLowerCase();
            result = result.filter(m =>
                m.name.toLowerCase().includes(keyword) ||
                m.target.toLowerCase().includes(keyword)
            );
        }

        return result;
    }, [monitors, filter, searchKeyword]);

    // 统计信息
    const calculateStats = (monitors: PublicMonitor[]) => {
        const total = monitors.length;
        const online = monitors.filter(m => m.status === 'up').length;
        const issues = total - online;
        const avgLatency = total > 0
            ? Math.round(monitors.reduce((acc, curr) => acc + curr.responseTime, 0) / total)
            : 0;
        return {total, online, issues, avgLatency};
    }

    useEffect(() => {
        let stats = calculateStats(monitors);
        setStats(stats);
    }, [monitors]);

    if (isLoading) {
        return (
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
                <LoadingSpinner/>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
            {/* 统计卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <StatCard
                    title="监控服务总数"
                    value={stats?.total}
                    icon={Server}
                    color="gray"
                />
                <StatCard
                    title="系统正常"
                    value={stats?.online}
                    icon={CheckCircle2}
                    color="emerald"
                />
                <StatCard
                    title="异常服务"
                    value={stats?.issues}
                    icon={AlertCircle}
                    color="rose"
                />
                <StatCard
                    title="全局平均延迟"
                    value={`${stats?.avgLatency}ms`}
                    icon={Clock}
                    color="blue"
                />
            </div>

            {/* 过滤和搜索 */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="flex flex-wrap gap-4 items-center w-full md:w-auto">
                    {/* 状态过滤 */}
                    <div
                        className="flex gap-2 bg-black/40 p-1 rounded-lg border border-cyan-900/50">
                        {(['all', 'up', 'down', 'unknown'] as const).map(f => {
                            const labels = {all: '全部', up: '正常', down: '异常', unknown: '未知'};
                            return (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-md text-xs font-medium transition-all font-mono cursor-pointer",
                                        filter === f
                                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                            : 'text-cyan-600 hover:text-cyan-400'
                                    )}
                                >
                                    {labels[f]}
                                </button>
                            );
                        })}
                    </div>

                    {/* 显示模式切换 */}
                    <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-cyan-900/50 items-center">
                        <span className="text-xs text-cyan-600 px-2 font-mono">卡片指标:</span>
                        <button
                            onClick={() => setDisplayMode('avg')}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded transition-all flex items-center gap-1 font-mono cursor-pointer",
                                displayMode === 'avg'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : 'text-cyan-600 hover:text-cyan-400'
                            )}
                        >
                            <BarChart3 className="w-3 h-3"/> 平均
                        </button>
                        <button
                            onClick={() => setDisplayMode('max')}
                            className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded transition-all flex items-center gap-1 font-mono cursor-pointer",
                                displayMode === 'max'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : 'text-cyan-600 hover:text-cyan-400'
                            )}
                        >
                            <Maximize2 className="w-3 h-3"/> 最差(Max)
                        </button>
                    </div>
                </div>

                {/* 搜索框 */}
                <div className="relative w-full md:w-64 group">
                    <div
                        className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                    <div className="relative flex items-center bg-[#0a0b10] rounded-lg border border-cyan-900">
                        <Search className="w-4 h-4 ml-3 text-cyan-600"/>
                        <input
                            type="text"
                            placeholder="搜索服务名称或地址..."
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            className="w-full bg-transparent border-none text-xs text-cyan-100 p-2.5 focus:ring-0 placeholder-cyan-800 font-mono focus:outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* 监控卡片列表 */}
            {filteredMonitors.length === 0 ? (
                <EmptyState/>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredMonitors.map(monitor => (
                        <Link to={`/monitors/${monitor.id}`}>
                            <MonitorCard
                                key={monitor.id}
                                monitor={monitor}
                                displayMode={displayMode}
                            />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MonitorList;
