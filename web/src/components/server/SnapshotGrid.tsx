import type {ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import {cn} from '@/lib/utils';

type AccentVariant = 'blue' | 'emerald' | 'purple' | 'amber';

export type SnapshotCardData = {
    key: string;
    icon: LucideIcon;
    title: string;
    usagePercent: string;
    accent: AccentVariant;
    metrics: Array<{ label: string; value: ReactNode }>;
};

const accentThemes: Record<AccentVariant, { icon: string; badge: string; highlight: string }> = {
    blue: {
        icon: 'text-blue-400',
        badge: 'text-blue-400',
        highlight: 'text-blue-400',
    },
    emerald: {
        icon: 'text-emerald-400',
        badge: 'text-emerald-400',
        highlight: 'text-emerald-400',
    },
    purple: {
        icon: 'text-purple-400',
        badge: 'text-purple-400',
        highlight: 'text-purple-400',
    },
    amber: {
        icon: 'text-amber-400',
        badge: 'text-amber-400',
        highlight: 'text-amber-400',
    },
};

interface SnapshotGridProps {
    cards: SnapshotCardData[];
}

export const SnapshotGrid = ({cards}: SnapshotGridProps) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
            const theme = accentThemes[card.accent];
            return (
                <div
                    key={card.key}
                    className="rounded-xl border border-slate-200 dark:border-cyan-900/50 bg-slate-50 dark:bg-black/40 p-4 transition hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-cyan-700/50"
                >
                    <div className="mb-3 flex items-start justify-between">
                        <div className="flex items-center gap-2">
                            <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-gray-200 dark:bg-cyan-500/10", theme.icon)}>
                                <card.icon className="h-4 w-4"/>
                            </span>
                            <p className="text-xs font-bold font-mono uppercase tracking-wider text-gray-700 dark:text-cyan-300">{card.title}</p>
                        </div>
                        <span className={cn("text-xl font-bold", theme.highlight)}>{card.usagePercent}</span>
                    </div>
                    <div className="space-y-2">
                        {card.metrics.map((metric) => (
                            <div key={metric.label} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600 dark:text-cyan-500 font-mono text-xs uppercase tracking-wider">{metric.label}</span>
                                <span
                                    className="ml-2 text-right font-medium text-slate-700 dark:text-cyan-200">{metric.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        })}
    </div>
);
