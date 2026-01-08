import {Network} from 'lucide-react';
import {Card} from '@portal/components/Card';
import type {LatestMetrics} from '@/types';

interface NetworkConnectionSectionProps {
    latestMetrics: LatestMetrics | null;
}

/**
 * 网络连接统计区块组件
 * 显示 TCP 连接各状态的实时统计数据
 */
export const NetworkConnectionSection = ({latestMetrics}: NetworkConnectionSectionProps) => {
    // 如果没有网络连接数据，不渲染组件
    if (!latestMetrics?.networkConnection) {
        return null;
    }

    return (
        <Card title="网络连接统计" description="TCP 连接各状态的实时统计数据">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <div className="text-center">
                    <div className="text-xs text-gray-600 dark:text-cyan-500 font-mono uppercase tracking-wider">Total</div>
                    <div className="mt-1 text-lg font-semibold text-slate-800 dark:text-cyan-100">{latestMetrics.networkConnection.total}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-gray-600 dark:text-cyan-500 font-mono uppercase tracking-wider">ESTABLISHED</div>
                    <div
                        className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{latestMetrics.networkConnection.established}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-gray-600 dark:text-cyan-500 font-mono uppercase tracking-wider">TIME_WAIT</div>
                    <div
                        className="mt-1 text-lg font-semibold text-amber-600 dark:text-amber-400">{latestMetrics.networkConnection.timeWait}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-gray-600 dark:text-cyan-500 font-mono uppercase tracking-wider">LISTEN</div>
                    <div
                        className="mt-1 text-lg font-semibold text-blue-600 dark:text-blue-400">{latestMetrics.networkConnection.listen}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-gray-600 dark:text-cyan-500 font-mono uppercase tracking-wider">CLOSE_WAIT</div>
                    <div
                        className="mt-1 text-lg font-semibold text-rose-600 dark:text-rose-400">{latestMetrics.networkConnection.closeWait}</div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-gray-600 dark:text-cyan-500 font-mono uppercase tracking-wider">OTHER</div>
                    <div className="mt-1 text-lg font-semibold text-gray-700 dark:text-cyan-500">
                        {latestMetrics.networkConnection.synSent +
                            latestMetrics.networkConnection.synRecv +
                            latestMetrics.networkConnection.finWait1 +
                            latestMetrics.networkConnection.finWait2 +
                            latestMetrics.networkConnection.close +
                            latestMetrics.networkConnection.lastAck +
                            latestMetrics.networkConnection.closing}
                    </div>
                </div>
            </div>
        </Card>
    );
};
