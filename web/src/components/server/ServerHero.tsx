import {ArrowLeft} from 'lucide-react';
import {cn} from '@/lib/utils';
import {formatBytes, formatDateTime, formatUptime} from '@/utils/util';
import type {Agent, LatestMetrics} from '@/types';
import LittleStatCard from '@/components/common/LittleStatCard';
import CyberCard from "@/components/CyberCard.tsx";

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
        {label: '最近心跳', value: lastSeenDisplay},
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
                            className="group inline-flex items-center gap-2 text-xs font-bold font-mono uppercase tracking-[0.3em] text-cyan-600 transition hover:text-cyan-400"
                        >
                            <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5"/>
                            返回概览
                        </button>
                        <div className="flex items-start gap-4">
                            <div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <h1 className="text-3xl font-bold text-cyan-100">{displayName}</h1>
                                    <span
                                        className={cn(
                                            "inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-bold font-mono uppercase tracking-wider",
                                            isOnline
                                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/50'
                                        )}
                                    >
                                        <span className={cn("h-1.5 w-1.5 rounded-full", statusDotStyles)}/>
                                        {statusText}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm text-cyan-600 font-mono">
                                    {[agent.hostname, agent.ip].filter(Boolean).join(' · ') || '-'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-2 xl:grid-cols-4">
                        {heroStats.map((stat) => (
                            <LittleStatCard key={stat.label} label={stat.label} value={stat.value}/>
                        ))}
                    </div>
                </div>
                <div
                    className="flex flex-wrap items-center gap-3 text-xs text-cyan-600 font-mono pt-4 border-t border-cyan-900/30">
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
