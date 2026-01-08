import dayjs from 'dayjs';
import {cn} from '@/lib/utils';

type CustomTooltipProps = {
    active?: boolean;
    payload?: Array<{
        name?: string;
        value?: number;
        color?: string;
        dataKey?: string;
        payload?: {
            timestamp?: number | string;
            [key: string]: unknown;
        };
    }>;
    label?: string | number;
    variant?: 'light' | 'dark';
    unit?: string;
};

export const CustomTooltip = ({active, payload, label, variant = 'light', unit = '%'}: CustomTooltipProps) => {
    if (!active || !payload || payload.length === 0) {
        return null;
    }

    const isDark = variant === 'dark';

    // 从 payload 中获取完整的时间戳信息（如果有的话）
    const fullTimestamp = payload[0]?.payload?.timestamp;
    const displayLabel = fullTimestamp
        ? dayjs(fullTimestamp).format(isDark ? 'YYYY-MM-DD HH:mm:ss' : 'MM-DD HH:mm')
        : label;

    return (
        <div className={cn(
            "rounded-md border px-3 py-2 text-xs shadow-xl",
            isDark
                ? "border-cyan-700/50 bg-[#0a0b10]/95 backdrop-blur-sm"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg"
        )}>
            <p className={cn(
                "font-semibold",
                isDark
                    ? "font-mono text-cyan-300 text-xs tracking-wider uppercase"
                    : "text-slate-700 dark:text-white mb-2"
            )}>
                {displayLabel}
            </p>
            <div className={cn(
                isDark ? "mt-1 space-y-1" : "space-y-1"
            )}>
                {payload.map((entry, index) => {
                    if (!entry) {
                        return null;
                    }

                    const dotColor = entry.color ?? '#6366f1';
                    const title = entry.name ?? entry.dataKey ?? `系列 ${index + 1}`;
                    const value = typeof entry.value === 'number'
                        ? Number.isFinite(entry.value)
                            ? entry.value.toFixed(2)
                            : '-'
                        : entry.value;

                    return (
                        <p key={`${entry.dataKey ?? index}`} className={cn(
                            "flex items-center gap-2",
                            isDark ? "text-cyan-500" : "text-xs"
                        )}>
                            <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{backgroundColor: dotColor}}
                            />
                            <span className={isDark ? "" : "text-slate-600 dark:text-slate-400"}>
                                {title}: <span className={cn(
                                isDark ? "" : "font-semibold text-slate-900 dark:text-white"
                            )}>{value}{unit}</span>
                            </span>
                        </p>
                    );
                })}
            </div>
        </div>
    );
};
