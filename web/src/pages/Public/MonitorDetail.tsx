import type {ReactNode} from 'react';
import {useEffect, useMemo, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    Clock,
    Globe,
    Loader2,
    Server as ServerIcon,
    Shield,
    TrendingUp
} from 'lucide-react';
import type {TooltipProps} from 'recharts';
import {Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,} from 'recharts';
import {
    type AgentMonitorStat,
    type GetMetricsResponse,
    getMonitorAgentStats,
    getMonitorHistory,
    getMonitorStatsById
} from '@/api/monitor.ts';
import type {PublicMonitor} from '@/types';
import {cn} from '@/lib/utils';
import {formatDate, formatDateTime, formatTime} from "@/utils/util.ts";
import {renderCert} from "@/pages/Public/Monitor.tsx";


const formatPercentValue = (value: number): string => (Number.isFinite(value) ? value.toFixed(2) : '0.00');

const LoadingSpinner = () => (
    <div className="flex min-h-screen items-center justify-center dark:bg-[#141414]">
        <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-400"/>
            <p className="text-sm text-slate-500 dark:text-slate-400">数据加载中，请稍候...</p>
        </div>
    </div>
);

const EmptyState = ({message = '监控数据不存在'}: { message?: string }) => (
    <div className="flex min-h-screen items-center justify-center dark:bg-[#141414]">
        <div className="flex flex-col items-center gap-3 text-center">
            <div
                className="flex h-16 w-16 items-center justify-center rounded-full  text-slate-400 dark:text-slate-300">
                <Shield className="h-8 w-8"/>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
        </div>
    </div>
);

const timeRangeOptions = [
    {label: '15分钟', value: '15m'},
    {label: '30分钟', value: '30m'},
    {label: '1小时', value: '1h'},
    {label: '3小时', value: '3h'},
    {label: '6小时', value: '6h'},
    {label: '12小时', value: '12h'},
    {label: '1天', value: '1d'},
    {label: '3天', value: '3d'},
    {label: '7天', value: '7d'},
]

const ChartPlaceholder = ({
                              icon: Icon = TrendingUp,
                              title = '暂无数据',
                              subtitle = '等待采集新数据后展示图表',
                              heightClass = 'h-80',
                          }: {
    icon?: typeof TrendingUp;
    title?: string;
    subtitle?: string;
    heightClass?: string;
}) => (
    <div
        className={cn(
            "flex items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400",
            heightClass
        )}
    >
        <div className="text-center">
            <Icon className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600"/>
            <p>{title}</p>
            {subtitle ? <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p> : null}
        </div>
    </div>
);

const Card = ({
                  title,
                  description,
                  action,
                  children,
              }: {
    title?: string;
    description?: string;
    action?: ReactNode;
    children: ReactNode;
}) => (
    <section
        className="rounded-3xl border border-slate-200 dark:border-slate-700   p-6">
        {(title || description || action) && (
            <div
                className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-700 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    {title ?
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2> : null}
                    {description ?
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
            </div>
        )}
        <div className="pt-4">{children}</div>
    </section>
);

const StatusBadge = ({status}: { status: string }) => {
    let containerClass = 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400';
    let label = '未知';
    let icon = <Clock className="h-4 w-4"/>;

    if (status === 'up') {
        containerClass = 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-200';
        label = '正常';
        icon = <CheckCircle2 className="h-4 w-4"/>;
    } else if (status === 'down') {
        containerClass = 'bg-red-50 dark:bg-rose-500/15 text-red-700 dark:text-rose-200';
        label = '异常';
        icon = <AlertCircle className="h-4 w-4"/>;
    }

    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
                containerClass
            )}>
            {icon}
            {label}
        </div>
    );
};

const UptimeBar = ({uptime}: { uptime: number }) => {
    const percentage = Math.min(Math.max(uptime, 0), 100);
    const colorClass = percentage >= 99 ? 'bg-emerald-500' : percentage >= 95 ? 'bg-yellow-500' : 'bg-red-500';

    return (
        <div className="flex items-center gap-2">
            <div className="relative h-3 w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700">
                <div
                    className={cn("absolute inset-y-0 left-0 transition-all duration-500", colorClass)}
                    style={{width: `${percentage}%`}}
                />
            </div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 w-16 text-right">
                {formatPercentValue(percentage)}%
            </span>
        </div>
    );
};

const statThemes = {
    blue: {
        icon: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
        accent: 'text-slate-700 dark:text-slate-300',
    },
    emerald: {
        icon: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
        accent: 'text-slate-700 dark:text-slate-300',
    },
    amber: {
        icon: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
        accent: 'text-slate-700 dark:text-slate-300',
    },
    rose: {
        icon: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
        accent: 'text-slate-700 dark:text-slate-300',
    },
};

const StatCard = ({icon, label, value, color = 'blue'}: {
    icon: ReactNode;
    label: string;
    value: string | number;
    color?: string;
}) => {
    const theme = statThemes[color as keyof typeof statThemes] ?? statThemes.blue;

    return (
        <div
            className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", theme.icon)}>
                        {icon}
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-white">
                            {label}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">当前指标</div>
                    </div>
                </div>
                <span className={cn("text-xl font-bold", theme.accent)}>{value}</span>
            </div>
        </div>
    );
};

const CustomTooltip = ({active, payload, label, unit = ' ms'}: TooltipProps<number, string> & {
    unit?: string;
    label?: string;
    payload?: any[]
}) => {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    // 从 payload 中获取完整的时间戳信息（如果有的话）
    const fullTimestamp = payload[0]?.payload?.timestamp;
    const displayLabel = fullTimestamp
        ? new Date(fullTimestamp).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
        : label;

    return (
        <div
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs">
            <p className="font-semibold text-slate-700 dark:text-white">{displayLabel}</p>
            <div className="mt-1 space-y-1">
                {payload.map((entry, index) => {
                    if (!entry) {
                        return null;
                    }

                    const dotColor = entry.color ?? '#6366f1';
                    const title = entry.name ?? entry.dataKey ?? `系列 ${index + 1}`;
                    const value =
                        typeof entry.value === 'number'
                            ? Number.isFinite(entry.value)
                                ? entry.value.toFixed(2)
                                : '-'
                            : entry.value;

                    return (
                        <p key={`${entry.dataKey ?? index}`}
                           className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                            <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{backgroundColor: dotColor}}
                            />
                            <span>
                                {title}: {value}{unit}
                            </span>
                        </p>
                    );
                })}
            </div>
        </div>
    );
};

const TimeRangeSelector = ({
                               value,
                               onChange,
                               options,
                           }: {
    value: string;
    onChange: (value: any) => void;
    options: readonly { label: string; value: string }[];
}) => (
    <div className="flex flex-wrap items-center gap-2">
        {options.map((option) => {
            const isActive = option.value === value;
            return (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition",
                        isActive
                            ? 'border-slate-300 dark:border-slate-600 bg-slate-600 dark:bg-slate-700 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-700 dark:hover:text-slate-200'
                    )}
                >
                    {option.label}
                </button>
            );
        })}
    </div>
);

// 预定义的颜色方案
const AGENT_COLORS = [
    '#2563eb', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
    '#14b8a6', // teal
];

const MonitorDetail = () => {
    const navigate = useNavigate();
    const {id} = useParams<{ id: string }>();
    const [selectedAgent, setSelectedAgent] = useState<string>('all');
    const [timeRange, setTimeRange] = useState<string>('15m');

    // 获取监控详情（聚合数据）
    const {data: monitorDetail, isLoading} = useQuery<PublicMonitor>({
        queryKey: ['monitorDetail', id],
        queryFn: async () => {
            if (!id) throw new Error('Monitor ID is required');
            const response = await getMonitorStatsById(id);
            return response.data;
        },
        refetchInterval: 30000,
        enabled: !!id,
    });

    // 获取各探针的统计数据
    const {data: monitorStats = []} = useQuery<AgentMonitorStat[]>({
        queryKey: ['monitorAgentStats', id],
        queryFn: async () => {
            if (!id) return [];
            const response = await getMonitorAgentStats(id);
            return response.data || [];
        },
        refetchInterval: 30000,
        enabled: !!id,
    });

    // 获取历史数据
    const {data: historyData} = useQuery<GetMetricsResponse>({
        queryKey: ['monitorHistory', id, timeRange],
        queryFn: async () => {
            if (!id) throw new Error('Monitor ID is required');
            const response = await getMonitorHistory(id, timeRange);
            return response.data;
        },
        refetchInterval: 30000,
        enabled: !!id,
    });

    // 获取所有可用的探针列表
    const availableAgents = useMemo(() => {
        if (monitorStats.length === 0) return [];
        return monitorStats.map(stat => ({
            id: stat.agentId,
            label: stat.agentId.substring(0, 8),
        }));
    }, [monitorStats]);

    // 当可用探针列表变化时，检查当前选择的探针是否还存在
    useEffect(() => {
        if (selectedAgent === 'all') {
            return;
        }
        if (!availableAgents.find(agent => agent.id === selectedAgent)) {
            setSelectedAgent('all');
        }
    }, [availableAgents, selectedAgent]);

    // 生成图表数据
    const chartData = useMemo(() => {
        if (!historyData?.series) return [];

        // 过滤出响应时间指标的 series
        const responseTimeSeries = historyData.series.filter(s => s.name === 'response_time');

        // 根据选择的探针过滤
        const filteredSeries = selectedAgent === 'all'
            ? responseTimeSeries
            : responseTimeSeries.filter(s => s.labels?.agent_id === selectedAgent);

        if (filteredSeries.length === 0) return [];

        // 按时间戳分组数据
        const grouped: Record<number, any> = {};

        filteredSeries.forEach(series => {
            const agentId = series.labels?.agent_id || 'unknown';
            const agentKey = `agent_${agentId}`;

            series.data.forEach(point => {
                if (!grouped[point.timestamp]) {
                    grouped[point.timestamp] = {
                        time: new Date(point.timestamp).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                        }),
                        timestamp: point.timestamp,
                    };
                }
                grouped[point.timestamp][agentKey] = point.value;
            });
        });

        // 按时间戳排序
        return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
    }, [historyData, selectedAgent]);

    if (isLoading) {
        return <LoadingSpinner/>;
    }

    if (!monitorDetail) {
        return <EmptyState/>;
    }

    const monitorTitle = monitorDetail.name ?? '监控详情';
    const hasCert = monitorDetail.certExpiryTime > 0;
    const certExpired = hasCert && monitorDetail.certDaysLeft < 0;
    const certExpiringSoon = hasCert && monitorDetail.certDaysLeft >= 0 && monitorDetail.certDaysLeft < 30;

    const heroStats = [
        {label: '监控类型', value: monitorDetail.type.toUpperCase()},
        {label: '探针数量', value: `${monitorDetail.agentCount} 个`},
    ];

    return (
        <div className="dark:bg-[#141414]">
            <div className="mx-auto flex max-w-7xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
                {/* Hero Section */}
                <section
                    className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 p-6 text-white">
                    <div
                        className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_top,rgba(255,255,255,0.35),transparent_55%)]"/>
                    <div className="relative flex flex-col gap-6">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                            <div className="space-y-4">
                                <button
                                    type="button"
                                    onClick={() => navigate('/monitors')}
                                    className="group inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 transition hover:text-white"
                                >
                                    <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5"/>
                                    返回监控列表
                                </button>
                                <div className="flex items-start gap-4">
                                    <div
                                        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white">
                                        {monitorDetail.type === 'tcp' ? (
                                            <ServerIcon className="h-7 w-7"/>
                                        ) : (
                                            <Globe className="h-7 w-7"/>
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <h1 className="text-3xl font-semibold">{monitorTitle}</h1>
                                        </div>
                                        <p className="mt-2 text-sm text-white/80">
                                            {monitorDetail.target}
                                        </p>
                                        <p className="text-xs text-white/60">公共视图 · 实时监控概览</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-2 xl:grid-cols-4">
                                {heroStats.map((stat) => (
                                    <div
                                        key={stat.label}
                                        className="rounded-2xl bg-white/10 dark:bg-white/10 p-4 text-left backdrop-blur"
                                    >
                                        <p className="text-[11px] uppercase tracking-[0.3em] text-white/70">{stat.label}</p>
                                        <p className="mt-2 text-base font-semibold text-white">{stat.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
                            <span>监控 ID：{monitorDetail.id || id}</span>
                            <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:inline-block"/>
                            <span>探针数量：{monitorDetail.agentCount} 个</span>
                            <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:inline-block"/>
                            <span>目标：{monitorDetail.target}</span>
                        </div>
                    </div>
                </section>

                <main className="flex-1 py-10 space-y-10">
                    {/* 概览统计 */}
                    <Card title="监控概览" description="当前监控状态和关键指标">
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard
                                icon={<Clock className="h-6 w-6"/>}
                                label="当前响应"
                                value={formatTime(monitorDetail.responseTime)}
                                color="blue"
                            />
                        </div>

                        {/* 证书信息 */}
                        {hasCert && (
                            <div className={cn(
                                "mt-6 rounded-2xl border p-6",
                                certExpired
                                    ? 'border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10'
                                    : certExpiringSoon
                                        ? 'border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10'
                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40'
                            )}>
                                <div className="flex items-center gap-3">
                                    <Shield className={cn(
                                        "h-6 w-6",
                                        certExpired
                                            ? 'text-red-600 dark:text-red-200'
                                            : certExpiringSoon
                                                ? 'text-amber-600 dark:text-amber-200'
                                                : 'text-slate-600 dark:text-slate-400'
                                    )}/>
                                    <div>
                                        <h3 className={cn(
                                            "text-lg font-semibold",
                                            certExpired
                                                ? 'text-red-900 dark:text-red-100'
                                                : certExpiringSoon
                                                    ? 'text-amber-900 dark:text-amber-100'
                                                    : 'text-slate-900 dark:text-white'
                                        )}>
                                            TLS 证书信息
                                        </h3>
                                        <p className={cn(
                                            "mt-1 text-sm",
                                            certExpired
                                                ? 'text-red-700 dark:text-red-200'
                                                : certExpiringSoon
                                                    ? 'text-amber-700 dark:text-amber-200'
                                                    : 'text-slate-600 dark:text-slate-400'
                                        )}>
                                            证书到期时间: {formatDate(monitorDetail.certExpiryTime)}
                                            {certExpired ? (
                                                <span
                                                    className="ml-1">(已过期 {Math.abs(monitorDetail.certDaysLeft)} 天)</span>
                                            ) : (
                                                <span className="ml-1">(剩余 {monitorDetail.certDaysLeft} 天)</span>
                                            )}
                                        </p>
                                        {certExpired && (
                                            <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-200">
                                                🚨 证书已过期，请立即更新
                                            </p>
                                        )}
                                        {certExpiringSoon && (
                                            <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-200">
                                                ⚠️ 证书即将过期，请及时更新
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* 响应时间趋势图表 */}
                    <Card
                        title="历史趋势"
                        description="监控各探针的响应时间变化"
                        action={
                            <div className="flex flex-wrap items-center gap-2">
                                <TimeRangeSelector value={timeRange} onChange={setTimeRange}
                                                   options={timeRangeOptions}/>
                                {availableAgents.length > 0 && (
                                    <select
                                        value={selectedAgent}
                                        onChange={(e) => setSelectedAgent(e.target.value)}
                                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 focus:border-slate-500 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-600/40"
                                    >
                                        <option value="all">所有探针</option>
                                        {availableAgents.map((agent) => (
                                            <option key={agent.id} value={agent.id}>
                                                {agent.label}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        }
                    >
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={320}>
                                <AreaChart data={chartData}>
                                    <defs>
                                        {monitorStats.map((stat, index) => {
                                            const agentKey = `agent_${stat.agentId}`;
                                            const color = AGENT_COLORS[index % AGENT_COLORS.length];
                                            return (
                                                <linearGradient key={agentKey} id={`gradient_${agentKey}`} x1="0" y1="0"
                                                                x2="0" y2="1">
                                                    <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor={color} stopOpacity={0}/>
                                                </linearGradient>
                                            );
                                        })}
                                    </defs>
                                    <CartesianGrid stroke="currentColor" strokeDasharray="4 4"
                                                   className="stroke-slate-200 dark:stroke-slate-700"/>
                                    <XAxis
                                        dataKey="time"
                                        stroke="currentColor"
                                        className="stroke-slate-400 dark:stroke-slate-500"
                                        style={{fontSize: '12px'}}
                                    />
                                    <YAxis
                                        stroke="currentColor"
                                        className="stroke-slate-400 dark:stroke-slate-500"
                                        style={{fontSize: '12px'}}
                                        tickFormatter={(value) => `${value} ms`}
                                    />
                                    <Tooltip content={<CustomTooltip unit=" ms"/>} wrapperStyle={{
                                        zIndex: 50,
                                    }}/>
                                    <Legend
                                        wrapperStyle={{
                                            display: 'none',
                                        }}
                                        className="hidden sm:block"
                                    />
                                    {monitorStats
                                        .filter(stat => selectedAgent === 'all' || stat.agentId === selectedAgent)
                                        .map((stat) => {
                                            // 使用原始索引保持颜色一致性
                                            const originalIndex = monitorStats.findIndex(s => s.agentId === stat.agentId);
                                            const agentKey = `agent_${stat.agentId}`;
                                            const color = AGENT_COLORS[originalIndex % AGENT_COLORS.length];
                                            const agentLabel = stat.agentId.substring(0, 8);
                                            return (
                                                <Area
                                                    key={agentKey}
                                                    type="monotone"
                                                    dataKey={agentKey}
                                                    name={`探针 ${agentLabel}`}
                                                    stroke={color}
                                                    strokeWidth={2}
                                                    fill={`url(#gradient_${agentKey})`}
                                                    activeDot={{r: 4}}
                                                />
                                            );
                                        })}
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <ChartPlaceholder
                                subtitle="正在收集数据，请稍后查看历史趋势"
                                heightClass="h-80"
                            />
                        )}
                    </Card>

                    {/* 各探针详细数据 */}
                    <Card title="探针监控详情" description="各探针的当前状态和统计数据">
                        <div className="overflow-x-auto -mx-6 sm:mx-0">
                            <div className="inline-block min-w-full align-middle">
                                <div className="overflow-hidden">
                                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                                        <thead className="dark:bg-slate-800">
                                        <tr>
                                            <th className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-slate-700 dark:text-white">
                                                探针 ID
                                            </th>
                                            <th className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                状态
                                            </th>
                                            <th className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                当前响应
                                            </th>
                                            <th className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hidden xl:table-cell">
                                                最后检测
                                            </th>
                                            <th className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hidden 2xl:table-cell">
                                                证书信息
                                            </th>
                                            <th className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hidden 2xl:table-cell">
                                                错误信息
                                            </th>
                                        </tr>
                                        </thead>
                                        <tbody
                                            className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {monitorStats.map((stats, index) => {
                                            const color = AGENT_COLORS[index % AGENT_COLORS.length];
                                            return (
                                                <tr key={stats.agentId}
                                                    className="transition-colors">
                                                    <td className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4">
                                                        <div className="flex items-center gap-2">
                                                        <span
                                                            className="inline-block h-2 w-2 sm:h-3 sm:w-3 rounded-full flex-shrink-0"
                                                            style={{backgroundColor: color}}
                                                        />
                                                            <div className="flex flex-col min-w-0">
                                                                <span
                                                                    className="font-mono text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                                                                    {stats.agentId.substring(0, 8)}...
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4">
                                                        <StatusBadge status={stats.status}/>
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 sm:px-6 py-3 sm:py-4">
                                                        <div className="flex items-center gap-1 sm:gap-2">
                                                            <Clock
                                                                className="h-3 w-3 sm:h-4 sm:w-4 text-slate-400 dark:text-slate-500 flex-shrink-0"/>
                                                            <span
                                                                className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                                                            {formatTime(stats.responseTime)}
                                                        </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 sm:px-6 py-3 sm:py-4 hidden 2xl:table-cell">
                                                        {formatDateTime(stats.checkedAt)}
                                                    </td>
                                                    <td className="px-4 sm:px-6 py-3 sm:py-4 hidden 2xl:table-cell">
                                                        {renderCert(stats)}
                                                    </td>
                                                    <td className="px-4 sm:px-6 py-3 sm:py-4 hidden 2xl:table-cell">
                                                        {stats.status === 'down' ? (
                                                            <div className="max-w-xs">
                                                                <div className="flex items-start gap-2">
                                                                    <AlertCircle
                                                                        className="h-4 w-4 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"/>
                                                                    <span
                                                                        className="text-xs sm:text-sm text-red-700 dark:text-red-300 break-words">
                                                                        {stats.message}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span
                                                                className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </Card>
                </main>
            </div>
        </div>
    );
};

export default MonitorDetail;
