import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Input, Select, Space, Spin, Typography } from 'antd';
import { CopyIcon } from 'lucide-react';
import copy from 'copy-to-clipboard';
import {
    AgentInstallLayout,
    ConfigHelper,
    ServiceHelper,
    AGENT_NAME,
} from './AgentInstallShared';
import { useAgentInstallConfig } from './useAgentInstallConfig';
import { getAgentInstallConfig, saveAgentInstallConfig } from '@/api/property';

const { Paragraph } = Typography;

const AgentInstallOneClick = () => {
    const { message } = App.useApp();
    const {
        apiKeys,
        selectedApiKey,
        setSelectedApiKey,
        customAgentName,
        setCustomAgentName,
        loading,
        backendServerUrl,
        apiKeyOptions,
    } = useAgentInstallConfig();

    const [serverUrl, setServerUrl] = useState<string>('');
    const [serverUrlError, setServerUrlError] = useState<string>('');
    const [serverUrlLoading, setServerUrlLoading] = useState(true);
    const effectiveServerUrl = serverUrl || backendServerUrl;

    // 加载服务端地址配置
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const config = await getAgentInstallConfig();
                const configuredUrl = (config.serverUrl || '').trim();
                setServerUrl(configuredUrl);
                setServerUrlError(configuredUrl ? '' : '请先配置服务端地址');
            } catch (error) {
                console.error('加载服务端地址配置失败:', error);
            } finally {
                setServerUrlLoading(false);
            }
        };

        void fetchConfig();
    }, []);

    // 保存服务端地址配置
    const handleServerUrlBlur = async (value: string) => {
        const trimmed = value.trim();
        setServerUrl(trimmed);
        if (!trimmed) {
            setServerUrlError('请先配置服务端地址');
            message.error('请先配置服务端地址');
            return;
        }
        setServerUrlError('');

        try {
            await saveAgentInstallConfig({ serverUrl: trimmed });
            message.success('服务端地址已保存');
        } catch (error) {
            console.error('保存服务端地址失败:', error);
            message.error('保存服务端地址失败');
        }
    };

    const handleFillCurrentUrl = () => {
        const currentUrl = window.location.origin;
        setServerUrl(currentUrl);
        setServerUrlError('');
        void handleServerUrlBlur(currentUrl);
    };

    const installCommand = useMemo(() => {
        if (!effectiveServerUrl || !selectedApiKey) {
            return '';
        }
        const trimmedName = customAgentName.trim();
        const nameParam = trimmedName ? `&name=${encodeURIComponent(trimmedName)}` : '';
        return `curl -fsSL "${effectiveServerUrl}/api/agent/install.sh?token=${selectedApiKey}${nameParam}" | sudo bash`;
    }, [backendServerUrl, selectedApiKey, customAgentName, serverUrl]);

    const copyToClipboard = (text: string) => {
        copy(text);
        message.success('已复制到剪贴板');
    };

    return (
        <AgentInstallLayout activeKey="one-click">
            <Space direction="vertical" className="w-full">
                <Card type="inner" title="配置选项">
                    <Space direction="vertical" className="w-full">
                        <div>
                            <div className="mb-1 text-gray-600 dark:text-slate-400">
                                服务端地址 <span className="text-xs text-gray-400">(必填)</span>
                            </div>
                            <Spin spinning={serverUrlLoading}>
                                <Input
                                    key={serverUrl}
                                    placeholder="例如: https://monitor.example.com"
                                    defaultValue={serverUrl}
                                    onBlur={(e) => {
                                        void handleServerUrlBlur(e.currentTarget.value);
                                    }}
                                    className="w-full"
                                />
                            </Spin>
                            <div className="mt-2">
                                <Button size="small" onClick={handleFillCurrentUrl}>
                                    使用当前访问地址
                                </Button>
                            </div>
                            {serverUrlError ? (
                                <div className="mt-1 text-xs text-red-500">{serverUrlError}</div>
                            ) : (
                                <div className="mt-1 text-xs text-gray-400">
                                    请配置可访问的服务端地址，否则无法生成安装命令
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="mb-1 text-gray-600 dark:text-slate-400">选择 API Token</div>
                            {apiKeys.length === 0 ? (
                                <Alert
                                    message="暂无可用的 API Token"
                                    description={
                                        <span>
                                            请先前往 <a href="/admin/api-keys">API密钥管理</a> 页面生成一个 API Token
                                        </span>
                                    }
                                    type="warning"
                                    showIcon
                                    className="mt-2"
                                />
                            ) : (
                                <Select
                                    className="w-full"
                                    value={selectedApiKey}
                                    onChange={setSelectedApiKey}
                                    options={apiKeyOptions}
                                    loading={loading}
                                    placeholder="请选择 API Token"
                                />
                            )}
                        </div>

                        <div>
                            <div className="mb-1 text-gray-600 dark:text-slate-400">
                                自定义名称 <span className="text-xs text-gray-400">(可选，留空则使用主机名)</span>
                            </div>
                            <Input
                                key={customAgentName}
                                placeholder="请输入自定义名称，例如: my-server-01"
                                defaultValue={customAgentName}
                                onBlur={(e) => {
                                    const trimmed = e.currentTarget.value.trim();
                                    setCustomAgentName(trimmed);
                                    e.currentTarget.value = trimmed;
                                }}
                                className="w-full"
                                allowClear
                            />
                        </div>
                    </Space>
                </Card>

                <Alert
                    description="一键安装脚本仅支持 Linux/macOS 系统。"
                    type="info"
                    showIcon
                    className="mt-2"
                />
                {!effectiveServerUrl && (
                    <Alert
                        description="请先配置服务端地址后再生成安装命令。"
                        type="warning"
                        showIcon
                        className="mt-2"
                    />
                )}
                <Card type="inner" title="一键安装">
                    <Paragraph type="secondary" className="mb-3 text-gray-600 dark:text-slate-400">
                        脚本会自动检测系统架构并下载对应版本的探针，然后完成注册和安装。
                    </Paragraph>
                    <pre
                        className="m-0 overflow-auto text-sm bg-gray-50 dark:bg-slate-800 p-3 rounded text-gray-900 dark:text-slate-100">
                        <code>{installCommand}</code>
                    </pre>
                    <Button
                        type="link"
                        onClick={() => void copyToClipboard(installCommand)}
                        icon={<CopyIcon className="h-4 w-4" />}
                        style={{ margin: 0, padding: 0 }}
                        disabled={!selectedApiKey || !effectiveServerUrl}
                    >
                        复制命令
                    </Button>
                </Card>

                <ServiceHelper os={AGENT_NAME} />
                <ConfigHelper />
            </Space>
        </AgentInstallLayout>
    );
};

export default AgentInstallOneClick;
