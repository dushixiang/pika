import {useEffect, useState} from 'react';
import {Activity, Hexagon, LogIn, ServerIcon, Settings} from 'lucide-react';
import {getCurrentUser} from '../api/auth';
import {Link, useLocation} from "react-router-dom";

const PublicHeader = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    let location = useLocation();

    useEffect(() => {
        // 检查本地是否有 token
        const token = localStorage.getItem('token');
        const userInfo = localStorage.getItem('userInfo');

        if (!token || !userInfo) {
            setIsLoggedIn(false);
            return;
        }

        // 调用后端接口验证 token 是否有效
        getCurrentUser()
            .then(() => {
                setIsLoggedIn(true);
            })
            .catch(() => {
                // token 无效,清除本地存储
                localStorage.removeItem('token');
                localStorage.removeItem('userInfo');
                setIsLoggedIn(false);
            });
    }, []);

    // 时钟特效
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    // 判断导航是否激活
    const currentPath = location.pathname;

    let activeTab = 'servers';
    switch (currentPath) {
        case '/':
            activeTab = 'servers';
            break;
        case '/monitors':
            activeTab = 'monitors';
            break;
    }

    return (
        <header className="border-b border-cyan-900/50 bg-[#05050a]/80 backdrop-blur-xl sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3 group cursor-default">
                        <div className="relative">
                            <img
                                src={"/api/logo"}
                                className="h-8 w-8 sm:h-9 sm:w-9 object-contain rounded-md"
                                alt={'logo'}
                                onError={(e) => {
                                    e.currentTarget.src = '/logo.png';
                                }}
                            />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 uppercase italic">
                                {window.SystemConfig?.SystemNameZh}
                            </h1>
                            <p className="text-[10px] text-cyan-500/60 font-mono tracking-[0.3em] uppercase">
                                {window.SystemConfig?.SystemNameEn}
                            </p>
                        </div>
                    </div>

                    {/* HUD Navigation - Simplified & No Border */}
                    <div className="hidden md:flex items-center gap-8">
                        {[
                            {id: 'servers', icon: ServerIcon, label: '设备监控', to: '/'},
                            {id: 'monitors', icon: Activity, label: '服务监控', to: '/monitors'}
                        ].map(tab => (
                            <Link to={tab.to}>
                                <button
                                    key={tab.id}
                                    className={`
                      relative group flex items-center gap-2 py-2 text-xs font-bold tracking-widest transition-colors cursor-pointer
                      ${activeTab === tab.id ? 'text-cyan-400' : 'text-slate-500 hover:text-cyan-200'}
                    `}
                                >
                                    <tab.icon
                                        className={`w-4 h-4 ${activeTab === tab.id ? 'text-cyan-400' : 'text-slate-600 group-hover:text-cyan-200'}`}/>
                                    {tab.label}

                                    {/* Active Indicator (Underline Glow) */}
                                    <span
                                        className={`absolute -bottom-1 left-0 w-full h-[2px] bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.8)] transition-transform duration-300 origin-left ${activeTab === tab.id ? 'scale-x-100' : 'scale-x-0'}`}></span>
                                </button>
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden lg:flex flex-col items-end">
                        <span className="text-xs font-mono text-cyan-400">{currentTime.toLocaleTimeString()}</span>
                        <span
                            className="text-[10px] text-cyan-600 font-mono tracking-widest">{currentTime.toLocaleDateString()}</span>
                    </div>
                    <div className="h-8 w-[1px] bg-cyan-900/50 hidden lg:block"></div>

                    {/* 登录/管理后台按钮 */}
                    {isLoggedIn ? (
                        <a
                            href="/admin"
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 rounded transition-all text-xs font-bold tracking-wider uppercase group"
                            target="_blank"
                        >
                            <Settings className="w-3 h-3 group-hover:rotate-90 transition-transform"/>
                            <span>Admin</span>
                        </a>
                    ) : (
                        <a
                            href="/login"
                            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 rounded transition-all text-xs font-bold tracking-wider uppercase group"
                            target="_blank"
                        >
                            <LogIn className="w-3 h-3"/>
                            <span>Login</span>
                        </a>
                    )}
                </div>
            </div>
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
        </header>
    );
};

export default PublicHeader;
