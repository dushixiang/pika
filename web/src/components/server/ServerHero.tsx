import {ArrowLeft} from 'lucide-react';
import {formatBytes, formatDateTime, formatUptime} from '@/utils/util';
import type {Agent, LatestMetrics} from '@/types';
import LittleStatCard from '@/components/common/LittleStatCard';
import CyberCard from "@/components/CyberCard.tsx";
import {StatusBadge} from "@/components/common/StatusBadge.tsx";

interface ServerHeroProps {
    agent: Agent;
    latestMetrics: LatestMetrics | null;
    onBack: () => void;
}

/**
 * 服务器头部信息组件
 * 显示服务器基本信息、状态和关键指标
 */
export const ServerHero = ({agent, latestMetrics, onBack}: ServerHeroProps) => {
    const displayName = agent?.name?.trim() ? agent.name : '未命名探针';
    const isOnline = agent?.status === 1;
    const statusDotStyles = isOnline ? 'bg-emerald-500' : 'bg-rose-500';
    const statusText = isOnline ? '在线' : '离线';

    const platformDisplay = latestMetrics?.host?.platform
        ? `${latestMetrics.host.platform} ${latestMetrics.host.platformVersion || ''}`.trim()
        : agent?.os || '-';
    const architectureDisplay = latestMetrics?.host?.kernelArch || agent?.arch || '-';
    const uptimeDisplay = formatUptime(latestMetrics?.host?.uptime);
    const lastSeenDisplay = agent ? formatDateTime(agent.lastSeenAt) : '-';

    const networkSummary = latestMetrics?.network
        ? `${formatBytes(latestMetrics.network.totalBytesSentTotal)} ↑ / ${formatBytes(
            latestMetrics.network.totalBytesRecvTotal,
        )} ↓`
        : '—';

    const heroStats = [
        {label: '运行系统', value: platformDisplay || '-'},
        {label: '硬件架构', value: architectureDisplay || '-'},
        {label: '系统进程', value: latestMetrics?.host?.procs || '-'},
        {label: '运行时长', value: uptimeDisplay},
    ];

    return (
        <CyberCard className={'p-6'}>
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-4">
                        <button
                            type="button"
                            onClick={onBack}
                            className="group inline-flex items-center gap-2 text-xs font-bold font-mono uppercase tracking-[0.3em] dark:text-cyan-500 transition dark:hover:text-cyan-500"
                        >
                            <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5"/>
                            返回概览
                        </button>
                        <div className="flex items-start gap-4">
                            <div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <h1 className="text-3xl font-bold dark:text-cyan-100">{displayName}</h1>
                                    <StatusBadge status={agent.status === 1 ? 'up' : 'down'}/>
                                </div>
                                <p className="mt-2 text-sm dark:text-cyan-500 font-mono">
                                    {[agent.hostname, agent.ip].filter(Boolean).join(' · ') || '-'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full lg:w-auto lg:min-w-[480px]">
                        {heroStats.map((stat) => (
                            <LittleStatCard key={stat.label} label={stat.label} value={stat.value}/>
                        ))}
                    </div>
                </div>
                <div
                    className="flex flex-wrap items-center gap-3 text-xs dark:text-cyan-500 font-mono pt-4 border-t border-cyan-900/30">
                    <span>探针 ID：{agent.id}</span>
                    <span className="hidden h-1 w-1 rounded-full bg-cyan-900 sm:inline-block"/>
                    <span>版本：{agent.version || '-'}</span>
                    <span className="hidden h-1 w-1 rounded-full bg-cyan-900 sm:inline-block"/>
                    <span>网络累计：{networkSummary}</span>
                </div>
            </div>
        </CyberCard>
    );
};
