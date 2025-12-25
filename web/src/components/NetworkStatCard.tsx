import type {FC} from 'react';
import {ArrowDown, ArrowUp, Network} from 'lucide-react';
import {formatBytes, formatSpeed} from '@/utils/util';
import {cn} from "@/lib/utils.ts";

interface NetworkStatCardProps {
    uploadRate: number;
    downloadRate: number;
    uploadTotal: number;
    downloadTotal: number;
}

const NetworkStatCard: FC<NetworkStatCardProps> = ({
    uploadRate,
    downloadRate,
    uploadTotal,
    downloadTotal
}) => {
    return (
        <div className={cn(
            "relative overflow-hidden rounded-xl border p-5",
            'dark:border-blue-500/30 dark:bg-blue-500/5 dark:text-blue-400',
            'bg-white/80 backdrop-blur-md border-slate-200 shadow-sm',
        )}>
            <div className="absolute -right-4 -bottom-4 opacity-10 rotate-[-15deg]">
                <Network className="w-16 sm:w-24 h-16 sm:h-24"/>
            </div>
            <div className="relative z-10 flex justify-between items-start">
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold font-mono uppercase tracking-widest opacity-70 mb-3">网络统计</div>
                    <div className="space-y-0.5 text-xs sm:text-xs font-mono">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <ArrowUp className="w-3 h-3 dark:text-blue-400 text-blue-600 flex-shrink-0"/>
                            <span className="dark:text-cyan-300 truncate">{formatSpeed(uploadRate)}</span>
                            <span className="dark:text-cyan-500 text-gray hidden sm:inline">
                                ({formatBytes(uploadTotal)})
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <ArrowDown className="w-3 h-3 dark:text-emerald-400 text-green-600 flex-shrink-0"/>
                            <span className="dark:text-cyan-300 truncate">{formatSpeed(downloadRate)}</span>
                            <span className="dark:text-cyan-500 text-gray-700 hidden sm:inline">
                                ({formatBytes(downloadTotal)})
                            </span>
                        </div>
                    </div>
                </div>
                <div className="p-3">
                    <Network className="w-6 h-6"/>
                </div>
            </div>
        </div>
    );
};

export default NetworkStatCard;
