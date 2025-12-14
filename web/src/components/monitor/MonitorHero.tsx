import {ArrowLeft} from 'lucide-react';
import {TypeIcon} from './TypeIcon';
import {StatusBadge} from './StatusBadge';
import {CertBadge} from './CertBadge';
import LittleStatCard from '@/components/common/LittleStatCard';
import type {PublicMonitor} from '@/types';
import CyberCard from "@/components/CyberCard.tsx";

interface MonitorHeroProps {
    monitor: PublicMonitor;
    onBack: () => void;
}

/**
 * 监控详情头部组件
 * 显示监控基本信息、状态和关键指标
 */
export const MonitorHero = ({monitor, onBack}: MonitorHeroProps) => {
    return (
        <CyberCard className={'p-6 space-y-6'}>
            {/* 返回按钮 */}
            <button
                type="button"
                onClick={onBack}
                className="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-cyan-600 hover:text-cyan-400 transition font-mono"
            >
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1"/>
                返回监控列表
            </button>

            {/* 监控信息 */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="p-3 bg-cyan-950/30 border border-cyan-500/20 rounded-lg flex-shrink-0">
                        <TypeIcon type={monitor.type}/>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono text-cyan-500/60 mb-1 tracking-wider">
                            MONITOR_ID: {monitor.id.toString().substring(0, 8)}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                            <h1 className="text-2xl sm:text-3xl font-bold truncate text-cyan-100 tracking-wide">{monitor.name}</h1>
                            <StatusBadge status={monitor.status}/>
                        </div>
                        <p className="text-sm text-cyan-500/80 font-mono truncate">
                            {monitor.showTargetPublic ? monitor.target : '******'}
                        </p>
                    </div>
                </div>

                {/* 统计卡片 */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full lg:w-auto lg:min-w-[480px]">
                    <LittleStatCard
                        label="监控类型"
                        value={monitor.type.toUpperCase()}
                    />
                    <LittleStatCard
                        label="探针数量"
                        value={monitor.agentCount}
                    />
                    <LittleStatCard
                        label="平均响应"
                        value={`${monitor.responseTime}ms`}
                    />
                    <LittleStatCard
                        label="最慢响应"
                        value={`${monitor.responseTimeMax}ms`}
                    />
                </div>
            </div>

            {/* 证书信息（如果是 HTTPS）*/}
            {monitor.type === 'https' && monitor.certExpiryTime && (
                <div className="flex items-center gap-2 pt-4 border-t border-cyan-900/50">
                    <span className="text-xs text-cyan-500/60 font-mono">SSL 证书:</span>
                    <CertBadge
                        expiryTime={monitor.certExpiryTime}
                        daysLeft={monitor.certDaysLeft}
                    />
                </div>
            )}
        </CyberCard>
    );
};
