import {Zap} from 'lucide-react';
import {Card} from '@portal/components/Card';
import {formatBytes} from '@/lib/format.ts';
import type {LatestMetrics} from '@/types';

interface GpuMonitorSectionProps {
    latestMetrics: LatestMetrics | null;
}

/**
 * GPU 监控区块组件
 * 显示 GPU 使用情况、温度、显存和功耗信息
 */
export const GpuMonitorSection = ({latestMetrics}: GpuMonitorSectionProps) => {
    // 如果没有 GPU 数据，不渲染组件
    if (!latestMetrics?.gpu || latestMetrics.gpu.length === 0) {
        return null;
    }

    return (
        <Card title="GPU 监控" description="显卡使用情况和温度监控">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {latestMetrics.gpu.map((gpu) => (
                    <div
                        key={gpu.index}
                        className="rounded-xl border border-cyan-900/50 bg-black/30 p-4 backdrop-blur-sm hover:border-cyan-700/50 transition"
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span
                                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
                                    <Zap className="h-4 w-4"/>
                                </span>
                                <div>
                                    <p className="text-sm font-bold font-mono text-cyan-100">GPU {gpu.index}</p>
                                    <p className="text-xs text-cyan-500">{gpu.name}</p>
                                </div>
                            </div>
                            <span className="text-2xl font-bold text-purple-400">
                                {gpu.utilization?.toFixed(1) ?? 0}%
                            </span>
                        </div>
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-cyan-500 font-mono text-xs uppercase tracking-wider">温度</span>
                                <span className="font-medium text-cyan-200">{gpu.temperature?.toFixed(1)}°C</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-cyan-500 font-mono text-xs uppercase tracking-wider">显存</span>
                                <span className="font-medium text-cyan-200">
                                    {formatBytes(gpu.memoryUsed)} / {formatBytes(gpu.memoryTotal)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-cyan-500 font-mono text-xs uppercase tracking-wider">功耗</span>
                                <span className="font-medium text-cyan-200">{gpu.powerUsage?.toFixed(1)}W</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-cyan-500 font-mono text-xs uppercase tracking-wider">风扇转速</span>
                                <span className="font-medium text-cyan-200">{gpu.fanSpeed?.toFixed(0)}%</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};
