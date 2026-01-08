interface MobileLegendItem {
    key: string;
    label: string;
    color: string;
}

interface MobileLegendProps {
    items: MobileLegendItem[];
    show?: boolean;
}

/**
 * 移动端图表图例组件
 * 在移动端显示自定义样式的图表图例
 */
export const MobileLegend = ({items, show = true}: MobileLegendProps) => {
    // 不显示或项目少于 2 个时不渲染
    if (!show || items.length < 2) {
        return null;
    }

    return (
        <div className="mt-3 rounded-lg border border-cyan-900/40 bg-black/20 px-3 py-2">
            <div className="flex max-h-24 flex-wrap gap-x-4 gap-y-2 overflow-y-auto pr-1">
                {items.map((item) => (
                    <div key={item.key}
                         className="flex items-center gap-2 text-xs font-mono text-cyan-300">
                        <span className="h-2.5 w-2.5 rounded-full"
                              style={{backgroundColor: item.color}}/>
                        <span className="truncate">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
