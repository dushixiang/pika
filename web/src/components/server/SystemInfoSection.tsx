import type {ReactNode} from 'react';
import {Cpu, Database, HardDrive, MemoryStick, Network} from 'lucide-react';
import {Card} from '@/components/common';
import {InfoGrid, SnapshotSection, type SnapshotCardData} from '@/components/server';
import {formatBytes, formatDateTime, formatPercentValue, formatUptime} from '@/utils/util';
import type {Agent, LatestMetrics} from '@/types';
import CyberCard from "@/components/CyberCard.tsx";

type AccentVariant = 'blue' | 'emerald' | 'purple' | 'amber';

interface SystemInfoSectionProps {
    agent: Agent;
    latestMetrics: LatestMetrics | null;
}

/**
 * 系统信息区块组件
 * 显示运行环境、运行状态、快照卡片和网络连接统计
 */
export const SystemInfoSection = ({agent, latestMetrics}: SystemInfoSectionProps) => {
    // 环境信息
    const platformDisplay = latestMetrics?.host?.platform
        ? `${latestMetrics.host.platform} ${latestMetrics.host.platformVersion || ''}`.trim()
        : agent?.os || '-';
    const architectureDisplay = latestMetrics?.host?.kernelArch || agent?.arch || '-';

    const environmentInfo = [
        {label: '操作系统', value: platformDisplay || '-'},
        {label: '内核版本', value: latestMetrics?.host?.kernelVersion || '-'},
        {label: '硬件架构', value: architectureDisplay || '-'},
        {label: 'CPU 型号', value: latestMetrics?.cpu?.modelName || '-'},
        {label: '逻辑核心', value: latestMetrics?.cpu?.logicalCores ?? '-'},
        {label: '物理核心', value: latestMetrics?.cpu?.physicalCores ?? '-'},
    ];

    // 状态信息
    const uptimeDisplay = formatUptime(latestMetrics?.host?.uptime);
    const bootTimeDisplay = latestMetrics?.host?.bootTime
        ? formatDateTime(latestMetrics.host.bootTime * 1000)
        : '-';
    const lastSeenDisplay = agent ? formatDateTime(agent.lastSeenAt) : '-';

    const networkSummary = latestMetrics?.network
        ? `${formatBytes(latestMetrics.network.totalBytesSentTotal)} ↑ / ${formatBytes(
            latestMetrics.network.totalBytesRecvTotal,
        )} ↓`
        : '—';

    const statusInfo = [
        {label: '启动时间', value: bootTimeDisplay},
        {label: '运行时间', value: uptimeDisplay},
        {label: '最近心跳', value: lastSeenDisplay},
        {label: '进程数', value: latestMetrics?.host?.procs ?? '-'},
        {label: '网络累计', value: networkSummary},
    ];

    // 快照卡片
    const snapshotCards: SnapshotCardData[] = [];

    if (latestMetrics) {
        snapshotCards.push({
            key: 'cpu',
            icon: Cpu,
            title: 'CPU 使用',
            usagePercent: `${formatPercentValue(latestMetrics.cpu?.usagePercent)}%`,
            accent: 'blue',
            metrics: [
                {label: '当前使用', value: `${formatPercentValue(latestMetrics.cpu?.usagePercent)}%`},
                {
                    label: '采样时间',
                    value: latestMetrics.cpu ? formatDateTime(latestMetrics.cpu.timestamp) : '-',
                },
            ],
        });

        snapshotCards.push({
            key: 'memory',
            icon: MemoryStick,
            title: '内存使用',
            usagePercent: `${formatPercentValue(latestMetrics.memory?.usagePercent)}%`,
            accent: 'emerald',
            metrics: [
                {
                    label: '已用 / 总量',
                    value: `${formatBytes(latestMetrics.memory?.used)} / ${formatBytes(latestMetrics.memory?.total)}`
                },
                {
                    label: 'Swap 已用',
                    value: `${formatBytes(latestMetrics.memory?.swapUsed)} / ${formatBytes(latestMetrics.memory?.swapTotal)}`
                },
            ],
        });

        snapshotCards.push({
            key: 'disk',
            icon: HardDrive,
            title: '磁盘使用',
            usagePercent: latestMetrics.disk
                ? `${formatPercentValue(latestMetrics.disk.usagePercent)}%`
                : '—',
            accent: 'purple',
            metrics: [
                {
                    label: '已用 / 总量',
                    value: `${formatBytes(latestMetrics.disk?.used)} / ${formatBytes(latestMetrics.disk?.total)}`
                },
                {label: '磁盘数量', value: latestMetrics.disk?.totalDisks ?? '-'},
            ],
        });

        // 网络流量卡片 - 整合流量统计信息
        const networkMetrics = [
            {
                label: '上行 / 下行',
                value: `${formatBytes(latestMetrics.network?.totalBytesSentRate)}/s ↑ / ${formatBytes(
                    latestMetrics.network?.totalBytesRecvRate,
                )}/s ↓`,
            },
            {
                label: '网络累计',
                value: `${formatBytes(latestMetrics.network?.totalBytesSentTotal)} ↑ / ${formatBytes(
                    latestMetrics.network?.totalBytesRecvTotal,
                )} ↓`,
            },
        ];

        // 如果配置了流量限额，添加流量统计信息到网络卡片
        if (agent && agent.trafficLimit && agent.trafficLimit > 0) {
            const trafficUsedPercent = ((agent.trafficUsed || 0) / agent.trafficLimit) * 100;
            const trafficRemaining = agent.trafficLimit - (agent.trafficUsed || 0);

            networkMetrics.push({
                label: '流量限额',
                value: `${formatBytes(agent.trafficUsed || 0)} / ${formatBytes(agent.trafficLimit)} (${formatPercentValue(trafficUsedPercent)}%)`,
            });

            if (agent.trafficResetDay && agent.trafficResetDay > 0) {
                networkMetrics.push({
                    label: '重置日期',
                    value: `每月${agent.trafficResetDay}号`,
                });
            }
        }

        snapshotCards.push({
            key: 'network',
            icon: Network,
            title: '网络流量',
            usagePercent: latestMetrics.network
                ? `${formatBytes(latestMetrics.network.totalBytesSentRate)}/s`
                : '—',
            accent: 'amber',
            metrics: networkMetrics,
        });
    }

    return (
        <div>
            <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <CyberCard className={'p-6'}>
                        <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-cyan-400">运行环境</h3>
                        <p className="mt-1 text-[10px] text-cyan-700">来自最近一次探针上报的硬件与系统信息</p>
                        <div className="mt-4">
                            <InfoGrid items={environmentInfo}/>
                        </div>
                    </CyberCard>
                    <CyberCard className={'p-6'}>
                        <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-cyan-400">运行状态</h3>
                        <p className="mt-1 text-[10px] text-cyan-700">关键时间与网络指标，帮助快速判断主机健康状况</p>
                        <div className="mt-4">
                            <InfoGrid items={statusInfo}/>
                        </div>
                    </CyberCard>
                </div>
                <SnapshotSection cards={snapshotCards}/>
            </div>
        </div>
    );
};
