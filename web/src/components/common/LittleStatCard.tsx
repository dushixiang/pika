// 统计卡片组件
const LittleStatCard = ({
                      label,
                      value,
                  }: {
    label: string;
    value: string | number;
    sublabel?: string;
}) => (
    <div
        key={label}
        className="rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-cyan-900/50 p-4 text-left hover:border-slate-300 dark:hover:border-cyan-700/50 transition"
    >
        <p className="text-sm uppercase tracking-[0.3em] text-gray-700 dark:text-cyan-500 font-mono font-bold">{label}</p>
        <p className="mt-2 text-base font-semibold text-slate-800 dark:text-cyan-100">{value}</p>
    </div>
);

export default LittleStatCard;