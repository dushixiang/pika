import React, { useMemo } from 'react';
import { Alert, App, Button, Card, Space, Typography } from 'antd';
import { CopyIcon } from 'lucide-react';
import copy from 'copy-to-clipboard';
import {
    AgentInstallLayout,
    ApiChooser,
    ConfigHelper,
    ServerUrlChecker,
    ServiceHelper,
    AGENT_NAME,
} from './AgentInstallShared';
import { useAgentInstallConfig } from './useAgentInstallConfig';

const { Paragraph } = Typography;

const AgentInstallOneClick = () => {
    const { message } = App.useApp();
    const frontendUrl = useMemo(() => window.location.origin, []);
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

    const installCommand = useMemo(() => {
        if (!backendServerUrl || !selectedApiKey) {
            return '';
        }
        const trimmedName = customAgentName.trim();
        const nameParam = trimmedName ? `&name=${encodeURIComponent(trimmedName)}` : '';
        return `curl -fsSL '${backendServerUrl}/api/agent/install.sh?token=${selectedApiKey}${nameParam}' | sudo bash`;
    }, [backendServerUrl, selectedApiKey, customAgentName]);

    const copyToClipboard = (text: string) => {
        copy(text);
        message.success('已复制到剪贴板');
    };

    return (
        <AgentInstallLayout activeKey="one-click">
            <Space direction="vertical" className="w-full">
                <ServerUrlChecker backendServerUrl={backendServerUrl} frontendUrl={frontendUrl} />
                <ApiChooser
                    apiKeys={apiKeys}
                    selectedApiKey={selectedApiKey}
                    apiKeyOptions={apiKeyOptions}
                    loading={loading}
                    customAgentName={customAgentName}
                    onSelectApiKey={setSelectedApiKey}
                    onCustomNameBlur={setCustomAgentName}
                />
                <Alert
                    description="一键安装脚本仅支持 Linux/macOS 系统。"
                    type="info"
                    showIcon
                    className="mt-2"
                />
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
                        disabled={!selectedApiKey}
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
