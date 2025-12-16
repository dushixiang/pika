import * as Tooltip from '@radix-ui/react-tooltip';

// 紧凑型资源条组件
const CompactResourceBar = ({value, label, subtext, icon: Icon, color = "bg-cyan-500"}) => {
    const isCritical = value > 90;
    const isWarning = value > 75;

    // 颜色定义 (Hex codes for precise control)
    let activeColor = "";
    let iconClass = "";

    if (isCritical) {
        activeColor = "#f43f5e"; // Rose
        iconClass = "text-rose-500";
    } else if (isWarning) {
        activeColor = "#f59e0b"; // Amber
        iconClass = "text-amber-500";
    } else if (color.includes("purple")) {
        activeColor = "#a855f7"; // Purple
        iconClass = "text-purple-500";
    } else if (color.includes("blue")) {
        activeColor = "#3b82f6"; // Blue
        iconClass = "text-blue-500";
    } else {
        activeColor = "#06b6d4"; // Cyan (Default)
        iconClass = "text-cyan-500";
    }

    return (
        <div>
            <Tooltip.Provider delayDuration={200}>
                <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                        <div className="flex items-center w-full h-5 gap-2 text-xs font-mono">
                            {/* Icon & Label */}
                            <div className={`flex items-center gap-2 w-10 flex-shrink-0 ${iconClass}`}>
                                <Icon className="w-3.5 h-3.5" strokeWidth={2}/>
                                <span className="text-xs font-bold tracking-wider opacity-80">{label}</span>
                            </div>

                            {/* Track Container */}
                            <div className="w-[100px] h-2 bg-[#121217] relative border border-white/5 overflow-hidden">

                                {/* Scale Marks Background (The "Ruler" effect) */}
                                <div
                                    className="absolute inset-0 w-full h-full opacity-20 pointer-events-none z-0"
                                    style={{
                                        backgroundImage: 'linear-gradient(90deg, #94a3b8 1px, transparent 1px)',
                                        backgroundSize: '10% 100%'
                                    }}
                                ></div>

                                {/* Active Bar with Industrial Stripes */}
                                <div
                                    className="h-full relative transition-all duration-500 ease-out z-10"
                                    style={{
                                        width: `${Math.min(value, 100)}%`,
                                        backgroundColor: activeColor,
                                        // 45-degree angled stripes pattern
                                        backgroundImage: 'linear-gradient(45deg,rgba(0,0,0,.2) 25%,transparent 25%,transparent 50%,rgba(0,0,0,.2) 50%,rgba(0,0,0,.2) 75%,transparent 75%,transparent)',
                                        backgroundSize: '4px 4px'
                                    }}
                                >
                                    {/* Leading Edge Laser Line */}
                                    <div
                                        className="absolute right-0 top-0 bottom-0 w-[1.5px] bg-white shadow-[0_0_8px_white]"></div>
                                </div>
                            </div>
                            <div
                                className={`w-10 font-medium text-xs cursor-pointer ${isCritical ? 'text-rose-400' : 'text-slate-200'}`}>
                                {value.toFixed(1)}%
                            </div>
                        </div>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                        <Tooltip.Content
                            className="px-2 py-1 bg-slate-800/95 text-slate-200 text-xs rounded border border-white/10 whitespace-nowrap shadow-lg z-50 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
                            sideOffset={8}
                            side="top"
                        >
                            {subtext}
                            <Tooltip.Arrow className="fill-slate-800/95"/>
                        </Tooltip.Content>
                    </Tooltip.Portal>
                </Tooltip.Root>
            </Tooltip.Provider>
        </div>
    );
};

export default CompactResourceBar;
