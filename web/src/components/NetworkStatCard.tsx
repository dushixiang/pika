import type {FC} from 'react';
import {ArrowDown, ArrowUp, Network} from 'lucide-react';
import {formatBytes, formatSpeed} from '@/utils/util';

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
        <div className="relative overflow-hidden rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 sm:p-5 text-blue-400">
            <div className="absolute -right-4 -bottom-4 opacity-10 rotate-[-15deg]">
                <Network className="w-16 sm:w-24 h-16 sm:h-24"/>
            </div>
            <div className="relative z-10 flex justify-between items-start">
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-widest opacity-70 mb-1">
                        网络统计
                    </div>
                    <div className="space-y-1 text-[10px] sm:text-xs font-mono">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <ArrowUp className="w-3 h-3 text-blue-400 flex-shrink-0"/>
                            <span className="text-cyan-300 truncate">{formatSpeed(uploadRate)}</span>
                            <span className="text-cyan-600 text-[9px] sm:text-[10px] hidden sm:inline">
                                ({formatBytes(uploadTotal)})
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <ArrowDown className="w-3 h-3 text-emerald-400 flex-shrink-0"/>
                            <span className="text-cyan-300 truncate">{formatSpeed(downloadRate)}</span>
                            <span className="text-cyan-600 text-[9px] sm:text-[10px] hidden sm:inline">
                                ({formatBytes(downloadTotal)})
                            </span>
                        </div>
                    </div>
                </div>
                <div className="p-2 rounded-lg bg-black/20 backdrop-blur-sm border border-white/5 flex-shrink-0">
                    <Network className="w-4 sm:w-5 h-4 sm:h-5"/>
                </div>
            </div>
        </div>
    );
};

export default NetworkStatCard;
