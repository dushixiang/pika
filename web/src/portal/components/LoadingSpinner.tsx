import {Loader2} from 'lucide-react';
import {cn} from '@/lib/utils';

interface LoadingSpinnerProps {
    variant?: 'light' | 'dark';
    message?: string;
}

export const LoadingSpinner = ({variant = 'light', message}: LoadingSpinnerProps) => {
    const isDark = variant === 'dark';

    return (
        <div className={cn(
            "flex min-h-screen items-center justify-center",
            isDark ? "bg-[#05050a]" : "bg-slate-50 dark:bg-slate-900"
        )}>
            <div className="flex flex-col items-center gap-3">
                <Loader2 className={cn(
                    "h-8 w-8 animate-spin",
                    isDark ? "text-cyan-500" : "text-blue-500"
                )}/>
                <p className={cn(
                    "text-sm font-mono",
                    isDark ? "text-cyan-500" : "text-slate-600 dark:text-slate-400"
                )}>
                    {message || (isDark ? '数据加载中...' : '数据加载中，请稍候...')}
                </p>
            </div>
        </div>
    );
};
