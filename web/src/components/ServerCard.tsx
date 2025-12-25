import type {FC} from 'react';
import {
    Activity,
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Calendar,
    Clock,
    Cpu,
    HardDrive,
    MemoryStick,
    Network,
    Thermometer
} from 'lucide-react';
import type {Agent, LatestMetrics} from '@/types';
import CompactResourceBar from '@/components/CompactResourceBar';
import {formatBytes, formatSpeed, formatUptime} from '@/utils/util';
import CyberCard from "@/components/CyberCard.tsx";
import {Link} from "react-router-dom";

interface AgentWithMetrics extends Agent {
    metrics?: LatestMetrics;
}

interface ServerCardProps {
    server: AgentWithMetrics;
}

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

const ServerCard: FC<ServerCardProps> = ({server}) => {
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
        <Link to={`/servers/${server.id}`}>
            <CyberCard>
                <div className="relative z-10 p-5 space-y-2">
                    {/* 顶部：名称和状态 */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-800 dark:text-cyan-100 font-mono text-base truncate">
                                {server.name || server.hostname}
                            </div>
                            <div
                                className="flex items-center gap-2 text-xs text-gray-600 dark:text-cyan-500 mt-1 font-mono uppercase">
                                <span>{server.os}</span>
                                <span className="w-px h-2 bg-gray-400 dark:bg-cyan-800"></span>
                                <span>{server.arch}</span>
                            </div>
                        </div>
                        {server.tags && server.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap justify-end">
                                {server.tags.slice(0, 2).map(tag => (
                                    <span
                                        key={tag}
                                        className="px-1.5 py-0.5 bg-gray-100 dark:bg-cyan-900/40 text-gray-700 dark:text-cyan-500 border border-gray-300 dark:border-cyan-700/50 text-xs font-mono rounded-sm whitespace-nowrap"
                                    >
                                #{tag}
                            </span>
                                ))}
                                {server.tags.length > 2 && (
                                    <span
                                        className="px-1.5 py-0.5 bg-gray-100 dark:bg-cyan-900/40 text-gray-700 dark:text-cyan-500 border border-gray-300 dark:border-cyan-700/50 text-xs font-mono rounded-sm">
                                +{server.tags.length - 2}
                            </span>
                                )}
                            </div>
                        )}
                    </div>

                    {isOnline && server.metrics?.host && (
                        <div className="flex items-center gap-2 text-xs font-mono mt-1.5">
                            <div className="flex items-center gap-1 text-gray-500 dark:text-cyan-500">
                                <Clock className="w-3 h-3"/>
                                <span>{formatUptime(server.metrics.host.uptime)}</span>
                            </div>
                            <span className="w-px h-2 bg-gray-400 dark:bg-cyan-800"></span>
                            <div className="flex items-center gap-1 text-gray-500 dark:text-cyan-500">
                                <Activity className="w-3 h-3"/>
                                <span>{server.metrics.host.procs} 进程</span>
                            </div>
                        </div>
                    )}

                    {/* 资源使用情况 */}
                    {isOnline ? (
                        <div className="space-y-1">
                            <CompactResourceBar
                                value={cpuUsage}
                                label="CPU"
                                icon={Cpu}
                                subtext={server.metrics?.cpu ? `${server.metrics.cpu.physicalCores}核` : null}
                                color="bg-blue-500"
                            />
                            <CompactResourceBar
                                value={memoryUsage}
                                label="RAM"
                                icon={MemoryStick}
                                subtext={`${formatBytes(memoryUsed, 0)}/${formatBytes(memoryTotal, 0)}`}
                                color="bg-purple-500"
                            />
                            <CompactResourceBar
                                value={diskUsage}
                                label="DSK"
                                icon={HardDrive}
                                subtext={`${formatBytes(diskUsed, 0)}/${formatBytes(diskTotal, 0)}`}
                                color="bg-emerald-500"
                            />
                            {temperatures.length > 0 && (
                                <div className="flex items-center gap-2 mt-1 text-xs font-mono pt-1 flex-wrap">
                                    <Thermometer className="w-3 h-3 text-orange-400"/>
                                    {temperatures.map((temp, index) => (
                                        <span key={index} className="flex items-center gap-1">
                                        <span className="text-orange-400">{temp.temperature?.toFixed(1)}°C</span>
                                        <span className="text-gray-500 dark:text-cyan-500">{temp.type}</span>
                                            {index < temperatures.length - 1 &&
                                                <span className="text-gray-400 dark:text-cyan-900">|</span>}
                                    </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-xs text-rose-500 font-mono flex items-center gap-2 py-2">
                            <AlertTriangle className="w-4 h-4"/>
                            <span>离线</span>
                        </div>
                    )}

                    {/* 网络和流量 */}
                    <div className="pt-2 border-t border-slate-200 dark:border-cyan-900/30 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex gap-3 text-xs font-mono">
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400/80">
                                <ArrowDown className="w-3 h-3"/>
                                {formatSpeed(download)}
                            </span>
                                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400/80">
                                <ArrowUp className="w-3 h-3"/>
                                    {formatSpeed(upload)}
                            </span>
                            </div>
                            {server.expireTime > 0 && (
                                <div
                                    className="text-xs font-mono text-cyan-600 dark:text-cyan-500 flex items-center gap-1">
                                    <Calendar className="w-3 h-3"/>
                                    {new Date(server.expireTime).toLocaleDateString('zh-CN')}
                                </div>
                            )}
                        </div>
                        {isOnline && netConn && (
                            <div className="flex gap-3 text-xs font-mono">
                            <span className="flex items-center gap-1">
                                <Network className="w-3 h-3 text-emerald-600 dark:text-emerald-400"/>
                                <span
                                    className="text-emerald-600 dark:text-emerald-400">{netConn.established || 0}</span>
                                <span className="text-gray-600 dark:text-cyan-500">ESTABLISHED</span>
                            </span>
                                <span className="flex items-center gap-1">
                                <Network className="w-3 h-3 text-blue-600 dark:text-blue-400"/>
                                <span className="text-blue-600 dark:text-blue-400">{netConn.listen || 0}</span>
                                <span className="text-gray-600 dark:text-cyan-500">LISTEN</span>
                            </span>
                                <span className="flex items-center gap-1">
                                <Network className="w-3 h-3 text-rose-600 dark:text-rose-400"/>
                                <span className="text-rose-600 dark:text-rose-400">{netConn.closeWait || 0}</span>
                                <span className="text-gray-600 dark:text-cyan-500">CLOSE_WAIT</span>
                            </span>
                            </div>
                        )}
                    </div>

                    {/* 流量限制 */}
                    {server.trafficLimit > 0 && (
                        <div className="pt-2 border-t border-slate-200 dark:border-cyan-900/30">
                            <div className="flex justify-between text-xs text-gray-600 dark:text-cyan-500 mb-1">
                                <span>流量使用</span>
                                <span>{Math.round((server.trafficUsed || 0) / server.trafficLimit * 100)}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-200 dark:bg-cyan-900/50 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gray-500 dark:bg-cyan-400 transition-all"
                                    style={{width: `${((server.trafficUsed || 0) / server.trafficLimit) * 100}%`}}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </CyberCard>
        </Link>
    );
};

export default ServerCard;
