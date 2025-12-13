import {useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {AlertCircle, CheckCircle2, Clock, Loader2, Shield} from 'lucide-react';
import {getPublicMonitors} from '@/api/monitor.ts';
import type {PublicMonitor} from '@/types';
import {usePublicLayout} from '../PublicLayout';
import {cn} from '@/lib/utils';
import {renderCert} from "@/pages/Public/Monitor.tsx";
import {formatTime,} from "@/utils/util.ts"

const LoadingSpinner = () => (
    <div className="flex min-h-[400px] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-600 dark:text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin"/>
            <span className="text-sm">加载监控数据中...</span>
        </div>
    </div>
);

const StatusBadge = ({status}: { status: string }) => {
    let containerClass = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
    let label = '未知';
    let icon = <Clock className="h-3.5 w-3.5"/>;

    if (status === 'up') {
        containerClass = 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
        label = '正常';
        icon = <CheckCircle2 className="h-3.5 w-3.5"/>;
    } else if (status === 'down') {
        containerClass = 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300';
        label = '异常';
        icon = <AlertCircle className="h-3.5 w-3.5"/>;
    }

    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                containerClass
            )}>
            {icon}
            {label}
        </div>
    );
};

const EmptyState = () => (
    <div className="flex min-h-[400px] flex-col items-center justify-center text-slate-500 dark:text-slate-400">
        <Shield className="mb-4 h-16 w-16 opacity-20"/>
        <p className="text-lg font-medium">暂无监控数据</p>
        <p className="mt-2 text-sm">请先在管理后台添加监控任务</p>
    </div>
);

const MonitorList = () => {
    const navigate = useNavigate();
    const {viewMode, setShowViewToggle} = usePublicLayout();

    // 挂载时启用视图切换，卸载时禁用
    useEffect(() => {
        setShowViewToggle(true);
        return () => setShowViewToggle(false);
    }, [setShowViewToggle]);

    const {data: monitors = [], isLoading, dataUpdatedAt} = useQuery<PublicMonitor[]>({
        queryKey: ['publicMonitors'],
        queryFn: async () => {
            const response = await getPublicMonitors();
            return response.data || [];
        },
        refetchInterval: 30000, // 30秒刷新一次
    });

    const monitorSummaries = monitors;

    const renderListView = () => (
        <>
            {/* 桌面端：使用表格布局 */}
            <div className="hidden overflow-hidden rounded-md border border-slate-200 dark:border-slate-700  lg:block">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                        <th className="px-5 py-3">监控项</th>
                        <th className="px-5 py-3">状态</th>
                        <th className="px-5 py-3">当前响应</th>
                        <th className="px-5 py-3">证书信息</th>
                    </tr>
                    </thead>
                    <tbody
                        className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-200">
                    {monitorSummaries.map((stats) => {
                        return (
                            <tr
                                key={stats.id}
                                tabIndex={0}
                                onClick={() => navigate(`/monitors/${encodeURIComponent(stats.id)}`)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        navigate(`/monitors/${encodeURIComponent(stats.id)}`);
                                    }
                                }}
                                className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-within:bg-slate-50 dark:focus-within:bg-slate-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                            >
                                <td className="px-5 py-4 align-center">
                                    <div>
                                        <div className="font-semibold text-slate-900 dark:text-white">
                                            {stats.name}
                                        </div>
                                        <div className="mt-1 text-xs text-blue-700 dark:text-blue-400 break-all">
                                            {stats.target}
                                        </div>
                                        {stats.agentCount > 1 && (
                                            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                                {stats.agentCount} 个探针
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-5 py-4 align-center">
                                    <StatusBadge status={stats.status}/>
                                </td>
                                <td className="px-5 py-4 align-center">
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500"/>
                                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                                {formatTime(stats.responseTime)}
                                            </span>
                                    </div>
                                </td>
                                <td className="px-5 py-4 align-center">
                                    {renderCert(stats)}
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
        return (
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
                <LoadingSpinner/>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            {monitorSummaries.length === 0 ? (
                <EmptyState/>
            ) : renderListView()}
        </div>
    );
};

export default MonitorList;
