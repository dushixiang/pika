import {useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {Card} from '@portal/components/Card';
import {EmptyState} from '@portal/components/EmptyState';
import {LoadingSpinner} from '@portal/components/LoadingSpinner';
import {TimeRangeSelector} from '@portal/components/TimeRangeSelector';
import {GpuMonitorSection} from '@portal/components/server/GpuMonitorSection';
import {NetworkConnectionSection} from '@portal/components/server/NetworkConnectionSection';
import {ServerHero} from '@portal/components/server/ServerHero';
import {SystemInfoSection} from '@portal/components/server/SystemInfoSection';
import {TemperatureMonitorSection} from '@portal/components/server/TemperatureMonitorSection';
import {CpuChart} from '@portal/components/server/CpuChart';
import {DiskIOChart} from '@portal/components/server/DiskIOChart';
import {GpuChart} from '@portal/components/server/GpuChart';
import {MemoryChart} from '@portal/components/server/MemoryChart';
import {MonitorChart} from '@portal/components/server/MonitorChart';
import {NetworkChart} from '@portal/components/server/NetworkChart';
import {NetworkConnectionChart} from '@portal/components/server/NetworkConnectionChart';
import {TemperatureChart} from '@portal/components/server/TemperatureChart';
import {useAgentQuery, useLatestMetricsQuery} from '@portal/hooks/server';
import {SERVER_TIME_RANGE_OPTIONS} from '@portal/constants/time';

/**
 * 服务器详情页面
 * 显示服务器的详细信息、实时指标和历史趋势图表
 */
const ServerDetail = () => {
    const {id} = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [timeRange, setTimeRange] = useState<string>('15m');
    const [customRange, setCustomRange] = useState<{ start: number; end: number } | null>(null);

    const handleCustomRangeApply = (range: { start: number; end: number }) => {
        setCustomRange(range);
    };

    const customStart = timeRange === 'custom' ? customRange?.start : undefined;
    const customEnd = timeRange === 'custom' ? customRange?.end : undefined;

    // 查询基础数据（用于页面头部和系统信息）
    const {data: agentResponse, isLoading} = useAgentQuery(id);
    const {data: latestMetricsResponse} = useLatestMetricsQuery(id);

    const agent = agentResponse?.data;
    const latestMetrics = latestMetricsResponse?.data || null;

    if (isLoading) {
        return <LoadingSpinner/>;
    }

    if (!agent) {
        return <EmptyState/>;
    }

    return (
        <div className="bg-[#f0f2f5] dark:bg-[#05050a] min-h-screen">
            <div className="mx-auto flex max-w-7xl flex-col px-4 pb-10 pt-4 sm:pt-6 sm:px-6 lg:px-8">
                {/* 头部区域 */}
                <ServerHero
                    agent={agent}
                    latestMetrics={latestMetrics}
                    onBack={() => navigate('/')}
                />

                {/* 主内容区 */}
                <main className="flex-1 py-6 sm:py-8 lg:py-10 space-y-6 sm:space-y-8 lg:space-y-10">
                    {/* 系统信息 */}
                    <SystemInfoSection agent={agent} latestMetrics={latestMetrics}/>

                    {/* 历史趋势图表 */}
                    <Card
                        title="历史趋势"
                        description="针对选定时间范围展示 CPU、内存与网络的变化趋势"
                        action={
                            <div className="flex flex-wrap items-center gap-2">
                                <TimeRangeSelector
                                    value={timeRange}
                                    onChange={setTimeRange}
                                    options={SERVER_TIME_RANGE_OPTIONS}
                                    enableCustom
                                    customRange={customRange}
                                    onCustomRangeApply={handleCustomRangeApply}
                                />
                            </div>
                        }
                    >
                        <div className="space-y-4 sm:space-y-5 lg:space-y-6">
                            {/* 核心指标：大屏 2 列，小屏 1 列 */}
                            <div className="grid gap-4 sm:gap-5 lg:gap-6 grid-cols-1 md:grid-cols-2">
                                <CpuChart agentId={id!} timeRange={timeRange} start={customStart} end={customEnd}/>
                                <MemoryChart agentId={id!} timeRange={timeRange} start={customStart} end={customEnd}/>
                            </div>

                            {/* 网络相关：大屏 2 列，中屏 1 列 */}
                            <div className="grid gap-4 sm:gap-5 lg:gap-6 grid-cols-1 lg:grid-cols-2">
                                <NetworkChart agentId={id!} timeRange={timeRange} start={customStart} end={customEnd}/>
                                <DiskIOChart agentId={id!} timeRange={timeRange} start={customStart} end={customEnd}/>
                            </div>

                            {/* 进阶指标：单列全宽 */}
                            <div className="grid gap-4 sm:gap-5 lg:gap-6 grid-cols-1">
                                <NetworkConnectionChart agentId={id!} timeRange={timeRange} start={customStart} end={customEnd}/>
                            </div>

                            {/* 硬件指标：条件渲染，单列全宽 */}
                            <div className="grid gap-4 sm:gap-5 lg:gap-6 grid-cols-1">
                                <GpuChart agentId={id!} timeRange={timeRange} start={customStart} end={customEnd}/>
                                <TemperatureChart agentId={id!} timeRange={timeRange} start={customStart} end={customEnd}/>
                            </div>

                            {/* 监控指标：单列全宽 */}
                            <div className="grid gap-4 sm:gap-5 lg:gap-6 grid-cols-1">
                                <MonitorChart agentId={id!} timeRange={timeRange} start={customStart} end={customEnd}/>
                            </div>
                        </div>
                    </Card>

                    {/* 网络连接统计 */}
                    <NetworkConnectionSection latestMetrics={latestMetrics}/>

                    {/* GPU 监控 */}
                    <GpuMonitorSection latestMetrics={latestMetrics}/>

                    {/* 温度监控 */}
                    <TemperatureMonitorSection latestMetrics={latestMetrics}/>
                </main>
            </div>
        </div>
    );
};

export default ServerDetail;
