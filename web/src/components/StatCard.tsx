// 统计卡片组件
const StatCard = ({title, value, icon: Icon, color}: {
    title: string;
    value: any;
    icon: any;
    color: string;
}) => {
    const colorMap: any = {
        gray: 'text-slate-400 border-slate-500/30 bg-slate-500/5',
        emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
        rose: 'text-rose-400 border-rose-500/30 bg-rose-500/5',
        blue: 'text-blue-400 border-blue-500/30 bg-blue-500/5'
    };
    const style = colorMap[color] || colorMap.gray;

    return (
        <div
            className={`relative overflow-hidden rounded-xl border p-5 ${style} ${color === 'rose' && value > 0 ? 'animate-pulse bg-rose-500/10' : ''}`}>
            <div className="absolute -right-4 -bottom-4 opacity-10 rotate-[-15deg]">
                <Icon className="w-24 h-24"/>
            </div>
            <div className="relative z-10 flex justify-between items-start">
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest opacity-70 mb-1">{title}</div>
                    <div className="text-3xl font-black tracking-tight">{value}</div>
                </div>
                <div className="p-2 rounded-lg bg-black/20 backdrop-blur-sm border border-white/5">
                    <Icon className="w-5 h-5"/>
                </div>
            </div>
        </div>
    );
};

export default StatCard;