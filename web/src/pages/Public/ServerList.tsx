import {type ReactNode, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {
    Activity,
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Clock,
    Cpu,
    Filter, Globe,
    HardDrive,
    LinkIcon,
    Loader2,
    MemoryStick,
    Network,
    Thermometer,
    UnlinkIcon
} from 'lucide-react';
import {getPublicTags, listAgents} from '@/api/agent.ts';
import type {Agent, LatestMetrics} from '@/types';
import {cn} from '@/lib/utils';
import CompactResourceBar from "@/components/CompactResourceBar.tsx";
import StatBlock from "@/components/StatBlock.tsx";
import ServerCard from "@/components/ServerCard.tsx";
import NetworkStatCard from "@/components/NetworkStatCard.tsx";
import {formatBytes, formatSpeed, formatUptime} from "@/utils/util.ts";

interface AgentWithMetrics extends Agent {
    metrics?: LatestMetrics;
}

const LoadingSpinner = () => (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f2f5] dark:bg-[#05050a]">
        <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500"/>
            <p className="text-sm text-cyan-500 font-mono">数据加载中...</p>
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
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-cyan-500/30 bg-white/90 dark:bg-[#0a0b10]/90 p-12 text-center backdrop-blur">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
            <HardDrive className="h-7 w-7"/>
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-800 dark:text-cyan-100 font-mono">{title}</h3>
        <p className="mt-2 max-w-sm text-sm text-slate-600 dark:text-cyan-500">{description}</p>
        {extra ? <div className="mt-4">{extra}</div> : null}
    </div>
);

const calculateNetworkSpeed = (metrics?: LatestMetrics) => {
    if (!metrics?.network) {
        return {upload: 0, download: 0};
    }
    return {
        upload: metrics.network.totalBytesSentRate,
        download: metrics.network.totalBytesRecvRate
    };
};

const calculateDiskUsage = (metrics?: LatestMetrics) => {
    if (!metrics?.disk) {
        return 0;
    }
    return metrics.disk.usagePercent;
};

const getTemperatures = (metrics?: LatestMetrics) => {
    if (!metrics?.temperature || metrics.temperature.length === 0) {
        return [];
    }
    // 返回所有温度数据
    return metrics.temperature.sort((a, b) => a.type.localeCompare(b.type));
};

const ServerList = () => {
    const navigate = useNavigate();
    const [selectedTag, setSelectedTag] = useState<string>('');

    const {data: agents = [], isLoading} = useQuery<AgentWithMetrics[]>({
        queryKey: ['agents', 'online'],
        queryFn: async () => {
            const response = await listAgents();
            return (response.data.items || []) as AgentWithMetrics[];
        },
        refetchInterval: 5000,
    });

    // 获取标签列表
    const {data: tagsData} = useQuery({
        queryKey: ['tags', 'public'],
        queryFn: async () => {
            const response = await getPublicTags();
            return response.data.tags || [];
        },
        refetchInterval: 30000,
    });

    // 计算统计数据
    const stats = useMemo(() => {
        const total = agents.length;
        const online = agents.filter(a => a.status === 1).length;
        const offline = total - online;

        // 计算网络统计
        let totalUploadRate = 0;
        let totalDownloadRate = 0;
        let totalUploadTotal = 0;
        let totalDownloadTotal = 0;

        agents.forEach(agent => {
            if (agent.status === 1 && agent.metrics?.network) {
                totalUploadRate += agent.metrics.network.totalBytesSentRate || 0;
                totalDownloadRate += agent.metrics.network.totalBytesRecvRate || 0;
                totalUploadTotal += agent.metrics.network.totalBytesSentTotal || 0;
                totalDownloadTotal += agent.metrics.network.totalBytesRecvTotal || 0;
            }
        });

        return {
            total,
            online,
            offline,
            uploadRate: totalUploadRate,
            downloadRate: totalDownloadRate,
            uploadTotal: totalUploadTotal,
            downloadTotal: totalDownloadTotal
        };
    }, [agents]);

    const handleNavigate = (agentId: string) => {
        navigate(`/servers/${agentId}`);
    };

    if (isLoading) {
        return <LoadingSpinner/>;
    }

    // 计算所有标签（包括ALL和ONLINE/OFFLINE）
    const allTags = ['ALL', 'ONLINE', 'OFFLINE'];
    if (tagsData && tagsData.length > 0) {
        tagsData.forEach((tag: string) => {
            if (!allTags.includes(tag.toUpperCase())) {
                allTags.push(tag.toUpperCase());
            }
        });
    }

    // 过滤逻辑
    let displayAgents = agents;
    if (selectedTag === 'ONLINE') {
        displayAgents = agents.filter(a => a.status === 1);
    } else if (selectedTag === 'OFFLINE') {
        displayAgents = agents.filter(a => a.status !== 1);
    } else if (selectedTag && selectedTag !== 'ALL') {
        displayAgents = agents.filter(a => a.tags?.map(t => t.toUpperCase()).includes(selectedTag));
    }

    // debug
    // displayAgents = Array.from({length:10}, ()=>displayAgents).flat();

    return (
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                <StatBlock
                    title="设备总数"
                    value={stats?.total}
                    icon={Globe}
                    color="cyan"
                />
                <StatBlock
                    title="在线设备"
                    value={stats?.online}
                    icon={LinkIcon}
                    color="emerald"
                    glow
                />
                <StatBlock
                    title="离线设备"
                    value={stats.offline}
                    icon={UnlinkIcon}
                    color="rose"
                    alert={stats?.offline > 0}
                />
                <NetworkStatCard
                    uploadRate={stats?.uploadRate}
                    downloadRate={stats?.downloadRate}
                    uploadTotal={stats?.uploadTotal}
                    downloadTotal={stats?.downloadTotal}
                />
            </div>

            {/* 标签过滤器 */}
            {allTags.length > 1 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
                    <div
                        className="text-sm sm:text-xs font-mono text-gray-700 dark:text-cyan-500 flex items-center gap-1.5 sm:gap-2 mr-1 sm:mr-2 font-bold">
                        <Filter className="w-4 h-4"/>
                        <span className="hidden sm:inline">FILTERS:</span>
                    </div>
                    {allTags.map(tag => {
                        const tagKey = tag === 'ALL' ? '' : tag;
                        let count = 0;
                        if (tag === 'ALL') count = agents.length;
                        else if (tag === 'ONLINE') count = agents.filter(a => a.status === 1).length;
                        else if (tag === 'OFFLINE') count = agents.filter(a => a.status !== 1).length;
                        else count = agents.filter(a => a.tags?.map(t => t.toUpperCase()).includes(tag)).length;

                        if (count === 0 && tag !== 'ALL') return null;

                        return (
                            <button
                                key={tag}
                                onClick={() => setSelectedTag(tagKey)}
                                className={cn(
                                    "px-4 py-1.5 rounded-full text-xs font-bold font-mono tracking-wider transition-all border cursor-pointer uppercase",
                                    selectedTag === tagKey
                                        ? 'bg-gray-100 dark:bg-cyan-500 dark:text-white border-gray-600 dark:border-cyan-600 shadow-md'
                                        : 'bg-transparent text-slate-600 dark:text-cyan-500 border-slate-200 dark:border-cyan-900/30 hover:bg-gray-100 hover:border-cyan-900/30 dark:hover:text-cyan-500 dark:hover:border-cyan-500'
                                )}
                            >
                                {tag} ({count})
                            </button>
                        );
                    })}
                </div>
            )}

            {/* 服务器列表 */}
            {displayAgents.length === 0 ? (
                <EmptyState
                    title={selectedTag ? '没有匹配的服务器' : '暂无在线服务器'}
                    description={selectedTag ? `标签 "${selectedTag}" 下暂无服务器` : '当前没有任何探针在线，请稍后再试。'}
                />
            ) : (
                <>
                    {/* 桌面端表格布局 */}
                    <div
                        className="hidden md:block bg-white/80 dark:bg-[#0a0b10]/90 border border-slate-200 dark:border-cyan-900/50 rounded-xl overflow-hidden shadow-sm dark:shadow-2xl backdrop-blur-md">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="bg-slate-50 dark:bg-black/40 text-xs font-mono uppercase tracking-widest text-slate-400 dark:text-cyan-500 border-b border-slate-200 dark:border-cyan-900/50 font-bold">
                                <th className="p-5 font-bold w-[250px]">Identity</th>
                                <th className="p-5 font-bold">Telemetry</th>
                                <th className="p-5 font-bold w-[220px]">I/O Rate</th>
                                <th className="p-5 font-bold w-[150px]">Network</th>
                                <th className="p-5 font-bold w-[200px]">Meta / Tags</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-cyan-900/50">
                            {displayAgents.map(server => {
                                const isOnline = server.status === 1;
                                const cpuUsage = server.metrics?.cpu?.usagePercent ?? 0;
                                const memoryUsage = server.metrics?.memory?.usagePercent ?? 0;
                                const memoryTotal = server.metrics?.memory?.total ?? 0;
                                const memoryUsed = server.metrics?.memory?.used ?? 0;
                                const diskUsage = calculateDiskUsage(server.metrics);
                                const diskTotal = server.metrics?.disk?.total ?? 0;
                                const diskUsed = server.metrics?.disk?.used ?? 0;
                                const {upload, download} = calculateNetworkSpeed(server.metrics);
                                const temperatures = getTemperatures(server.metrics);
                                const netConn = server.metrics?.networkConnection;

                                return (
                                    <tr
                                        key={server.id}
                                        tabIndex={0}
                                        onClick={() => handleNavigate(server.id)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                handleNavigate(server.id);
                                            }
                                        }}
                                        className="group hover:bg-gray-500/5 dark:hover:bg-cyan-500/5 transition-colors cursor-pointer"
                                    >
                                        {/* Identity */}
                                        <td className="p-4 align-top">
                                            <div className="flex items-center gap-4">
                                                <div className="space-y-1">
                                                    <div
                                                        className="font-bold text-slate-800 dark:text-cyan-100 font-mono text-sm transition-colors">
                                                        {server.name}
                                                    </div>
                                                    <div
                                                        className="flex items-center gap-2 text-xs text-gray-600 dark:text-cyan-400 mt-1 font-mono uppercase">
                                                        <span>{server.os}</span>
                                                        <span className="w-px h-2 bg-gray-400 dark:bg-cyan-800"></span>
                                                        <span>{server.arch}</span>
                                                    </div>
                                                    {isOnline && server.metrics?.host && (
                                                        <div className="flex items-center gap-3 text-xs font-mono mt-1">
                                                            <div className="flex items-center gap-1 text-gray-500 dark:text-cyan-600">
                                                                <Clock className="w-3 h-3"/>
                                                                <span>{formatUptime(server.metrics.host.uptime)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1 text-gray-500 dark:text-cyan-600">
                                                                <Activity className="w-3 h-3"/>
                                                                <span>{server.metrics.host.procs} 进程</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Resources */}
                                        <td className="p-4 align-top">
                                            {isOnline ? (
                                                <div className="flex flex-col justify-center h-full gap-0.5">
                                                    <CompactResourceBar
                                                        value={cpuUsage}
                                                        label="CPU"
                                                        icon={Cpu}
                                                        subtext={server.metrics?.cpu ? `${server.metrics.cpu.modelName} (${server.metrics.cpu.physicalCores}核)` : undefined}
                                                        color="bg-blue-500"
                                                    />
                                                    <CompactResourceBar
                                                        value={memoryUsage}
                                                        label="RAM"
                                                        icon={MemoryStick}
                                                        subtext={`${formatBytes(memoryUsed, 1)}/${formatBytes(memoryTotal, 1)}`}
                                                        color="bg-purple-500"
                                                    />
                                                    <CompactResourceBar
                                                        value={diskUsage}
                                                        label="DSK"
                                                        icon={HardDrive}
                                                        subtext={`${formatBytes(diskUsed, 1)}/${formatBytes(diskTotal, 1)}`}
                                                        color="bg-emerald-500"
                                                    />
                                                    {temperatures.length > 0 && (
                                                        <div
                                                            className="flex items-center gap-2 mt-1 text-xs font-mono flex-wrap">
                                                            <Thermometer className="w-3 h-3 text-orange-400"/>
                                                            {temperatures.map((temp, index) => (
                                                                <span key={index} className="flex items-center gap-1">
                                                                    <span
                                                                        className="text-orange-400">{temp.temperature?.toFixed(1)}°C</span>
                                                                    <span className="text-gray-500 dark:text-cyan-500">{temp.type}</span>
                                                                    {index < temperatures.length - 1 &&
                                                                        <span className="text-cyan-900">|</span>}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div
                                                    className="text-xs text-rose-500 font-mono flex items-center gap-2 py-4">
                                                    <AlertTriangle className="w-4 h-4"/>
                                                    <span>CONNECTION_LOST // RECONNECTING...</span>
                                                </div>
                                            )}
                                        </td>

                                        {/* Network */}
                                        <td className="p-4 font-mono text-xs align-top">
                                            <div className="flex flex-col gap-1.5 mb-1.5">
                                                <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400/80">
                                                    <ArrowDown className="w-3 h-3"/>
                                                    <span>{formatSpeed(download)}</span>
                                                </span>
                                                <span className="flex items-center gap-2 text-blue-600 dark:text-blue-400/80">
                                                    <ArrowUp className="w-3 h-3"/>
                                                    <span>{formatSpeed(upload)}</span>
                                                </span>
                                            </div>
                                            {server.trafficLimit > 0 && (
                                                <div className="w-32 text-xs">
                                                    <div
                                                        className="flex justify-between text-gray-600 dark:text-cyan-500 mb-0.5">
                                                        <span className={''}>流量使用</span>
                                                        <span>{Math.round((server.trafficUsed || 0) / server.trafficLimit * 100)}%</span>
                                                    </div>
                                                    <div className="h-1 bg-slate-200 dark:bg-cyan-900/50 rounded-full overflow-hidden">
                                                        <div className="h-full bg-gray-500 dark:bg-cyan-400"
                                                             style={{width: `${((server.trafficUsed || 0) / server.trafficLimit) * 100}%`}}></div>
                                                    </div>
                                                </div>
                                            )}
                                        </td>

                                        {/* Connections */}
                                        <td className="p-4 font-mono text-xs align-top">
                                            {isOnline && netConn ? (
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <Network className="w-3 h-3 text-emerald-600 dark:text-emerald-400"/>
                                                        <span
                                                            className="text-emerald-600 dark:text-emerald-400">{netConn.established || 0}</span>
                                                        <span className="text-gray-600 dark:text-cyan-500">ESTABLISHED</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Network className="w-3 h-3 text-blue-600 dark:text-blue-400"/>
                                                        <span className="text-blue-600 dark:text-blue-400">{netConn.listen || 0}</span>
                                                        <span className="text-gray-600 dark:text-cyan-500">LISTEN</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Network className="w-3 h-3 text-rose-600 dark:text-rose-400"/>
                                                        <span className="text-rose-600 dark:text-rose-400">{netConn.closeWait || 0}</span>
                                                        <span className="text-gray-600 dark:text-cyan-500">CLOSE_WAIT</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-gray-600 dark:text-cyan-500">-</div>
                                            )}
                                        </td>

                                        {/* Meta */}
                                        <td className="p-4 align-top">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex gap-1 flex-wrap">
                                                    {server.tags && server.tags.length > 0 && server.tags.map(tag => (
                                                        <span key={tag}
                                                              className="px-1.5 py-0.5 bg-gray-100 dark:bg-cyan-900/40 text-gray-700 dark:text-cyan-500 border border-gray-300 dark:border-cyan-700/50 text-xs font-mono rounded-sm">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div
                                                    className={`text-xs font-mono flex items-center gap-1 ${server.expireTime && server.expireTime > 0 ? 'text-cyan-600 dark:text-cyan-500' : 'text-emerald-600 dark:text-emerald-400/80'}`}>

                                                    {server.expireTime > 0 &&
                                                        <div className={'flex items-center gap-1'}>
                                                            <div>Expired: {new Date(server.expireTime).toLocaleDateString('zh-CN')}</div>
                                                        </div>
                                                    }
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>

                    {/* 移动端卡片布局 */}
                    <div className="md:hidden flex flex-col gap-2">
                        {displayAgents.map(server => (
                            <ServerCard
                                key={server.id}
                                server={server}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default ServerList;
