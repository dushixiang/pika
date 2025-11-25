import {type ReactNode, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {Cpu, EthernetPortIcon, HardDrive, Loader2, MemoryStick, Network} from 'lucide-react';
import {listAgents} from '../../api/agent';
import type {Agent, LatestMetrics} from '../../types';
import PublicHeader from '../../components/PublicHeader';
import PublicFooter from '../../components/PublicFooter';

interface AgentWithMetrics extends Agent {
    metrics?: LatestMetrics;
}

type ViewMode = 'grid' | 'list';

const formatSpeed = (bytesPerSecond: number): string => {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
    const i = Math.min(Math.floor(Math.log(bytesPerSecond) / Math.log(k)), sizes.length - 1);
    return `${(bytesPerSecond / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const formatTraffic = (bytesPerSecond: number): string => {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytesPerSecond) / Math.log(k)), sizes.length - 1);
    return `${(bytesPerSecond / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const formatPercentValue = (value: number): string => (Number.isFinite(value) ? value.toFixed(1) : '0.0');

const ProgressBar = ({percent, colorClass}: { percent: number; colorClass: string }) => (
    <div className="relative h-2 w-full overflow-hidden rounded-lg bg-slate-100">
        <div
            className={`absolute inset-y-0 left-0 ${colorClass} transition-all duration-500`}
            style={{width: `${Math.min(Math.max(percent, 0), 100)}%`}}
        />
    </div>
);

const LoadingSpinner = () => (
    <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400"/>
            <p className="text-sm text-slate-500">数据加载中，请稍候...</p>
        </div>
    </div>
);

interface EmptyStateProps {
    title: string;
    description: string;
    extra?: ReactNode;
}

const EmptyState = ({title, description, extra}: EmptyStateProps) => (
    <div
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <HardDrive className="h-7 w-7"/>
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
        {extra ? <div className="mt-4">{extra}</div> : null}
    </div>
);

const calculateNetworkSpeed = (metrics?: LatestMetrics) => {
    if (!metrics?.network) {
        return {upload: 0, download: 0};
    }

    // 后端返回的已经是每秒速率(字节/秒),直接使用
    return {
        upload: metrics.network.totalBytesSentRate,
        download: metrics.network.totalBytesRecvRate
    };
};

const calculateNetworkTraffic = (metrics?: LatestMetrics) => {
    if (!metrics?.network) {
        return {totalUpload: 0, totalDownload: 0};
    }

    // 后端返回的累计流量,直接使用
    return {
        totalUpload: metrics.network.totalBytesSentTotal,
        totalDownload: metrics.network.totalBytesRecvTotal
    };
};

const calculateDiskUsage = (metrics?: LatestMetrics) => {
    if (!metrics?.disk) {
        return 0;
    }

    // 后端已经计算好平均使用率,直接返回
    return metrics.disk.avgUsagePercent;
};

const getProgressColor = (percent: number) => {
    if (percent >= 85) return 'bg-rose-500';
    if (percent >= 65) return 'bg-amber-500';
    return 'bg-emerald-500';
};

const ServerList = () => {
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState<ViewMode>('grid');

    const {data: agents = [], isLoading, dataUpdatedAt} = useQuery<AgentWithMetrics[]>({
        queryKey: ['agents', 'online'],
        queryFn: async () => {
            const response = await listAgents();
            // 后端已经在列表中包含了 metrics 数据,直接使用即可
            return (response.data.items || []) as AgentWithMetrics[];
        },
        refetchInterval: 5000,
    });

    const filteredAgents = agents;

    const handleNavigate = (agentId: string) => {
        navigate(`/servers/${agentId}`);
    };

    const renderGridView = () => (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.map((agent) => {
                const cpuUsage = agent.metrics?.cpu?.usagePercent ?? 0;
                const memoryUsage = agent.metrics?.memory?.usagePercent ?? 0;
                const diskUsage = calculateDiskUsage(agent.metrics);
                const {upload, download} = calculateNetworkSpeed(agent.metrics);
                const {totalUpload, totalDownload} = calculateNetworkTraffic(agent.metrics);

                return (
                    <Link
                        key={agent.id}
                        tabIndex={0}
                        to={`/servers/${agent.id}`}
                        className="group relative flex h-full cursor-pointer flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 transition duration-200 hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                    >
                        <div className="flex flex-1 flex-col gap-4">
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-semibold text-slate-900">
                                            {agent.name || agent.hostname}
                                        </h3>
                                        <span
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                            <span className="flex h-1.5 w-1.5 rounded-lg bg-emerald-500"/>
                                            在线
                                        </span>
                                    </div>
                                    <span
                                        className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                                        {agent.os} · {agent.arch}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    {agent.tags && agent.tags.length > 0 && (
                                        agent.tags?.map((tag, index) => (
                                            <span
                                                key={index}
                                                className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                                                {tag}
                                            </span>
                                        ))
                                    )}
                                    {agent.expireTime > 0 && (
                                        <span
                                            className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                                            <span
                                                className="font-medium">到期:</span> {new Date(agent.expireTime).toLocaleDateString('zh-CN')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-3 gap-3">
                                <div
                                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                            <Cpu className="h-3.5 w-3.5"/>
                                        </div>
                                        <span className="text-xs font-medium text-slate-600">CPU</span>
                                    </div>
                                    <div className="text-sm font-bold text-slate-900">
                                        {formatPercentValue(cpuUsage)}%
                                    </div>
                                    <ProgressBar percent={cpuUsage} colorClass={getProgressColor(cpuUsage)}/>
                                </div>

                                <div
                                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                            <MemoryStick className="h-3.5 w-3.5"/>
                                        </div>
                                        <span className="text-xs font-medium text-slate-600">内存</span>
                                    </div>
                                    <div className="text-sm font-bold text-slate-900">
                                        {formatPercentValue(memoryUsage)}%
                                    </div>
                                    <ProgressBar percent={memoryUsage} colorClass={getProgressColor(memoryUsage)}/>
                                </div>

                                <div
                                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                            <HardDrive className="h-3.5 w-3.5"/>
                                        </div>
                                        <span className="text-xs font-medium text-slate-600">磁盘</span>
                                    </div>
                                    <div className="text-sm font-bold text-slate-900">
                                        {formatPercentValue(diskUsage)}%
                                    </div>
                                    <ProgressBar percent={diskUsage} colorClass={getProgressColor(diskUsage)}/>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div
                                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                            <Network className="h-3.5 w-3.5"/>
                                        </div>
                                        <span className="text-xs font-medium text-slate-600">实时速率</span>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 text-xs font-medium text-slate-700">
                                        <span className="flex items-center gap-1">
                                            <span className="text-slate-500">↑</span>
                                            {formatSpeed(upload)}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="text-slate-500">↓</span>
                                            {formatSpeed(download)}
                                        </span>
                                    </div>
                                </div>
                                <div
                                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                            <EthernetPortIcon className="h-3.5 w-3.5"/>
                                        </div>
                                        <span className="text-xs font-medium text-slate-600">累计流量</span>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 text-xs font-medium text-slate-700">
                                        <span className="flex items-center gap-1">
                                            <span className="text-slate-500">↑</span>
                                            {formatTraffic(totalUpload)}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="text-slate-500">↓</span>
                                            {formatTraffic(totalDownload)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );

    const renderListView = () => (
        <>
            {/* 桌面端：使用表格布局 */}
            <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white lg:block">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-blue-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-blue-600">
                        <th className="px-5 py-3">服务器</th>
                        <th className="px-5 py-3">系统</th>
                        <th className="px-5 py-3">CPU</th>
                        <th className="px-5 py-3">内存</th>
                        <th className="px-5 py-3">磁盘</th>
                        <th className="px-5 py-3">网络</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700">
                    {filteredAgents.map((agent) => {
                        const cpuUsage = agent.metrics?.cpu?.usagePercent ?? 0;
                        const cpuModel = agent.metrics?.cpu?.modelName || '未知';
                        const cpuPhysicalCores = agent.metrics?.cpu?.physicalCores ?? 0;
                        const cpuLogicalCores = agent.metrics?.cpu?.logicalCores ?? 0;

                        const memoryUsage = agent.metrics?.memory?.usagePercent ?? 0;
                        const memoryTotal = agent.metrics?.memory?.total ?? 0;
                        const memoryUsed = agent.metrics?.memory?.used ?? 0;
                        const memoryFree = agent.metrics?.memory?.free ?? 0;

                        const diskUsage = calculateDiskUsage(agent.metrics);
                        const diskTotal = agent.metrics?.disk?.total ?? 0;
                        const diskUsed = agent.metrics?.disk?.used ?? 0;
                        const diskFree = agent.metrics?.disk?.free ?? 0;

                        const {upload, download} = calculateNetworkSpeed(agent.metrics);

                        return (
                            <tr
                                key={agent.id}
                                tabIndex={0}
                                onClick={() => handleNavigate(agent.id)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        handleNavigate(agent.id);
                                    }
                                }}
                                className="cursor-pointer transition hover:bg-blue-50 focus-within:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                            >

                                <td className="px-5 py-4 align-center">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-slate-900">
                                                {agent.name || agent.hostname}
                                            </span>
                                            <span
                                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                                                <span className="h-1.5 w-1.5 rounded-lg bg-emerald-500"/>
                                                在线
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                            {agent.tags && agent.tags.length > 0 && (
                                                agent.tags?.map((tag, index) => (
                                                    <span key={index} className="inline-flex items-center gap-1 text-blue-700">
                                                        {tag}
                                                    </span>
                                                ))
                                            )}
                                            {agent.expireTime > 0 && (
                                                <span className="inline-flex items-center gap-1 text-amber-700">
                                                    <span
                                                        className="font-medium">到期:</span> {new Date(agent.expireTime).toLocaleDateString('zh-CN')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-5 py-4 align-center text-xs text-slate-500">
                                    <div>{agent.os}</div>
                                    <div className="text-slate-400">{agent.arch}</div>
                                </td>
                                <td className="px-5 py-4 align-center">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-24">
                                                <ProgressBar percent={cpuUsage}
                                                             colorClass={getProgressColor(cpuUsage)}/>
                                            </div>
                                            <span className="text-xs font-semibold text-slate-900">
                                                {formatPercentValue(cpuUsage)}%
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            <div className="truncate" style={{maxWidth: '200px'}}
                                                 title={cpuModel}>{cpuModel}</div>
                                            <div>{cpuPhysicalCores}核{cpuLogicalCores}线程</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-5 py-4 align-center">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-24">
                                                <ProgressBar percent={memoryUsage}
                                                             colorClass={getProgressColor(memoryUsage)}/>
                                            </div>
                                            <span className="text-xs font-semibold text-slate-900">
                                                {formatPercentValue(memoryUsage)}%
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            <div>总计:{formatBytes(memoryTotal)}</div>
                                            <div>已用:{formatBytes(memoryUsed)} / 剩余:{formatBytes(memoryFree)}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-5 py-4 align-center">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-24">
                                                <ProgressBar percent={diskUsage}
                                                             colorClass={getProgressColor(diskUsage)}/>
                                            </div>
                                            <span className="text-xs font-semibold text-slate-900">
                                                {formatPercentValue(diskUsage)}%
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            <div>总计:{formatBytes(diskTotal)}</div>
                                            <div>已用:{formatBytes(diskUsed)} / 剩余:{formatBytes(diskFree)}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-5 py-4 align-center text-xs text-slate-600">
                                    <div>↑ {formatSpeed(upload)}</div>
                                    <div>↓ {formatSpeed(download)}</div>
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </>
    );

    if (isLoading) {
        return <LoadingSpinner/>;
    }

    return (
        <div className="min-h-screen bg-white text-slate-900 flex flex-col">
            <PublicHeader
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                showViewToggle={true}
            />

            <main className="flex-1 bg-white">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                    {filteredAgents.length === 0 ? (
                        <EmptyState
                            title='暂无在线服务器'
                            description='当前没有任何探针在线，请稍后再试。'
                        />
                    ) : viewMode === 'grid' ? (
                        renderGridView()
                    ) : (
                        renderListView()
                    )}
                </div>
            </main>

            <PublicFooter/>
        </div>
    );
};

export default ServerList;
