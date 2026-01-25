import {useEffect} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {App} from 'antd';
import {oidcLogin} from '@/api/auth.ts';

const OIDCCallback = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const {message: messageApi} = App.useApp();

    useEffect(() => {
        const handleCallback = async () => {
            // 检查是否有错误参数
            const error = searchParams.get('error');
            if (error) {
                const errorDescription = searchParams.get('error_description');
                const errorMessage = errorDescription
                    ? decodeURIComponent(errorDescription)
                    : `认证失败: ${error}`;
                messageApi.error(errorMessage);
                navigate('/login');
                return;
            }

            const code = searchParams.get('code');
            const state = searchParams.get('state');

            if (!code || !state) {
                messageApi.error('缺少认证参数');
                navigate('/login');
                return;
            }

            try {
                const response = await oidcLogin(code, state);
                const {token, user} = response.data;

                // 保存 token 和用户信息
                localStorage.setItem('token', token);
                localStorage.setItem('userInfo', JSON.stringify(user));

                messageApi.success('登录成功');
                navigate('/admin/agents');
            } catch (error: any) {
                messageApi.error(error.response?.data?.message || 'OIDC 认证失败');
                navigate('/login');
            }
        };

        handleCallback();
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 transition-colors duration-300">
            <div className="text-center">
                <div className="text-lg mb-2 text-slate-900 dark:text-zinc-100 font-medium">正在处理 OIDC 认证...</div>
                <div className="text-slate-500 dark:text-zinc-500">请稍候</div>
            </div>
        </div>
    );
};

export default OIDCCallback;
