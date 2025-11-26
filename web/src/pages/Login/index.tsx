import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {App, Button, Form, Input} from 'antd';
import {GithubOutlined, GlobalOutlined, LockOutlined, UserOutlined} from '@ant-design/icons';
// 移除不需要的图标组件，保持轻量
import {getAuthConfig, getGitHubAuthURL, getOIDCAuthURL, login} from '../../api/auth';
import type {LoginRequest} from '../../types';

const Login = () => {
    const [loading, setLoading] = useState(false);
    const [oidcEnabled, setOidcEnabled] = useState(false);
    const [githubEnabled, setGithubEnabled] = useState(false);
    const [oidcLoading, setOidcLoading] = useState(false);
    const [githubLoading, setGithubLoading] = useState(false);
    const navigate = useNavigate();
    const {message: messageApi} = App.useApp();

    useEffect(() => {
        fetchAuthConfig();
    }, []);

    const fetchAuthConfig = async () => {
        try {
            const response = await getAuthConfig();
            setOidcEnabled(response.data.oidcEnabled);
            setGithubEnabled(response.data.githubEnabled);
        } catch (error) {
            console.error('获取认证配置失败:', error);
        }
    };

    const onFinish = async (values: LoginRequest) => {
        setLoading(true);
        try {
            const response = await login(values);
            const {token, user} = response.data;
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

    return (
        // 1. 背景改为柔和的灰白色，视觉更轻盈
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">

            {/* 2. 卡片去除复杂的渐变边框，使用简单的圆角和优雅的阴影 */}
            <div className="w-full max-w-[400px] bg-white p-8 sm:p-10 rounded-2xl shadow-xl ring-1 ring-slate-900/5">

                {/* 3. 头部精简：去掉了 Badge，强调品牌名称 */}
                <div className="mb-10 text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        {window.SystemConfig.SystemNameZh}
                    </h1>
                    <p className="mt-2 text-sm text-slate-500">
                        保持洞察，稳定运行
                    </p>
                </div>

                <Form
                    name="login"
                    layout="vertical"
                    size="large"
                    onFinish={onFinish}
                    autoComplete="off"
                    requiredMark={false} // 4. 隐藏必填星号，界面更干净
                >
                    <Form.Item
                        name="username"
                        rules={[{required: true, message: '请输入用户名'}]}
                        className="mb-4"
                    >
                        <Input
                            prefix={<UserOutlined className="text-slate-400 mr-1"/>}
                            placeholder="用户名"
                            className="rounded-xl px-4 py-2.5 bg-slate-50 border-slate-200 hover:bg-white focus:bg-white transition-all"
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[{required: true, message: '请输入密码'}]}
                        className="mb-6"
                    >
                        <Input.Password
                            prefix={<LockOutlined className="text-slate-400 mr-1"/>}
                            placeholder="密码"
                            className="rounded-xl px-4 py-2.5 bg-slate-50 border-slate-200 hover:bg-white focus:bg-white transition-all"
                        />
                    </Form.Item>

                    <Form.Item className="mb-0">
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            block
                            className="h-11 rounded-xl bg-slate-900 hover:bg-slate-800 font-medium shadow-sm transition-all"
                        >
                            登 录
                        </Button>
                    </Form.Item>
                </Form>

                {/* 5. 第三方登录区域 */}
                {(oidcEnabled || githubEnabled) && (
                    <div className="mt-8">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-slate-200"/>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-slate-400">或者</span>
                            </div>
                        </div>

                        {/* 使用 Grid 布局让按钮并排，减少垂直高度占用 */}
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            {githubEnabled && (
                                <Button
                                    block
                                    loading={githubLoading}
                                    icon={<GithubOutlined/>}
                                    onClick={handleGitHubLogin}
                                    className={`h-10 rounded-xl border-slate-200 text-slate-700 font-medium hover:border-slate-300 hover:text-slate-900 ${!oidcEnabled ? 'col-span-2' : ''}`}
                                >
                                    GitHub
                                </Button>
                            )}
                            {oidcEnabled && (
                                <Button
                                    block
                                    loading={oidcLoading}
                                    icon={<GlobalOutlined/>} // 换了一个更通用的图标
                                    onClick={handleOIDCLogin}
                                    className={`h-10 rounded-xl border-slate-200 text-slate-700 font-medium hover:border-slate-300 hover:text-slate-900 ${!githubEnabled ? 'col-span-2' : ''}`}
                                >
                                    OIDC
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Login;