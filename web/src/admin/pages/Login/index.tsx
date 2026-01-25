import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, ConfigProvider, Form, Input, theme } from 'antd';
import { GithubOutlined, GlobalOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { Moon, Sun } from 'lucide-react';
import { getAuthConfig, getGitHubAuthURL, getOIDCAuthURL, login } from '@/api/auth.ts';
import type { LoginRequest } from '@/types';
import { useTheme } from '@/portal/contexts/ThemeContext';
import { flushSync } from 'react-dom';

const Login = () => {
    const [loading, setLoading] = useState(false);
    const [oidcEnabled, setOidcEnabled] = useState(false);
    const [githubEnabled, setGithubEnabled] = useState(false);
    const [passwordEnabled, setPasswordEnabled] = useState(true);
    const [oidcLoading, setOidcLoading] = useState(false);
    const [githubLoading, setGithubLoading] = useState(false);
    const navigate = useNavigate();
    const { message: messageApi } = App.useApp();
    const { appliedTheme, setTheme } = useTheme();
    const themeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        fetchAuthConfig();
    }, []);

    const fetchAuthConfig = async () => {
        try {
            const response = await getAuthConfig();
            setOidcEnabled(response.data.oidcEnabled);
            setGithubEnabled(response.data.githubEnabled);
            setPasswordEnabled(response.data.passwordEnabled);
        } catch (error) {
            console.error('获取认证配置失败:', error);
        }
    };

    const onFinish = async (values: LoginRequest) => {
        setLoading(true);
        try {
            const response = await login(values);
            const { token, user } = response.data;
            localStorage.setItem('token', token);
            localStorage.setItem('userInfo', JSON.stringify(user));
            messageApi.success('欢迎回来');
            navigate('/admin/agents');
        } catch (error: any) {
            messageApi.error(error.response?.data?.message || '账号或密码错误');
        } finally {
            setLoading(false);
        }
    };

    const handleOIDCLogin = async () => {
        setOidcLoading(true);
        try {
            const response = await getOIDCAuthURL();
            window.location.href = response.data.authUrl;
        } catch (error: any) {
            messageApi.error('OIDC 跳转失败');
            setOidcLoading(false);
        }
    };

    const handleGitHubLogin = async () => {
        setGithubLoading(true);
        try {
            const response = await getGitHubAuthURL();
            window.location.href = response.data.authUrl;
        } catch (error: any) {
            messageApi.error('GitHub 跳转失败');
            setGithubLoading(false);
        }
    };

    // 切换主题的函数，带动画效果
    const toggleTheme = async () => {
        const newTheme = appliedTheme === 'dark' ? 'light' : 'dark';

        if (
            !themeButtonRef.current ||
            !document.startViewTransition ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            setTheme(newTheme);
            return;
        }

        await document.startViewTransition(() => {
            flushSync(() => {
                setTheme(newTheme);
            });
        }).ready;

        const {top, left, width, height} = themeButtonRef.current.getBoundingClientRect();
        const x = left + width / 2;
        const y = top + height / 2;
        const right = window.innerWidth - left;
        const bottom = window.innerHeight - top;
        const maxRadius = Math.hypot(
            Math.max(left, right),
            Math.max(top, bottom),
        );

        document.documentElement.animate(
            {
                clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${maxRadius}px at ${x}px ${y}px)`,
                ],
            },
            {
                duration: 500,
                easing: 'ease-in-out',
                pseudoElement: '::view-transition-new(root)',
            }
        );
    };

    return (
        <ConfigProvider
            theme={{
                algorithm: appliedTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
            }}
        >
            {/* 背景：浅色模式柔和灰色，暗黑模式深黑色 */}
            <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-zinc-950 px-4 transition-colors duration-300">

                {/* 主题切换按钮 - 右上角 */}
                <button
                    ref={themeButtonRef}
                    type="button"
                    onClick={toggleTheme}
                    className="fixed top-6 right-6 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all z-50 border border-slate-200 dark:border-zinc-700"
                    title={appliedTheme === 'dark' ? "切换到浅色模式" : "切换到暗黑模式"}
                >
                    {appliedTheme === 'dark' ? (
                        <Sun className="h-5 w-5" strokeWidth={2.5}/>
                    ) : (
                        <Moon className="h-5 w-5" strokeWidth={2.5}/>
                    )}
                </button>

                {/* 卡片：浅色模式纯白，暗黑模式深灰色以提供对比 */}
                <div className="w-full max-w-[400px] bg-white dark:bg-zinc-900 p-8 sm:p-10 rounded-lg border border-slate-200 dark:border-zinc-800 transition-colors duration-300">

                    {/* 头部：品牌名称 */}
                    <div className="mb-10 text-center">
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
                            {window.SystemConfig.SystemNameZh}
                        </h1>
                    </div>

                    {passwordEnabled && (
                        <Form
                            name="login"
                            layout="vertical"
                            onFinish={onFinish}
                            autoComplete="off"
                            requiredMark={false}
                        >
                            <Form.Item
                                name="username"
                                rules={[{ required: true, message: '请输入用户名' }]}
                                className="mb-4"
                            >
                                <Input
                                    prefix={<UserOutlined className="text-slate-400 dark:text-zinc-500 mr-1" />}
                                    placeholder="用户名"
                                    className="px-4 py-2.5"
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item
                                name="password"
                                rules={[{ required: true, message: '请输入密码' }]}
                                className="mb-6"
                            >
                                <Input.Password
                                    prefix={<LockOutlined className="text-slate-400 dark:text-zinc-500 mr-1" />}
                                    placeholder="密码"
                                    className="px-4 py-2.5"
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item className="mb-0">
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={loading}
                                    block
                                    size="large"
                                    className="h-11 font-medium"
                                >
                                    登 录
                                </Button>
                            </Form.Item>
                        </Form>
                    )}

                    {/* 第三方登录区域 */}
                    {(oidcEnabled || githubEnabled) && (
                        <div className="mt-8">
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-slate-200 dark:border-zinc-800" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white dark:bg-zinc-900 px-2 text-slate-400 dark:text-zinc-500">
                                        {passwordEnabled ? 'OR' : '使用第三方登录'}
                                    </span>
                                </div>
                            </div>

                            {/* 使用 Grid 布局让按钮并排 */}
                            <div className="mt-6 grid grid-cols-2 gap-3">
                                {githubEnabled && (
                                    <Button
                                        block
                                        loading={githubLoading}
                                        icon={<GithubOutlined />}
                                        onClick={handleGitHubLogin}
                                        size="large"
                                        className={`h-10 font-medium ${!oidcEnabled ? 'col-span-2' : ''}`}
                                    >
                                        GitHub
                                    </Button>
                                )}
                                {oidcEnabled && (
                                    <Button
                                        block
                                        loading={oidcLoading}
                                        icon={<GlobalOutlined />}
                                        onClick={handleOIDCLogin}
                                        size="large"
                                        className={`h-10 font-medium ${!githubEnabled ? 'col-span-2' : ''}`}
                                    >
                                        OIDC
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </ConfigProvider>
    );
};

export default Login;