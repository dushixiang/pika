import {useEffect} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {App} from 'antd';
import {githubLogin} from '@/api/auth.ts';

const GitHubCallback = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const {message: messageApi} = App.useApp();

    useEffect(() => {
        const handleCallback = async () => {
            const code = searchParams.get('code');
            const state = searchParams.get('state');

            if (!code || !state) {
                messageApi.error('缺少认证参数');
                navigate('/login');
                return;
            }

            try {
                const response = await githubLogin(code, state);
                const {token, user} = response.data;

                // 保存 token 和用户信息
                localStorage.setItem('token', token);
                localStorage.setItem('userInfo', JSON.stringify(user));

                messageApi.success('登录成功');
                navigate('/admin/agents');
            } catch (error: any) {
                messageApi.error(error.response?.data?.message || 'GitHub 认证失败');
                navigate('/login');
            }
        };

        handleCallback();
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950 transition-colors duration-300">
            <div className="text-center">
                <div className="text-lg mb-2 text-slate-900 dark:text-zinc-100 font-medium">正在处理 GitHub 认证...</div>
                <div className="text-slate-500 dark:text-zinc-500">请稍候</div>
            </div>
        </div>
    );
};

export default GitHubCallback;
