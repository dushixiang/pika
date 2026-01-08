import type {ReactNode} from 'react';
import {cn} from '@/lib/utils';
import CyberCard from "@portal/components/CyberCard.tsx";

interface CardProps {
    title?: string;
    description?: string;
    action?: ReactNode;
    children: ReactNode;
    variant?: 'light' | 'dark';
}

export const Card = ({
                         title,
                         description,
                         action,
                         children,
                         variant = 'light',
                     }: CardProps) => {
    const isDark = variant === 'dark';

    return (
        <CyberCard className={'p-6'}>
            {(title || description || action) && (
                <div className={cn(
                    "flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between",
                    isDark ? "border-cyan-900/30" : "border-slate-200 dark:border-slate-700"
                )}>
                    <div>
                        {title && (
                            <h2 className={cn(
                                "text-sm font-bold",
                                isDark
                                    ? "font-mono uppercase tracking-widest text-cyan-500"
                                    : "text-lg font-semibold text-slate-900 dark:text-white"
                            )}>
                                {title}
                            </h2>
                        )}
                        {description && (
                            <p className={'text-xs text-gray-600 dark:text-cyan-500 mt-1 font-mono'}>
                                {description}
                            </p>
                        )}
                    </div>
                    {action && <div className="shrink-0">{action}</div>}
                </div>
            )}
            <div className="pt-4">{children}</div>
        </CyberCard>
    );
};
