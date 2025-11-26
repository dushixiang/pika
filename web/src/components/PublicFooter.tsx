import {Heart} from 'lucide-react';

const PublicFooter = () => {
    const currentYear = new Date().getFullYear();
    const icpCode = window.SystemConfig?.ICPCode || '';

    return (
        <footer className="border-t border-slate-100 bg-gradient-to-b from-white to-slate-50">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* 底部版权信息 */}
                <div className="py-6">
                    <div
                        className="flex flex-col items-center justify-between gap-3 text-xs text-slate-500 sm:flex-row">
                        <div className="flex items-center gap-1">
                            <span>© {currentYear}</span>
                            {/* GitHub 链接 */}
                            <a
                                href="https://github.com/dushixiang/pika"
                                target="_blank"
                                rel="noopener noreferrer"
                                title="查看 GitHub 仓库"
                            >
                                <div className={' text-slate-500 underline'}>Pika Monitor</div>
                                {/*<img src={GithubSvg} className="h-4 w-4" alt="GitHub"/>*/}
                            </a>
                            <span className="text-slate-300">·</span>
                            <span>保持洞察，稳定运行</span>
                            {/* ICP 备案号 */}
                            {icpCode && (
                                <>
                                    <span className="text-slate-300">·</span>
                                    <a
                                        href="https://beian.miit.gov.cn"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-slate-500 hover:text-slate-700 transition-colors"
                                    >
                                        {icpCode}
                                    </a>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <span>用</span>
                            <Heart className="h-3 w-3 fill-red-500 text-red-500"/>
                            <span>构建</span>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default PublicFooter;
