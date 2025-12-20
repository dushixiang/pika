import {AlertCircle, Clock, MapPin} from 'lucide-react';
import {StatusBadge} from '../common/StatusBadge.tsx';
import {CertBadge} from './CertBadge';
import {AGENT_COLORS} from '@/constants/colors';
import {formatDateTime, formatTime} from '@/utils/util';
import type {AgentMonitorStat} from '@/types';
import CyberCard from "@/components/CyberCard.tsx";

interface AgentStatsTableProps {
    monitorStats: AgentMonitorStat[];
    monitorType: string;
}

/**
 * 探针监控统计表格组件
 * 显示各探针的当前状态和统计数据
 */
export const AgentStatsTable = ({monitorStats, monitorType}: AgentStatsTableProps) => {
    if (monitorStats.length === 0) {
        return (
            <div className="text-center py-12 text-gray-600 dark:text-cyan-500">
                <p className="text-sm font-mono">暂无探针数据</p>
            </div>
        );
    }

    return (
        <CyberCard className="p-6">
            <div className="mb-6">
                <h3 className="text-lg font-bold tracking-wide text-slate-800 dark:text-cyan-100 uppercase">探针监控详情</h3>
                <p className="text-xs text-gray-600 dark:text-cyan-500 mt-1 font-mono">各探针的当前状态和统计数据</p>
            </div>

            <div className="overflow-x-auto -mx-6 px-6">
                <table className="min-w-full">
                    <thead>
                    <tr className="border-b border-slate-200 dark:border-cyan-900/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-cyan-500 font-mono">
                            探针名称
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-cyan-500 font-mono">
                            状态
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-cyan-500 font-mono">
                            响应时间
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-cyan-500 font-mono hidden lg:table-cell">
                            最后检测
                        </th>
                        {monitorType === 'https' && (
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-cyan-500 font-mono hidden xl:table-cell">
                                证书信息
                            </th>
                        )}
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-cyan-500 font-mono hidden xl:table-cell">
                            错误信息
                        </th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-cyan-900/30">
                    {monitorStats.map((stat, index) => {
                        const color = AGENT_COLORS[index % AGENT_COLORS.length];
                        return (
                            <tr key={stat.agentId}
                                className="hover:bg-slate-100 dark:hover:bg-cyan-950/20 transition-colors">
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-3">
                                            <span
                                                className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                                                style={{backgroundColor: color}}
                                            />
                                        <div className="flex items-center gap-2">
                                            <MapPin className="h-3.5 w-3.5 text-gray-600 dark:text-cyan-500"/>
                                            <span className="font-mono text-sm text-slate-800 dark:text-cyan-200">
                                                    {stat.agentName || stat.agentId.substring(0, 8)}
                                                </span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <StatusBadge status={stat.status}/>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-gray-600 dark:text-cyan-500"/>
                                        <span className="text-sm font-semibold text-slate-800 dark:text-cyan-100 font-mono">
                                                {formatTime(stat.responseTime)}
                                            </span>
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-sm text-gray-600 dark:text-cyan-500 font-mono hidden lg:table-cell">
                                    {formatDateTime(stat.checkedAt)}
                                </td>
                                {monitorType === 'https' && (
                                    <td className="px-4 py-4 hidden xl:table-cell">
                                        {stat.certExpiryTime ? (
                                            <CertBadge
                                                expiryTime={stat.certExpiryTime}
                                                daysLeft={stat.certDaysLeft}
                                            />
                                        ) : (
                                            <span className="text-xs text-gray-600 dark:text-cyan-500">-</span>
                                        )}
                                    </td>
                                )}
                                <td className="px-4 py-4 hidden xl:table-cell">
                                    {stat.status === 'down' && stat.message ? (
                                        <div className="flex items-start gap-2 max-w-xs">
                                            <AlertCircle
                                                className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5"/>
                                            <span
                                                className="text-xs text-rose-300 break-words line-clamp-2 font-mono">
                                                    {stat.message}
                                                </span>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-600 dark:text-cyan-500">-</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </CyberCard>
    );
};
