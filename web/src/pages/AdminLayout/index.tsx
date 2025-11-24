import {type JSX, useEffect, useMemo, useState} from 'react';
import {Outlet, useLocation, useNavigate} from 'react-router-dom';
import type {MenuProps} from 'antd';
import {App, Avatar, Button, Dropdown, Space} from 'antd';
import {Activity, BookOpen, Eye, Key, LogOut, Server, Settings, User as UserIcon} from 'lucide-react';
import {logout} from '../../api/auth';
import {getServerVersion} from '../../api/agent';
import type {User} from '../../types';
import {cn} from '../../lib/utils';

interface NavItem {
    key: string;
    label: string;
    path: string;
    icon: JSX.Element;
}

const SIDEBAR_WIDTH = 240;
const HEADER_HEIGHT = 56;

const AdminLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const {message: messageApi, modal} = App.useApp();
    const [userInfo, setUserInfo] = useState<User | null>(null);
    const [version, setVersion] = useState<string>('');

    const menuItems: NavItem[] = useMemo(
        () => [
            {
                key: 'agents',
                label: '探针管理',
                path: '/admin/agents',
                icon: <Server className="h-4 w-4" strokeWidth={2}/>,
            },
            {
                key: 'api-keys',
                label: 'API密钥',
                path: '/admin/api-keys',
                icon: <Key className="h-4 w-4" strokeWidth={2}/>,
            },
            {
                key: 'monitors',
                label: '服务监控',
                path: '/admin/monitors',
                icon: <Activity className="h-4 w-4" strokeWidth={2}/>,
            },
            {
                key: 'settings',
                label: '系统设置',
                path: '/admin/settings',
                icon: <Settings className="h-4 w-4" strokeWidth={2}/>,
            },
        ],
        [],
    );

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userInfoStr = localStorage.getItem('userInfo');

        if (!token || !userInfoStr) {
            navigate('/login');
            return;
        }

        setUserInfo(JSON.parse(userInfoStr));

        // 获取服务端版本信息
        getServerVersion()
            .then((res) => {
                setVersion(res.data.version);
            })
            .catch((err) => {
                console.error('获取版本信息失败:', err);
            });
    }, [navigate, location]);

    const handleLogout = () => {
        modal.confirm({
            title: '确认退出',
            content: '确定要退出登录吗？',
            onOk: async () => {
                try {
                    await logout();
                } finally {
                    localStorage.removeItem('token');
                    localStorage.removeItem('userInfo');
                    messageApi.success('已退出登录');
                    navigate('/login');
                }
            },
        });
    };

    const userMenuItems: MenuProps['items'] = [
        {
            key: 'logout',
            icon: <LogOut size={16} strokeWidth={2}/>,
            label: '退出登录',
            onClick: handleLogout,
        },
    ];

    const handleNavigate = (item: NavItem) => {
        navigate(item.path);
    };

    return (
        <div className="min-h-screen bg-white">
            {/* 顶部导航栏 */}
            <header
                className="fixed top-0 left-0 right-0 z-[300] h-14 border-b border-white/20 bg-[#060b16]/95 backdrop-blur">
                <div className="flex h-full items-center justify-between px-4">
                    <div className="flex items-center gap-3 text-white">
                        <div className="flex items-center justify-center">
                            <img src="/logo.png" alt="Pika" className="h-10 w-10"/>
                        </div>
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">Pika Monitor</p>
                            <p className="text-sm font-semibold">控制台</p>
                        </div>
                    </div>

                    <Space size={8} className="flex h-full items-center">
                        <Button
                            type="text"
                            icon={<Eye className="h-4 w-4" strokeWidth={2}/>}
                            onClick={() => window.open('/', '_blank')}
                            className="hidden !h-9 !items-center !rounded-full !px-3 !text-xs !text-white/80 hover:!bg-white/10 sm:!inline-flex"
                        >
                            公共页面
                        </Button>
                        <Button
                            type="text"
                            icon={<BookOpen className="h-4 w-4" strokeWidth={2} />}
                            onClick={() => navigate('/admin/agents-install')}
                            className="!h-9 !items-center !rounded-full !px-3 !text-xs !text-white hover:!bg-blue-500/10"
                        >
                            部署指南
                        </Button>
                        <Dropdown menu={{items: userMenuItems}} placement="bottomRight" trigger={['click']}>
                            <button
                                type="button"
                                className="flex cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-left text-white transition-colors hover:border-white/40"
                            >
                                <Avatar
                                    size={24}
                                    icon={<UserIcon className="h-3.5 w-3.5" strokeWidth={2}/>}
                                    className="!bg-white/20"
                                />
                                <span className="text-xs font-medium">
                                    {userInfo?.username || '访客'}
                                </span>
                            </button>
                        </Dropdown>
                    </Space>
                </div>
            </header>

            {/* 侧边栏 */}
            <aside
                className="fixed left-0 z-[200] hidden h-screen overflow-hidden border-r border-white/60 bg-white/90 shadow-sm backdrop-blur lg:block"
                style={{
                    width: SIDEBAR_WIDTH,
                    paddingTop: HEADER_HEIGHT,
                }}
            >
                <div className="flex h-full flex-col">
                    <div className="px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-gray-400">导航</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">管理面板</p>
                    </div>
                    {/* 菜单区域 */}
                    <nav className="flex-1 overflow-y-auto px-3 pb-6">
                        <div className="space-y-1">
                            {menuItems.map((item) => {
                                const isActive = location.pathname.startsWith(item.path);
                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => handleNavigate(item)}
                                        className={cn(
                                            'group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm transition-all cursor-pointer',
                                            isActive
                                                ? 'bg-gradient-to-r from-blue-500/10 to-blue-500/5 text-blue-600 shadow-sm'
                                                : 'text-gray-600 hover:bg-gray-100'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'flex h-8 w-8 items-center justify-center rounded-xl bg-white text-gray-500 shadow-sm',
                                                isActive && 'bg-blue-600 text-white'
                                            )}
                                        >
                                            {item.icon}
                                        </span>
                                        <span className="truncate font-medium">{item.label}</span>
                                        {isActive &&
                                            <span className="ml-auto text-[10px] uppercase text-blue-500">当前</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </nav>

                    {/* 版本信息 */}
                    {version && (
                        <div className="border-t border-gray-100 px-4 py-4">
                            <div className="rounded-2xl bg-gray-50/90 p-3 shadow-inner">
                                <p className="text-[11px] uppercase tracking-[0.25em] text-gray-400">版本信息</p>
                                <div className="mt-2 flex items-end justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">{version}</p>
                                        <p className="text-[11px] text-gray-500 uppercase tracking-[0.1em]">Pika
                                            Monitor</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* 主内容区 */}
            <div className="flex flex-col bg-white"
                 style={{paddingTop: HEADER_HEIGHT, minHeight: `calc(100vh - ${HEADER_HEIGHT}px)`}}>
                {/* 内容区域 */}
                <main className="flex-grow bg-white pb-20 pt-5 lg:ml-[240px] lg:pb-10">
                    <div className="w-full px-4 pb-4 lg:px-8">
                        <Outlet/>
                    </div>
                </main>
            </div>

            {/* 移动端底部导航栏 */}
            <nav
                className="fixed bottom-0 left-0 right-0 z-[300] border-t border-gray-200 bg-white/95 backdrop-blur lg:hidden">
                <div className="grid h-16 grid-cols-5">
                    {menuItems.map((item) => {
                        const isActive = location.pathname.startsWith(item.path);
                        return (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => handleNavigate(item)}
                                className={cn(
                                    'flex flex-col items-center justify-center gap-1 text-xs font-medium',
                                    isActive ? 'text-blue-600' : 'text-gray-500'
                                )}
                            >
                                <span
                                    className={cn('rounded-full p-2', isActive ? 'bg-blue-50 text-blue-600' : 'text-current')}>
                                    {item.icon}
                                </span>
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
};

export default AdminLayout;
