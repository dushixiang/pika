import {ArrowLeft} from 'lucide-react';
import {TypeIcon} from './TypeIcon';
import {StatusBadge} from '../common/StatusBadge.tsx';
import {CertBadge} from './CertBadge';
import LittleStatCard from '@/components/common/LittleStatCard';
import type {PublicMonitor} from '@/types';
import CyberCard from "@/components/CyberCard.tsx";
import {formatDateTime} from "@/utils/util.ts";

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
                className="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-cyan-500 hover:text-gray-800 dark:hover:text-cyan-400 transition font-mono"
            >
                <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1"/>
                返回监控列表
            </button>

            {/* 监控信息 */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="p-3 bg-gray-100 dark:bg-cyan-950/30 border border-slate-200 dark:border-cyan-500/20 rounded-lg flex-shrink-0">
                        <TypeIcon type={monitor.type}/>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                            <h1 className="text-2xl sm:text-3xl font-bold truncate text-slate-800 dark:text-cyan-100 tracking-wide">{monitor.name}</h1>
                            <StatusBadge status={monitor.status}/>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-cyan-500/80 font-mono truncate">
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

            {/* 证书信息（如果存在证书数据）*/}
            {monitor.certExpiryTime > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-4 border-t border-slate-200 dark:border-cyan-900/50">
                    <span className="text-xs text-gray-600 dark:text-cyan-500 font-mono">SSL 证书:</span>
                    <div className="flex items-center gap-3">
                        <CertBadge
                            expiryTime={monitor.certExpiryTime}
                            daysLeft={monitor.certDaysLeft}
                        />
                        <span className="text-xs text-gray-500 dark:text-cyan-600 font-mono">
                            到期时间: {formatDateTime(monitor.certExpiryTime)}
                        </span>
                    </div>
                </div>
            )}
        </CyberCard>
    );
};
