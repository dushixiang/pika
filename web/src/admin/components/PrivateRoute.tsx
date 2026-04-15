import type { ReactNode } from 'react';

interface PrivateRouteProps {
    children: ReactNode;
}

/**
 * 私有路由守卫组件
 * 用于保护需要登录才能访问的路由
 */
const PrivateRoute = ({ children }: PrivateRouteProps) => {
    const token = localStorage.getItem('token');
    const userInfo = localStorage.getItem('userInfo');

    // 如果没有登录信息，返回空占位
    if (!token || !userInfo) {
        return null;
    }

    // 已登录，渲染子组件
    return <>{children}</>;
};

export default PrivateRoute;
