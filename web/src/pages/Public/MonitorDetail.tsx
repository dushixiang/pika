import type {ReactNode} from 'react';
import {useEffect, useMemo, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {AlertCircle, ArrowLeft, Clock, Loader2, MapPin, TrendingUp} from 'lucide-react';
import type {TooltipProps} from 'recharts';
import {Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {
    type AgentMonitorStat,
    type GetMetricsResponse,
    getMonitorAgentStats,
    getMonitorHistory,
    getMonitorStatsById
} from '@/api/monitor.ts';
import type {PublicMonitor} from '@/types';
import {cn} from '@/lib/utils';
import {formatDateTime, formatTime} from "@/utils/util.ts";
import {StatusBadge} from '@/components/monitor/StatusBadge';
import {TypeIcon} from '@/components/monitor/TypeIcon';
import {CertBadge} from '@/components/monitor/CertBadge';

const LoadingSpinner = () => (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500"/>
            <p className="text-sm text-slate-600 dark:text-slate-400">数据加载中，请稍候...</p>
        </div>
    </div>
);

const EmptyState = ({message = '监控数据不存在'}: { message?: string }) => (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                <AlertCircle className="h-8 w-8"/>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
            <button
                onClick={() => window.history.back()}
                className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
                返回监控列表
            </button>
        </div>
    </div>
);

const timeRangeOptions = [
    {label: '1小时', value: '1h'},
    {label: '6小时', value: '6h'},
    {label: '1天', value: '1d'},
    {label: '3天', value: '3d'},
    {label: '7天', value: '7d'},
];

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
            <p className="font-medium">{title}</p>
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
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
        {(title || description || action) && (
            <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    {title && <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>}
                    {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
        )}
        <div className="pt-4">{children}</div>
    </section>
);

const StatCard = ({
                      label,
                      value,
                      sublabel
                  }: {
    label: string;
    value: string | number;
    sublabel?: string;
}) => (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-700/50 p-4 border border-slate-200 dark:border-slate-600">
        <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-medium">{label}</p>
        <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{value}</p>
        {sublabel && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sublabel}</p>}
    </div>
);

const CustomTooltip = ({active, payload, label}: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const fullTimestamp = payload[0]?.payload?.timestamp;
    const displayLabel = fullTimestamp
        ? new Date(fullTimestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
        : label;

    return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 shadow-lg">
            <p className="text-xs font-semibold text-slate-700 dark:text-white mb-2">{displayLabel}</p>
            <div className="space-y-1">
                {payload.map((entry, index) => {
                    if (!entry) return null;

                    const dotColor = entry.color ?? '#3b82f6';
                    const title = entry.name ?? `系列 ${index + 1}`;
                    const value = typeof entry.value === 'number' && Number.isFinite(entry.value)
                        ? entry.value.toFixed(2)
                        : '-';

                    return (
                        <div key={`${entry.dataKey ?? index}`} className="flex items-center gap-2 text-xs">
                            <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{backgroundColor: dotColor}}
                            />
                            <span className="text-slate-600 dark:text-slate-400">
                                {title}: <span className="font-semibold text-slate-900 dark:text-white">{value} ms</span>
                            </span>
                        </div>
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
    onChange: (value: string) => void;
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
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                        isActive
                            ? 'border-blue-500 dark:border-blue-500 bg-blue-500 text-white shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400'
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
    '#3b82f6', // blue
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
    const [timeRange, setTimeRange] = useState<string>('1d');

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
        if (selectedAgent === 'all') return;
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

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                {/* Hero Section */}
                <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                    <div className="space-y-6">
                        {/* 返回按钮 */}
                        <button
                            type="button"
                            onClick={() => navigate('/monitors')}
                            className="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400 transition hover:text-slate-900 dark:hover:text-white"
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1"/>
                            返回监控列表
                        </button>

                        {/* 监控信息 */}
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex items-start gap-4">
                                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
                                    <TypeIcon type={monitorDetail.type}/>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h1 className="text-2xl sm:text-3xl font-bold truncate text-slate-900 dark:text-white">{monitorDetail.name}</h1>
                                        <StatusBadge status={monitorDetail.status}/>
                                    </div>
                                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 font-mono truncate">
                                        {monitorDetail.showTargetPublic ? monitorDetail.target : '******'}
                                    </p>
                                </div>
                            </div>

                            {/* 统计卡片 */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full lg:w-auto lg:min-w-[480px]">
                                <StatCard
                                    label="监控类型"
                                    value={monitorDetail.type.toUpperCase()}
                                />
                                <StatCard
                                    label="探针数量"
                                    value={monitorDetail.agentCount}
                                    sublabel="个节点"
                                />
                                <StatCard
                                    label="平均响应"
                                    value={`${monitorDetail.responseTime}ms`}
                                />
                                <StatCard
                                    label="最慢响应"
                                    value={`${monitorDetail.responseTimeMax}ms`}
                                />
                            </div>
                        </div>

                        {/* 证书信息（如果是 HTTPS）*/}
                        {monitorDetail.type === 'https' && monitorDetail.certExpiryTime && (
                            <div className="flex items-center gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                                <span className="text-xs text-slate-600 dark:text-slate-400">SSL 证书:</span>
                                <div className="scale-90 origin-left">
                                    <CertBadge
                                        expiryTime={monitorDetail.certExpiryTime}
                                        daysLeft={monitorDetail.certDaysLeft}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* 响应时间趋势图表 */}
                <Card
                    title="响应时间趋势"
                    description="监控各探针的响应时间变化"
                    action={
                        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3">
                            <TimeRangeSelector
                                value={timeRange}
                                onChange={setTimeRange}
                                options={timeRangeOptions}
                            />
                            {availableAgents.length > 0 && (
                                <select
                                    value={selectedAgent}
                                    onChange={(e) => setSelectedAgent(e.target.value)}
                                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-300 dark:hover:border-blue-600 focus:border-blue-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-600/40 transition-colors"
                                >
                                    <option value="all">所有探针</option>
                                    {availableAgents.map((agent) => (
                                        <option key={agent.id} value={agent.id}>
                                            探针 {agent.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    }
                >
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={360}>
                            <AreaChart data={chartData}>
                                <defs>
                                    {monitorStats
                                        .filter(stat => selectedAgent === 'all' || stat.agentId === selectedAgent)
                                        .map((stat, index) => {
                                            const originalIndex = monitorStats.findIndex(s => s.agentId === stat.agentId);
                                            const agentKey = `agent_${stat.agentId}`;
                                            const color = AGENT_COLORS[originalIndex % AGENT_COLORS.length];
                                            return (
                                                <linearGradient key={agentKey} id={`gradient_${agentKey}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor={color} stopOpacity={0}/>
                                                </linearGradient>
                                            );
                                        })}
                                </defs>
                                <CartesianGrid
                                    strokeDasharray="3 3"
                                    className="stroke-slate-200 dark:stroke-slate-700"
                                    vertical={false}
                                />
                                <XAxis
                                    dataKey="time"
                                    className="text-xs text-slate-600 dark:text-slate-400"
                                    stroke="currentColor"
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    className="text-xs text-slate-600 dark:text-slate-400"
                                    stroke="currentColor"
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}ms`}
                                />
                                <Tooltip content={<CustomTooltip/>}/>
                                <Legend
                                    wrapperStyle={{paddingTop: '20px'}}
                                    iconType="circle"
                                />
                                {monitorStats
                                    .filter(stat => selectedAgent === 'all' || stat.agentId === selectedAgent)
                                    .map((stat) => {
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
                                                activeDot={{r: 5, strokeWidth: 0}}
                                                dot={false}
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
                    <div className="overflow-x-auto -mx-6 px-6">
                        <table className="min-w-full">
                            <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                    探针 ID
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                    状态
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                    响应时间
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 hidden lg:table-cell">
                                    最后检测
                                </th>
                                {monitorDetail.type === 'https' && (
                                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 hidden xl:table-cell">
                                        证书信息
                                    </th>
                                )}
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 hidden xl:table-cell">
                                    错误信息
                                </th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {monitorStats.map((stat, index) => {
                                const color = AGENT_COLORS[index % AGENT_COLORS.length];
                                return (
                                    <tr key={stat.agentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <span
                                                    className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                                                    style={{backgroundColor: color}}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="h-3.5 w-3.5 text-slate-400"/>
                                                    <span className="font-mono text-sm text-slate-700 dark:text-slate-300">
                                                        {stat.agentId.substring(0, 8)}...
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <StatusBadge status={stat.status}/>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-4 w-4 text-slate-400"/>
                                                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                                    {formatTime(stat.responseTime)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 hidden lg:table-cell">
                                            {formatDateTime(stat.checkedAt)}
                                        </td>
                                        {monitorDetail.type === 'https' && (
                                            <td className="px-4 py-4 hidden xl:table-cell">
                                                {stat.certExpiryTime ? (
                                                    <CertBadge
                                                        expiryTime={stat.certExpiryTime}
                                                        daysLeft={stat.certDaysLeft}
                                                    />
                                                ) : (
                                                    <span className="text-xs text-slate-500 dark:text-slate-400">-</span>
                                                )}
                                            </td>
                                        )}
                                        <td className="px-4 py-4 hidden xl:table-cell">
                                            {stat.status === 'down' && stat.message ? (
                                                <div className="flex items-start gap-2 max-w-xs">
                                                    <AlertCircle className="h-4 w-4 text-rose-500 dark:text-rose-400 flex-shrink-0 mt-0.5"/>
                                                    <span className="text-xs text-rose-700 dark:text-rose-300 break-words line-clamp-2">
                                                        {stat.message}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-500 dark:text-slate-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default MonitorDetail;
