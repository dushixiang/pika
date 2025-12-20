import React from 'react';
import {cn} from "@/lib/utils.ts";

interface Props {
    className?: string
    children: React.ReactNode;
    animation?: boolean
    hover?: boolean
}

const CyberCard = ({className, children, animation, hover}: Props) => {
    return (
        <div
            className={cn(
                "group bg-white/90 dark:bg-[#0f1016]/80 backdrop-blur-md border border-slate-200 dark:border-cyan-500/20 shadow-sm dark:shadow-[0_0_15px_rgba(6,182,212,0.05)] transition-all duration-300 cursor-pointer overflow-hidden relative rounded-xl dark:rounded-none",
                hover && "hover:border-slate-300 dark:hover:border-cyan-500/50 hover:bg-white dark:hover:bg-[#0f1016]/90"
            )}>
            {/* 装饰性边框 - 仅在暗色模式下显示 */}
            <div
                className="hidden dark:block absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-500/30 group-hover:border-cyan-400 transition-colors"></div>
            <div
                className="hidden dark:block absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-500/30 group-hover:border-cyan-400 transition-colors"></div>
            <div
                className="hidden dark:block absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-500/30 group-hover:border-cyan-400 transition-colors"></div>
            <div
                className="hidden dark:block absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-cyan-500/30 group-hover:border-cyan-400 transition-colors"></div>
            {animation &&
                <div
                    className="hidden dark:block absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent -translate-y-full group-hover:translate-y-full transition-transform duration-1000 ease-in-out pointer-events-none"/>
            }

            <div className={cn("relative z-10 p-4", className)}>
                {children}
            </div>
        </div>
    );
};

export default CyberCard;