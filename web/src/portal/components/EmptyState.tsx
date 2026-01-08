import {AlertCircle, Server} from 'lucide-react';
import {cn} from '@/lib/utils';

interface EmptyStateProps {
    variant?: 'light' | 'dark';
    message?: string;
    showBackButton?: boolean;
}

export const EmptyState = ({variant = 'light', message, showBackButton = false}: EmptyStateProps) => {
    const isDark = variant === 'dark';
    const Icon = isDark ? Server : AlertCircle;
    const defaultMessage = isDark ? '服务器不存在或已离线' : '监控数据不存在';

    return (
        <div className={cn(
            "flex min-h-screen items-center justify-center",
            isDark ? "bg-[#05050a]" : "bg-slate-50 dark:bg-slate-900"
        )}>
            <div className="flex flex-col items-center gap-3 text-center">
                <div className={cn(
                    "flex items-center justify-center",
                    isDark
                        ? "h-16 w-16 rounded-lg bg-cyan-500/10 text-cyan-500"
                        : "h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                )}>
                    <Icon className="h-8 w-8"/>
                </div>
                <p className={cn(
                    "text-sm font-mono",
                    isDark ? "text-cyan-500" : "text-slate-600 dark:text-slate-400"
                )}>
                    {message || defaultMessage}
                </p>
                {showBackButton && !isDark && (
                    <button
                        onClick={() => window.history.back()}
                        className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        返回监控列表
                    </button>
                )}
            </div>
        </div>
    );
};
