import {Heart, Github} from 'lucide-react';

const PublicFooter = () => {
    const currentYear = new Date().getFullYear();
    const icpCode = window.SystemConfig?.ICPCode || '';

    return (
        <footer className="border-t border-cyan-900/50 bg-[#05050a]">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="py-6">
                    <div className="flex flex-col items-center justify-between gap-4 text-xs text-cyan-600 sm:flex-row font-mono">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <span className="text-cyan-500">© {currentYear}</span>
                            <span className="text-cyan-900">|</span>
                            {/* GitHub 链接 */}
                            <a
                                href="https://github.com/dushixiang/pika"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition-colors group"
                                title="查看 GitHub 仓库"
                            >
                                <Github className="h-3 w-3 group-hover:scale-110 transition-transform"/>
                                <span className="underline decoration-cyan-700 underline-offset-2">Pika Monitor</span>
                            </a>
                            <span className="text-cyan-900">|</span>
                            <span className="text-cyan-600/80 tracking-wider">保持洞察 · 稳定运行</span>
                            {/* ICP 备案号 */}
                            {icpCode && (
                                <>
                                    <span className="text-cyan-900">|</span>
                                    <a
                                        href="https://beian.miit.gov.cn"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cyan-600/80 hover:text-cyan-400 transition-colors"
                                    >
                                        {icpCode}
                                    </a>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 text-cyan-500">
                            <span>用</span>
                            <Heart className="h-3 w-3 fill-rose-500 text-rose-500 animate-pulse"/>
                            <span>构建</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"></div>
        </footer>
    );
};

export default PublicFooter;
