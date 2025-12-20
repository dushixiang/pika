import {useNavigate, useParams} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {getMonitorAgentStats, getMonitorStatsById} from '@/api/monitor.ts';
import type {AgentMonitorStat, PublicMonitor} from '@/types';
import {MonitorHero, ResponseTimeChart, AgentStatsTable} from '@/components/monitor';
import {EmptyState, LoadingSpinner} from '@/components/common';

/**
 * 监控详情页面
 * 显示监控的详细信息、响应时间趋势和各探针统计
 */
const MonitorDetail = () => {
    const navigate = useNavigate();
    const {id} = useParams<{ id: string }>();

    // 获取监控详情（聚合数据）
    const {data: monitorDetail, isLoading} = useQuery<PublicMonitor>({
        queryKey: ['monitorDetail', id],
        queryFn: async () => {
            if (!id) throw new Error('Monitor ID is required');
            const response = await getMonitorStatsById(id);
            return response.data;
        },
        refetchInterval: 30000,
        enabled: !!id,
    });

    // 获取各探针的统计数据
    const {data: monitorStats = []} = useQuery<AgentMonitorStat[]>({
        queryKey: ['monitorAgentStats', id],
        queryFn: async () => {
            if (!id) return [];
            const response = await getMonitorAgentStats(id);
            return response.data || [];
        },
        refetchInterval: 30000,
        enabled: !!id,
    });

    if (isLoading) {
        return <LoadingSpinner/>;
    }

    if (!monitorDetail) {
        return <EmptyState/>;
    }

    return (
        <div className="bg-[#f0f2f5] dark:bg-[#05050a] min-h-screen">
            <div className="mx-auto flex max-w-7xl flex-col px-4 pb-10 pt-4 sm:pt-6 sm:px-6 lg:px-8">
                {/* 头部区域 */}
                <MonitorHero
                    monitor={monitorDetail}
                    onBack={() => navigate('/monitors')}
                />

                {/* 主内容区 */}
                <main className="flex-1 py-6 sm:py-8 lg:py-10 space-y-6 sm:space-y-8 lg:space-y-10">
                    {/* 响应时间趋势图表 */}
                    <ResponseTimeChart
                        monitorId={id!}
                        monitorStats={monitorStats}
                    />

                    {/* 各探针详细数据 */}
                    <AgentStatsTable
                        monitorStats={monitorStats}
                        monitorType={monitorDetail.type}
                    />
                </main>
            </div>
        </div>
    );
};

export default MonitorDetail;
