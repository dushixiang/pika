import type {AggregationOptionValue} from '@/constants/metrics';
import {cn} from '@/lib/utils';

export interface AggregationOption {
    label: string;
    value: AggregationOptionValue;
}

interface AggregationSelectorProps {
    value: AggregationOptionValue;
    onChange: (value: AggregationOptionValue) => void;
    options: readonly AggregationOption[];
    variant?: 'light' | 'dark';
}

export const AggregationSelector = ({
                                        value,
                                        onChange,
                                        options,
                                        variant = 'light',
                                    }: AggregationSelectorProps) => {
    const isDark = variant === 'dark';

    return (
        <div className="flex flex-wrap items-center gap-2">
            {options.map((option) => {
                const isActive = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
                            isDark && "font-bold font-mono tracking-wider uppercase",
                            isActive
                                ? isDark
                                    ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                                    : 'border-blue-500 dark:border-blue-500 bg-blue-500 text-white shadow-sm'
                                : isDark
                                    ? 'border-cyan-900/30 bg-black/30 text-cyan-500 hover:text-cyan-500 hover:border-cyan-700'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400'
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
};
