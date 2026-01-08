import {TrendingUp} from 'lucide-react';
import {cn} from '@/lib/utils';

interface ChartPlaceholderProps {
    variant?: 'light' | 'dark';
    icon?: typeof TrendingUp;
    title?: string;
    subtitle?: string;
    heightClass?: string;
}

export const ChartPlaceholder = ({
                                     variant = 'light',
                                     icon: Icon = TrendingUp,
                                     title = '暂无数据',
                                     subtitle = '等待采集新数据后展示图表',
                                     heightClass = 'h-52',
                                 }: ChartPlaceholderProps) => {
    const isDark = variant === 'dark';

    return (
        <div className={cn(
            "flex items-center justify-center rounded-lg border border-dashed text-sm",
            isDark
                ? "border-cyan-500/30 bg-[#0a0b10]/50 text-cyan-500"
                : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400",
            heightClass
        )}>
            <div className="text-center">
                <Icon className={cn(
                    "mx-auto mb-3 h-10 w-10",
                    isDark ? "text-cyan-500/50" : "text-slate-300 dark:text-slate-600"
                )}/>
                <p className={cn(
                    isDark ? "uppercase tracking-wider font-mono" : "font-medium"
                )}>{title}</p>
                {subtitle && (
                    <p className={cn(
                        "mt-1 text-xs",
                        isDark ? "text-cyan-500" : "text-slate-400 dark:text-slate-500"
                    )}>
                        {subtitle}
                    </p>
                )}
            </div>
        </div>
    );
};
