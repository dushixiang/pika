import {type ReactNode, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Calendar,
    CheckCircle2,
    Cpu,
    Filter,
    HardDrive,
    Loader2,
    MemoryStick,
    Server,
    XCircle
} from 'lucide-react';
import {getPublicTags, listAgents} from '@/api/agent.ts';
import type {Agent, LatestMetrics} from '@/types';
import {cn} from '@/lib/utils';
import CompactResourceBar from "@/components/CompactResourceBar.tsx";
import StatCard from "@/components/StatCard.tsx";
import ServerCard from "@/components/ServerCard.tsx";
import NetworkStatCard from "@/components/NetworkStatCard.tsx";
import {formatBytes, formatSpeed} from "@/utils/util.ts";

interface AgentWithMetrics extends Agent {
    metrics?: LatestMetrics;
}

const LoadingSpinner = () => (
    <div className="flex min-h-screen items-center justify-center bg-[#05050a]">
        <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400"/>
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
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-500/30 bg-[#0a0b10]/90 p-12 text-center backdrop-blur">
        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
            <HardDrive className="h-7 w-7"/>
        </div>
        <h3 className="mt-4 text-base font-semibold text-cyan-100 font-mono">{title}</h3>
        <p className="mt-2 max-w-sm text-sm text-cyan-600">{description}</p>
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

    // 根据选中的标签过滤服务器
    const filteredAgents = selectedTag
        ? agents.filter(agent => agent.tags?.includes(selectedTag))
        : agents;

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

    return (
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                <StatCard
                    title="设备总数"
                    value={stats.total}
                    icon={Server}
                    color="gray"
                />
                <StatCard
                    title="在线设备"
                    value={stats.online}
                    icon={CheckCircle2}
                    color="emerald"
                />
                <StatCard
                    title="离线设备"
                    value={stats.offline}
                    icon={XCircle}
                    color="rose"
                />
                <NetworkStatCard
                    uploadRate={stats.uploadRate}
                    downloadRate={stats.downloadRate}
                    uploadTotal={stats.uploadTotal}
                    downloadTotal={stats.downloadTotal}
                />
            </div>

            {/* 标签过滤器 */}
            {allTags.length > 1 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
                    <div className="text-[10px] sm:text-xs font-mono text-cyan-600 flex items-center gap-1.5 sm:gap-2 mr-1 sm:mr-2">
                        <Filter className="w-3 h-3"/>
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
                                    "px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider transition-all border cursor-pointer",
                                    selectedTag === tagKey
                                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                                        : 'bg-black/30 text-cyan-700 border-cyan-900/30 hover:text-cyan-400 hover:border-cyan-700'
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
                    <div className="hidden md:block bg-[#0a0b10]/90 border border-cyan-900/50 rounded-md overflow-hidden shadow-2xl backdrop-blur-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="bg-black/40 text-[10px] font-mono uppercase tracking-widest text-cyan-600 border-b border-cyan-900/50">
                                <th className="p-4 font-normal w-[300px]">System Identity</th>
                                <th className="p-4 font-normal">Resource Telemetry</th>
                                <th className="p-4 font-normal w-[200px]">Network I/O</th>
                                <th className="p-4 font-normal w-[180px]">Meta / Status</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-cyan-900/30">
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
                                        className="group hover:bg-cyan-500/5 transition-colors cursor-pointer"
                                    >
                                        {/* Identity */}
                                        <td className="p-4 align-top">
                                            <div className="flex items-center gap-4">
                                                <div>
                                                    <div
                                                        className="font-bold text-cyan-100 font-mono text-sm group-hover:text-cyan-400 transition-colors">
                                                        {server.name || server.hostname}
                                                    </div>
                                                    <div
                                                        className="flex items-center gap-2 text-[10px] text-cyan-600 mt-1 font-mono uppercase">
                                                        <span>{server.os}</span>
                                                        <span className="w-px h-2 bg-cyan-800"></span>
                                                        <span>{server.arch}</span>
                                                    </div>
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
                                                        subtext={null}
                                                        color="bg-blue-500"
                                                    />
                                                    <CompactResourceBar
                                                        value={memoryUsage}
                                                        label="RAM"
                                                        icon={MemoryStick}
                                                        subtext={`${formatBytes(memoryUsed)}/${formatBytes(memoryTotal)}`}
                                                        color="bg-purple-500"
                                                    />
                                                    <CompactResourceBar
                                                        value={diskUsage}
                                                        label="DSK"
                                                        icon={HardDrive}
                                                        subtext={`${formatBytes(diskUsed)}/${formatBytes(diskTotal)}`}
                                                        color="bg-emerald-500"
                                                    />
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
                                        <td className="p-4 font-mono align-top">
                                            <div className="flex flex-col gap-1.5 text-[10px] text-cyan-500 mb-3">
                                                <span className="flex items-center gap-2 text-emerald-400/80">
                                                    <ArrowDown className="w-3 h-3"/>
                                                    <span>IN: {formatSpeed(download)}</span>
                                                </span>
                                                <span className="flex items-center gap-2 text-blue-400/80">
                                                    <ArrowUp className="w-3 h-3"/>
                                                    <span>OUT: {formatSpeed(upload)}</span>
                                                </span>
                                            </div>
                                            {server.trafficLimit > 0 ? (
                                                <div className="w-32">
                                                    <div
                                                        className="flex justify-between text-[9px] text-cyan-700 mb-0.5">
                                                        <span>流量使用</span>
                                                        <span>{Math.round((server.trafficUsed || 0) / server.trafficLimit * 100)}%</span>
                                                    </div>
                                                    <div className="h-1 bg-cyan-900/50 rounded-full overflow-hidden">
                                                        <div className="h-full bg-cyan-400"
                                                             style={{width: `${((server.trafficUsed || 0) / server.trafficLimit) * 100}%`}}></div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-[10px] text-cyan-800 italic">-- NO METERING --</div>
                                            )}
                                        </td>

                                        {/* Meta */}
                                        <td className="p-4 align-top">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex gap-1 flex-wrap">
                                                    {server.tags && server.tags.length > 0 && server.tags.map(tag => (
                                                        <span key={tag}
                                                              className="px-1.5 py-0.5 bg-cyan-900/40 text-cyan-400 border border-cyan-700/50 text-[10px] font-mono rounded-sm">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div
                                                    className={`text-[10px] font-mono flex items-center gap-1 ${server.expireTime && server.expireTime > 0 ? 'text-cyan-600' : 'text-emerald-500/60'}`}>
                                                    <Calendar className="w-3 h-3"/>
                                                    {server.expireTime > 0
                                                        ? `EXP: ${new Date(server.expireTime).toLocaleDateString('zh-CN')}`
                                                        : ''
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
                    <div className="md:hidden space-y-3">
                        {displayAgents.map(server => (
                            <ServerCard
                                key={server.id}
                                server={server}
                                onClick={handleNavigate}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default ServerList;
