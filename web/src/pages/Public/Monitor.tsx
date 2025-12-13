import {Shield} from "lucide-react";
import {cn} from "@/lib/utils.ts";
import type {CertStats} from "@/types";
import {formatDate} from "@/utils/util.ts";

export const renderCert = (stats: CertStats) => {
    const hasCert = stats.certExpiryTime > 0;
    const certExpired = hasCert && stats.certDaysLeft < 0;
    const certExpiringSoon = hasCert && stats.certDaysLeft >= 0 && stats.certDaysLeft < 30;
    if (!hasCert) {
        return <span className="text-sm text-slate-400 dark:text-slate-500">-</span>
    }

    return <div className="flex items-center gap-2">
        <Shield
            className={cn(
                "h-4 w-4",
                certExpired
                    ? 'text-red-600 dark:text-red-400'
                    : certExpiringSoon
                        ? 'text-yellow-600 dark:text-yellow-500'
                        : 'text-slate-400 dark:text-slate-500'
            )}/>
        <div className="text-xs">
            <div
                className={cn(
                    "font-medium",
                    certExpired
                        ? 'text-red-700 dark:text-red-300'
                        : certExpiringSoon
                            ? 'text-yellow-700 dark:text-yellow-300'
                            : 'text-slate-700 dark:text-slate-200'
                )}>
                {formatDate(stats.certExpiryTime)}
            </div>
            <div
                className={cn(
                    certExpired
                        ? 'text-red-600 dark:text-red-400'
                        : certExpiringSoon
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-slate-500 dark:text-slate-400'
                )}>
                {certExpired ? `已过期 ${Math.abs(stats.certDaysLeft)} 天` : `剩余 ${stats.certDaysLeft} 天`}
            </div>
        </div>
    </div>
}

export const UptimeBar = ({uptime}: { uptime: number }) => {
    const percentage = Math.min(Math.max(uptime, 0), 100);
    const colorClass = percentage >= 99 ? 'bg-emerald-500' : percentage >= 95 ? 'bg-yellow-500' : 'bg-red-500';

    return (
        <div className="relative h-2 w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
            <div
                className={cn("absolute inset-y-0 left-0 transition-all duration-500", colorClass)}
                style={{width: `${percentage}%`}}
            />
        </div>
    );
};