import { get, post } from './request';
import type { LoginRequest, LoginResponse } from '../types';

// 认证配置
export interface AuthConfig {
    oidcEnabled: boolean;
    githubEnabled: boolean;
    passwordEnabled: boolean;
}

// OIDC 认证 URL
export interface OIDCAuthURL {
    authUrl: string;
    state: string;
}

// GitHub 认证 URL
export interface GitHubAuthURL {
    authUrl: string;
    state: string;
}

// 获取认证配置
export const getAuthConfig = () => {
    return get<AuthConfig>('/auth/config');
};

// 获取 OIDC 认证 URL
export const getOIDCAuthURL = () => {
    return get<OIDCAuthURL>('/auth/oidc/url');
};

// OIDC 登录回调
export const oidcLogin = (code: string, state: string) => {
    return post<LoginResponse>('/auth/oidc/callback', { code, state });
};

// 获取 GitHub 认证 URL
export const getGitHubAuthURL = () => {
    return get<GitHubAuthURL>('/auth/github/url');
};

// GitHub 登录回调
export const githubLogin = (code: string, state: string) => {
    return post<LoginResponse>('/auth/github/callback', { code, state });
};

// Basic Auth 登录
export const login = (data: LoginRequest) => {
    return post<LoginResponse>('/login', data);
};

// 登出
export const logout = () => {
    return post('/admin/logout');
};

// 获取当前用户信息
export interface CurrentUser {
    userId: string;
    username: string;
}

export const getCurrentUser = () => {
    return get<CurrentUser>('/admin/account/info');
};

