import {Thermometer} from 'lucide-react';
import {Card} from '@/components/common';
import type {LatestMetrics} from '@/types';

interface TemperatureMonitorSectionProps {
    latestMetrics: LatestMetrics | null;
}

/**
 * 温度监控区块组件
 * 显示系统各部件温度传感器数据
 */
export const TemperatureMonitorSection = ({latestMetrics}: TemperatureMonitorSectionProps) => {
    // 如果没有温度数据，不渲染组件
    if (!latestMetrics?.temperature || latestMetrics.temperature.length === 0) {
        return null;
    }

    return (
        <Card title="温度监控" description="系统各部件温度传感器数据">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {latestMetrics.temperature.sort((a, b) => a.sensorKey.localeCompare(b.sensorKey)).map((temp) => (
                    <div
                        key={temp.sensorKey}
                        className="rounded-xl border border-slate-200 dark:border-cyan-900/50 bg-slate-50 dark:bg-black/30 p-4 backdrop-blur-sm hover:border-slate-300 dark:hover:border-cyan-700/50 transition"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Thermometer className="h-4 w-4 text-gray-600 dark:text-cyan-500"/>
                            <p className="text-xs font-bold font-mono uppercase tracking-wider text-gray-700 dark:text-cyan-500 truncate">{temp.type}</p>
                        </div>
                        <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{temp.temperature.toFixed(1)}°C</p>
                    </div>
                ))}
            </div>
        </Card>
    );
};
