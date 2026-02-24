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
        // # mock 测试
        // const mockGpu: GPUMetric = {
        //     agentId: "agent123",           // 代理 ID
        //     fanSpeed: 3000,                // 风扇转速（单位：rpm）
        //     id: 1,                         // GPU ID
        //     index: 0,                      // GPU 索引
        //     memoryFree: 4096,              // 可用内存（单位：MB）
        //     memoryTotal: 8192,             // 总内存（单位：MB）
        //     memoryUsed: 4096,              // 已用内存（单位：MB）
        //     name: "NVIDIA GeForce RTX 3070",  // GPU 名称
        //     performanceState: "P0",        // 性能状态（P0-P15）
        //     powerUsage: 150,               // 功率使用（单位：W）
        //     temperature: 70,               // 温度（单位：°C）
        //     timestamp: Date.now(),         // 当前时间戳
        //     utilization: 85                // GPU 利用率（单位：%）
        // };
        // latestMetrics.gpu = [mockGpu];
    }

    return (
        <Card title="GPU 监控" description="显卡使用情况和温度监控">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {latestMetrics.gpu.map((gpu) => (
                    <div
                        key={gpu.index}
                        className="rounded-xl border border-slate-200 dark:border-cyan-900/50 bg-slate-50 dark:bg-black/30 p-4 backdrop-blur-sm hover:border-slate-300 dark:hover:border-cyan-700/50 transition"
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span
                                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-200 text-gray-600 dark:bg-cyan-500/10 dark:text-cyan-500">
                                    <Zap className="h-4 w-4"/>
                                </span>
                                <div>
                                    <p className="text-sm font-bold font-mono text-gray-700 dark:text-cyan-100">GPU {gpu.index}</p>
                                    <p className="text-xs text-gray-600 dark:text-cyan-500">{gpu.name}</p>
                                </div>
                            </div>
                            <span className="text-2xl font-bold text-orange-600 dark:text-purple-400">
                                {gpu.utilization?.toFixed(1) ?? 0}%
                            </span>
                        </div>
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span
                                    className="text-gray-600 dark:text-cyan-500 font-mono text-xs uppercase tracking-wider">温度</span>
                                <span
                                    className="font-medium text-gray-900 dark:text-cyan-200">{gpu.temperature?.toFixed(1)}°C</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span
                                    className="text-gray-600 dark:text-cyan-500 font-mono text-xs uppercase tracking-wider">显存</span>
                                <span className="font-medium text-gray-900 dark:text-cyan-200">
                                    {formatBytes(gpu.memoryUsed)} / {formatBytes(gpu.memoryTotal)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span
                                    className="text-gray-600 dark:text-cyan-500 font-mono text-xs uppercase tracking-wider">功耗</span>
                                <span
                                    className="font-medium text-gray-900 dark:text-cyan-200">{gpu.powerUsage?.toFixed(1)}W</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span
                                    className="text-gray-600 dark:text-cyan-500 font-mono text-xs uppercase tracking-wider">风扇转速</span>
                                <span
                                    className="font-medium text-gray-900 dark:text-cyan-200">{gpu.fanSpeed?.toFixed(0)}%</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};
