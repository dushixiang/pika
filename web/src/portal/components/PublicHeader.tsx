import {useEffect, useState} from 'react';
import {Activity, LogIn, Menu, Moon, ServerIcon, Settings, Sun, X} from 'lucide-react';
import {Link, useLocation} from "react-router-dom";
import {useTheme} from '../contexts/ThemeContext';
import {getCurrentUser} from "@/api/auth.ts";

const PublicHeader = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const {appliedTheme, setTheme} = useTheme();
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

    if (currentPath.startsWith('/monitors')) {
        activeTab = 'monitors';
    }

    let systemName = window.SystemConfig?.SystemNameEn;

    let leftName = '';
    let rightName = '';

    if (systemName) {
        // 优先在空格处分割
        const spaceIndex = systemName.indexOf(' ');
        if (spaceIndex > 0) {
            leftName = systemName.substring(0, spaceIndex);
            rightName = systemName.substring(spaceIndex); // 保留空格
        } else {
            // 如果没有空格，从中间分割
            const mid = Math.floor(systemName.length / 2);
            leftName = systemName.substring(0, mid);
            rightName = systemName.substring(mid);
        }
    }

    return (
        <>
            <header
                className="border-b border-slate-200 dark:border-cyan-900/50 bg-white/80 dark:bg-[#05050a]/80 backdrop-blur-xl fixed top-0 left-0 right-0 z-40 transition-colors duration-300">
                <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <Link to={'/'}>
                            <div className="flex items-center gap-3 group cursor-pointer">
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
                                    <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 dark:from-cyan-400 dark:via-blue-400 dark:to-purple-400 uppercase italic">
                                        {leftName}<span className="text-slate-800 dark:text-white">{rightName}</span>
                                    </h1>
                                    <p className="text-xs text-slate-500 dark:text-cyan-500 font-mono tracking-[0.3em] uppercase">
                                        {window.SystemConfig?.SystemNameZh}
                                    </p>
                                </div>
                            </div>
                        </Link>

                        {/* HUD Navigation - Desktop Only */}
                        <div className="hidden md:flex items-center gap-8">
                            {[
                                {id: 'servers', icon: ServerIcon, label: '设备监控', to: '/'},
                                {id: 'monitors', icon: Activity, label: '服务监控', to: '/monitors'}
                            ].map(tab => (
                                <Link to={tab.to} key={tab.id}>
                                    <button
                                        className={`
                          relative group flex items-center gap-2 py-2 text-xs font-bold tracking-widest transition-colors cursor-pointer font-mono uppercase
                          ${activeTab === tab.id ? 'text-blue-600 dark:text-cyan-500' : 'text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-cyan-200'}
                        `}
                                    >
                                        <tab.icon
                                            className={`w-4 h-4 ${activeTab === tab.id ? 'text-blue-600 dark:text-cyan-500' : 'text-slate-400 dark:text-slate-600 group-hover:text-blue-500 dark:group-hover:text-cyan-200'}`}/>
                                        {tab.label}

                                        {/* Active Indicator (Underline Glow) */}
                                        <span
                                            className={`absolute -bottom-1 left-0 w-full h-[2px] bg-blue-600 dark:bg-cyan-500 shadow-[0_0_10px_rgba(37,99,235,0.8)] dark:shadow-[0_0_10px_rgba(34,211,238,0.8)] transition-transform duration-300 origin-left ${activeTab === tab.id ? 'scale-x-100' : 'scale-x-0'}`}></span>
                                    </button>
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Desktop Right Section */}
                    <div className="hidden md:flex items-center gap-2">
                        <div className="hidden lg:flex flex-col items-end">
                            <span
                                className="text-xs font-mono text-slate-800 dark:text-cyan-500 font-bold">{currentTime.toLocaleTimeString()}</span>
                            <span
                                className="text-xs text-slate-500 dark:text-cyan-500 font-mono tracking-widest">{currentTime.toLocaleDateString()}</span>
                        </div>
                        <div className="h-6 w-[1px] bg-slate-300 dark:bg-cyan-900/50 hidden lg:block"></div>

                        {/* 主题切换按钮 - Desktop */}
                        <button
                            onClick={() => setTheme(appliedTheme === 'dark' ? 'light' : 'dark')}
                            className="flex items-center gap-2 px-3 py-2 cursor-pointer rounded transition-all text-slate-600 dark:text-cyan-400 hover:bg-slate-100 dark:hover:bg-cyan-500/10"
                            title={appliedTheme === 'dark' ? '切换到浅色模式' : '切换到暗黑模式'}
                        >
                            {appliedTheme === 'dark' ? (
                                <Sun className="w-4 h-4"/>
                            ) : (
                                <Moon className="w-4 h-4"/>
                            )}
                        </button>

                        {/* 登录/管理后台按钮 - Desktop */}
                        {isLoggedIn ? (
                            <a
                                href="/admin"
                                className="flex items-center gap-2 px-4 py-2 bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-500 rounded transition-all text-xs font-bold tracking-wider uppercase group"
                                target="_blank"
                            >
                                <Settings className="w-3 h-3 group-hover:rotate-90 transition-transform"/>
                                <span>Admin</span>
                            </a>
                        ) : (
                            <a
                                href="/login"
                                className="flex items-center gap-2 px-4 py-2 bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-500 rounded transition-all text-xs font-bold tracking-wider uppercase group"
                                target="_blank"
                            >
                                <LogIn className="w-3 h-3"/>
                                <span>Login</span>
                            </a>
                        )}
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 text-cyan-500 hover:bg-cyan-500/10 rounded transition-colors"
                        aria-label="Toggle menu"
                    >
                        {mobileMenuOpen ? (
                            <X className="w-6 h-6"/>
                        ) : (
                            <Menu className="w-6 h-6"/>
                        )}
                    </button>
                </div>
                <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent"></div>
            </header>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 top-20 bg-white/95 dark:bg-[#05050a]/95 backdrop-blur-xl z-30 animate-in slide-in-from-top">
                    <div className="flex flex-col p-4 gap-4">
                        {/* Mobile Navigation */}
                        {[
                            {id: 'servers', icon: ServerIcon, label: '设备监控', to: '/'},
                            {id: 'monitors', icon: Activity, label: '服务监控', to: '/monitors'}
                        ].map(tab => (
                            <Link
                                to={tab.to}
                                key={tab.id}
                                onClick={() => setMobileMenuOpen(false)}
                                className={`
                                    flex items-center gap-3 p-4 rounded-lg border transition-all
                                    ${activeTab === tab.id
                                    ? 'bg-blue-50 dark:bg-cyan-500/20 border-blue-500 dark:border-cyan-500/80 text-blue-600 dark:text-cyan-500'
                                    : 'bg-slate-50/50 dark:bg-cyan-500/5 border-slate-200 dark:border-cyan-500/30 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-cyan-500/10 hover:border-blue-300 dark:hover:border-cyan-500/50'
                                }
                                `}
                            >
                                <tab.icon className="w-5 h-5"/>
                                <span className="font-bold tracking-wider">{tab.label}</span>
                            </Link>
                        ))}

                        {/* Divider */}
                        <div className="h-[1px] bg-slate-200 dark:bg-cyan-900/50 my-2"></div>

                        {/* Mobile Theme Toggle Button */}
                        <button
                            onClick={() => setTheme(appliedTheme === 'dark' ? 'light' : 'dark')}
                            className="w-full flex items-center justify-center gap-3 p-4 bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-500 rounded-lg transition-all font-bold tracking-wider uppercase"
                        >
                            {appliedTheme === 'dark' ? (
                                <>
                                    <Sun className="w-5 h-5"/>
                                    <span>切换到浅色模式</span>
                                </>
                            ) : (
                                <>
                                    <Moon className="w-5 h-5"/>
                                    <span>切换到暗黑模式</span>
                                </>
                            )}
                        </button>

                        {/* Mobile Login/Admin Button */}
                        {isLoggedIn ? (
                            <a
                                href="/admin"
                                target="_blank"
                                className="flex items-center justify-center gap-3 p-4 bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-500 rounded-lg transition-all font-bold tracking-wider uppercase"
                            >
                                <Settings className="w-5 h-5"/>
                                <span>管理后台</span>
                            </a>
                        ) : (
                            <a
                                href="/login"
                                target="_blank"
                                className="flex items-center justify-center gap-3 p-4 bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20 text-cyan-500 rounded-lg transition-all font-bold tracking-wider uppercase"
                            >
                                <LogIn className="w-5 h-5"/>
                                <span>登录</span>
                            </a>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default PublicHeader;
