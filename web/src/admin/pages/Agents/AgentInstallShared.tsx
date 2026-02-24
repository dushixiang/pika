import React, { type ReactNode } from 'react';
import { Alert, Button, Card, Input, Select, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { ApiKey } from '@/types';

const { Paragraph, Text } = Typography;

export const AGENT_NAME = 'pika-agent';
export const AGENT_NAME_EXE = 'pika-agent.exe';
export const CONFIG_PATH = '~/.pika/agent.yaml';

type InstallNavKey = 'one-click' | 'manual';

export type ApiKeyOption = {
    label: string;
    value: string;
};

export type ApiChooserProps = {
    apiKeys: ApiKey[];
    selectedApiKey: string;
    apiKeyOptions: ApiKeyOption[];
    loading: boolean;
    onSelectApiKey: (value: string) => void;
};

export const AgentInstallLayout = ({ activeKey, children }: { activeKey: InstallNavKey; children: ReactNode }) => {
    const navigate = useNavigate();

    return (
        <Space direction="vertical" className="w-full" size="large">
            <div className="flex gap-2 items-center">
                <div
                    className="text-sm cursor-pointer hover:underline text-gray-600 dark:text-slate-300"
                    onClick={() => navigate(-1)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(-1)}
                >
                    返回 |
                </div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">探针部署指南</h1>
            </div>

            <Space size={8}>
                <Button
                    type={activeKey === 'one-click' ? 'primary' : 'default'}
                    onClick={() => navigate('/admin/agents-install/one-click')}
                >
                    一键安装
                </Button>
                <Button
                    type={activeKey === 'manual' ? 'primary' : 'default'}
                    onClick={() => navigate('/admin/agents-install/manual')}
                >
                    手动安装
                </Button>
            </Space>

            {children}
        </Space>
    );
};

export const ApiChooser = ({
    apiKeys,
    selectedApiKey,
    apiKeyOptions,
    loading,
    onSelectApiKey,
}: ApiChooserProps) => (
    <Card type="inner" title="配置选项">
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
                    onChange={onSelectApiKey}
                    options={apiKeyOptions}
                    loading={loading}
                    placeholder="请选择 API Token"
                />
            )}
        </div>
    </Card>
);

const getCommonCommands = (os: string) => {
    const agentCmd = os.startsWith('windows') ? `.\\${AGENT_NAME_EXE}` : AGENT_NAME;
    const sudo = os.startsWith('windows') ? '' : 'sudo ';

    return `# 查看服务状态
${sudo}${agentCmd} status

# 停止服务
${sudo}${agentCmd} stop

# 启动服务
${sudo}${agentCmd} start

# 重启服务
${sudo}${agentCmd} restart

# 卸载服务
${sudo}${agentCmd} uninstall

# 查看版本
${agentCmd} version`;
};

export const ServiceHelper = ({ os }: { os: string }) => (
    <Card type="inner" title="服务管理命令">
        <Paragraph type="secondary" className="mb-3 text-gray-600 dark:text-slate-400">
            注册完成后，您可以使用以下命令管理探针服务：
        </Paragraph>
        <pre
            className="m-0 overflow-auto text-sm bg-gray-50 dark:bg-slate-800 p-3 rounded text-gray-900 dark:text-slate-100">
            <code>{getCommonCommands(os)}</code>
        </pre>
    </Card>
);

export const ConfigHelper = () => (
    <Card type="inner" title="配置文件说明">
        <Paragraph className="text-gray-900 dark:text-slate-100">
            注册完成后，配置文件会保存在:
        </Paragraph>
        <ul className="space-y-2 text-gray-600 dark:text-slate-400">
            <li>
                <Text code>{CONFIG_PATH}</Text> - 配置文件路径
            </li>
            <li>
                您可以手动编辑此文件来修改配置，修改后需要重启服务生效
            </li>
        </ul>
    </Card>
);
