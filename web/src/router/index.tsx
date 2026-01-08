import {createBrowserRouter, Navigate} from 'react-router-dom';
import {type ComponentType, lazy, type LazyExoticComponent, Suspense} from 'react';
import PrivateRoute from '@admin/components/PrivateRoute';

const LoginPage = lazy(() => import('@admin/pages/Login'));
const GitHubCallbackPage = lazy(() => import('@admin/pages/Login/GitHubCallback'));
const OIDCCallbackPage = lazy(() => import('@admin/pages/Login/OIDCCallback'));
const PublicLayout = lazy(() => import('@portal/pages/PublicLayout'));
const AdminLayout = lazy(() => import('@admin/pages/AdminLayout'));
const AgentListPage = lazy(() => import('@admin/pages/Agents/AgentList'));
const AgentDetailPage = lazy(() => import('@admin/pages/Agents/AgentDetail'));
const AgentInstallPage = lazy(() => import('@admin/pages/Agents/AgentInstall'));
const ApiKeyListPage = lazy(() => import('@admin/pages/ApiKeys/ApiKeyList'));
const SettingsPage = lazy(() => import('@admin/pages/Settings'));
const ServerListPage = lazy(() => import('@portal/pages/ServerList.tsx'));
const ServerDetailPage = lazy(() => import('@portal/pages/ServerDetail.tsx'));
const PublicMonitorListPage = lazy(() => import('@portal/pages/MonitorList.tsx'));
const PublicMonitorDetailPage = lazy(() => import('@portal/pages/MonitorDetail.tsx'));
const MonitorListPage = lazy(() => import('@admin/pages/Monitors/MonitorList'));
const DDNSPage = lazy(() => import('@admin/pages/DDNS'));
const AlertRecordListPage = lazy(() => import('@admin/pages/AlertRecords'));

const LoadingFallback = () => (
    <div className="flex min-h-[200px] w-full items-center justify-center text-gray-500">
        页面加载中...
    </div>
);

const lazyLoad = (Component: LazyExoticComponent<ComponentType<any>>) => (
    <Suspense fallback={<LoadingFallback/>}>
        <Component/>
    </Suspense>
);

const router = createBrowserRouter([
    // 登录页面
    {
        path: '/login',
        element: lazyLoad(LoginPage),
    },
    {
        path: '/github/callback',
        element: lazyLoad(GitHubCallbackPage),
    },
    {
        path: '/oidc/callback',
        element: lazyLoad(OIDCCallbackPage),
    },
    // 公开页面 - 不需要登录
    {
        element: lazyLoad(PublicLayout),
        children: [
            {
                path: '/',
                element: lazyLoad(ServerListPage),
            },
            {
                path: '/servers/:id',
                element: lazyLoad(ServerDetailPage),
            },
            {
                path: '/monitors',
                element: lazyLoad(PublicMonitorListPage),
            },
            {
                path: '/monitors/:id',
                element: lazyLoad(PublicMonitorDetailPage),
            },
        ],
    },
    // 管理员页面 - 需要登录
    {
        path: '/admin',
        element: (
            <PrivateRoute>
                {lazyLoad(AdminLayout)}
            </PrivateRoute>
        ),
        children: [
            {
                index: true,
                element: <Navigate to="/admin/agents" replace/>,
            },
            {
                path: 'agents',
                element: lazyLoad(AgentListPage),
            },
            {
                path: 'agents/:id',
                element: lazyLoad(AgentDetailPage),
            },
            {
                path: 'agents-install',
                element: lazyLoad(AgentInstallPage),
            },
            {
                path: 'api-keys',
                element: lazyLoad(ApiKeyListPage),
            },
            {
                path: 'monitors',
                element: lazyLoad(MonitorListPage),
            },
            {
                path: 'ddns',
                element: lazyLoad(DDNSPage),
            },
            {
                path: 'alert-records',
                element: lazyLoad(AlertRecordListPage),
            },
            {
                path: 'settings',
                element: lazyLoad(SettingsPage),
            },
        ],
    },
]);

export default router;
