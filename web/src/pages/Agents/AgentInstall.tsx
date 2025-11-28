import React, {type ReactElement, useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, App, Button, Card, Select, Space, Tabs, Typography} from 'antd';
import {CopyIcon} from 'lucide-react';
import {listApiKeys} from '../../api/apiKey';
import type {ApiKey} from '../../types';
import linuxPng from '../../assets/os/linux.png';
import applePng from '../../assets/os/apple.png';
import windowsPng from '../../assets/os/win11.png';
import {useNavigate} from "react-router-dom";

const {Paragraph, Text} = Typography;
const {TabPane} = Tabs;

// 常量定义
const AGENT_NAME = 'pika-agent';
const AGENT_NAME_EXE = 'pika-agent.exe';
const CONFIG_PATH = '~/.pika/agent.yaml';
const DEFAULT_OS = 'linux-amd64' as const;

// 类型定义
interface OSConfig {
    name: string;
    icon: ReactElement;
    downloadUrl: string;
}

interface InstallStep {
    title: string;
    command: string;
}

type OSType = 'linux-amd64' | 'linux-arm64' | 'darwin-amd64' | 'darwin-arm64' | 'windows-amd64' | 'windows-arm64';

const AgentInstall = () => {
    const [selectedOS, setSelectedOS] = useState<OSType>(DEFAULT_OS);
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [selectedApiKey, setSelectedApiKey] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);

    const {message} = App.useApp();
    const navigate = useNavigate();
    const serverUrl = useMemo(() => window.location.origin, []);

    // 加载API密钥列表
    useEffect(() => {
        const fetchApiKeys = async () => {
            setLoading(true);
            try {
                const keys = await listApiKeys();
                const enabledKeys = keys.data?.items.filter(k => k.enabled) || [];
                setApiKeys(enabledKeys);
                if (enabledKeys.length > 0) {
                    setSelectedApiKey(enabledKeys[0].key);
                }
            } catch (error) {
                console.error('Failed to load API keys:', error);
                message.error('加载 API Token 失败');
            } finally {
                setLoading(false);
            }
        };
        void fetchApiKeys();
    }, [message]);

    // 操作系统配置
    const osConfigs: Record<OSType, OSConfig> = useMemo(() => ({
        'linux-amd64': {
            name: 'Linux (amd64)',
            icon: <img src={linuxPng} alt="Linux" className="h-4 w-4"/>,
            downloadUrl: '/api/agent/downloads/agent-linux-amd64',
        },
        'linux-arm64': {
            name: 'Linux (arm64)',
            icon: <img src={linuxPng} alt="Linux" className="h-4 w-4"/>,
            downloadUrl: '/api/agent/downloads/agent-linux-arm64',
        },
        'darwin-amd64': {
            name: 'macOS (amd64)',
            icon: <img src={applePng} alt="macOS" className="h-4 w-4"/>,
            downloadUrl: '/api/agent/downloads/agent-darwin-amd64',
        },
        'darwin-arm64': {
            name: 'macOS (arm64)',
            icon: <img src={applePng} alt="macOS" className="h-4 w-4"/>,
            downloadUrl: '/api/agent/downloads/agent-darwin-arm64',
        },
        'windows-amd64': {
            name: 'Windows (amd64)',
            icon: <img src={windowsPng} alt="Windows" className="h-4 w-4"/>,
            downloadUrl: '/api/agent/downloads/agent-windows-amd64.exe',
        },
        'windows-arm64': {
            name: 'Windows (arm64)',
            icon: <img src={windowsPng} alt="Windows" className="h-4 w-4"/>,
            downloadUrl: '/api/agent/downloads/agent-windows-arm64.exe',
        },
    }), []);

    // 复制到剪贴板
    const copyToClipboard = useCallback(async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            message.success('已复制到剪贴板');
        } catch (error) {
            console.error('Failed to copy:', error);
            message.error('复制失败,请手动复制');
        }
    }, [message]);

    // 获取一键安装命令
    const installCommand = useMemo(
        () => `curl -fsSL ${serverUrl}/api/agent/install.sh?token=${selectedApiKey} | sudo bash`,
        [serverUrl, selectedApiKey]
    );

    // API Key 选择器选项
    const apiKeyOptions = useMemo(
        () => apiKeys.map(key => ({
            label: `${key.name} (${key.key.substring(0, 8)}...)`,
            value: key.key,
        })),
        [apiKeys]
    );

    // API Token 选择组件
    const ApiChooser = useCallback(() => (
        <Card type="inner" title="选择 API Token">
            <Space direction="vertical" className="w-full">
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
                        className="w-full mt-2"
                        value={selectedApiKey}
                        onChange={setSelectedApiKey}
                        options={apiKeyOptions}
                        loading={loading}
                        placeholder="请选择 API Token"
                    />
                )}
            </Space>
        </Card>
    ), [apiKeys, selectedApiKey, apiKeyOptions, loading]);

    // 一键安装组件
    const InstallByOneClick = useCallback(() => (
        <Space direction="vertical" className="w-full">
            <ApiChooser/>
            <Alert
                description="一键安装脚本仅支持 Linux/macOS 系统。"
                type="info"
                showIcon
                className="mt-2"
            />
            <Card type="inner" title="一键安装">
                <Paragraph type="secondary" className="mb-3">
                    脚本会自动检测系统架构并下载对应版本的探针，然后完成注册和安装。
                </Paragraph>
                <pre className="m-0 overflow-auto text-sm bg-gray-50 p-3 rounded">
                    <code>{installCommand}</code>
                </pre>
                <Button
                    type="link"
                    onClick={() => void copyToClipboard(installCommand)}
                    icon={<CopyIcon className="h-4 w-4"/>}
                    style={{margin: 0, padding: 0}}
                    disabled={!selectedApiKey}
                >
                    复制命令
                </Button>
            </Card>

            <ServiceHelper os={AGENT_NAME}/>
            <ConfigHelper/>
        </Space>
    ), [ApiChooser, installCommand, copyToClipboard, selectedApiKey]);

    // 常用服务管理命令
    const getCommonCommands = useCallback((os: string) => {
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
    }, []);

    // 服务管理命令组件
    const ServiceHelper = useCallback(({os}: { os: string }) => (
        <Card type="inner" title="服务管理命令">
            <Paragraph type="secondary" className="mb-3">
                注册完成后，您可以使用以下命令管理探针服务：
            </Paragraph>
            <pre className="m-0 overflow-auto text-sm bg-gray-50 p-3 rounded">
                <code>{getCommonCommands(os)}</code>
            </pre>
        </Card>
    ), [getCommonCommands]);

    // 配置文件说明组件
    const ConfigHelper = useCallback(() => (
        <Card type="inner" title="配置文件说明">
            <Paragraph>
                注册完成后，配置文件会保存在:
            </Paragraph>
            <ul className="space-y-2">
                <li>
                    <Text code>{CONFIG_PATH}</Text> - 配置文件路径
                </li>
                <li>
                    您可以手动编辑此文件来修改配置，修改后需要重启服务生效
                </li>
            </ul>
        </Card>
    ), []);

    // 获取手动安装步骤
    const getManualInstallSteps = useCallback((os: OSType): InstallStep[] => {
        const config = osConfigs[os];

        if (os.startsWith('windows')) {
            return [
                {
                    title: '1. 下载探针',
                    command: `# 使用 PowerShell 下载
Invoke-WebRequest -Uri "${serverUrl}${config.downloadUrl}" -OutFile "${AGENT_NAME_EXE}"

# 或者使用浏览器直接下载
# ${serverUrl}${config.downloadUrl}`
                },
                {
                    title: '2. 注册探针',
                    command: `.\\${AGENT_NAME_EXE} register --endpoint "${serverUrl}" --token "${selectedApiKey}"`
                },
                {
                    title: '3. 验证安装',
                    command: `.\\${AGENT_NAME_EXE} status`
                }
            ];
        }

        return [
            {
                title: '1. 下载探针',
                command: `# 使用 wget 下载
wget ${serverUrl}${config.downloadUrl} -O ${AGENT_NAME}

# 或使用 curl 下载
curl -L ${serverUrl}${config.downloadUrl} -o ${AGENT_NAME}`
            },
            {
                title: '2. 赋予执行权限',
                command: `chmod +x ${AGENT_NAME}`
            },
            {
                title: '3. 移动到系统路径',
                command: `sudo mv ${AGENT_NAME} /usr/local/bin/${AGENT_NAME}`
            },
            {
                title: '4. 注册探针',
                command: `sudo ${AGENT_NAME} register --endpoint "${serverUrl}" --token "${selectedApiKey}"`
            },
            {
                title: '5. 验证安装',
                command: `sudo ${AGENT_NAME} status`
            }
        ];
    }, [osConfigs, serverUrl, selectedApiKey]);

    // 手动安装组件
    const InstallByManual = useCallback(() => (
        <Space direction="vertical" className="w-full">
            <ApiChooser/>
            <Tabs
                activeKey={selectedOS}
                onChange={(key) => setSelectedOS(key as OSType)}
            >
                {Object.entries(osConfigs).map(([key, config]) => (
                    <TabPane
                        tab={
                            <div className="flex items-center gap-2">
                                {config.icon}
                                <span>{config.name}</span>
                            </div>
                        }
                        key={key}
                    >
                        <Space direction="vertical" className="w-full">
                            <Card type="inner" title="手动安装步骤">
                                <Space direction="vertical" className="w-full" size="middle">
                                    {getManualInstallSteps(key as OSType).map((step, index) => (
                                        <div key={index}>
                                            <Text strong className="block mb-2">{step.title}</Text>
                                            <pre className="m-0 overflow-auto text-sm bg-gray-50 p-3 rounded">
                                                <code>{step.command}</code>
                                            </pre>
                                            <Button
                                                type="link"
                                                onClick={() => void copyToClipboard(step.command)}
                                                icon={<CopyIcon className="h-4 w-4"/>}
                                                size="small"
                                                style={{margin: 0, padding: 0}}
                                                disabled={!selectedApiKey}
                                            >
                                                复制
                                            </Button>
                                        </div>
                                    ))}
                                </Space>
                            </Card>

                            <ServiceHelper os={key}/>
                            <ConfigHelper/>
                        </Space>
                    </TabPane>
                ))}
            </Tabs>
        </Space>
    ), [ApiChooser, selectedOS, osConfigs, getManualInstallSteps, copyToClipboard, selectedApiKey, ServiceHelper, ConfigHelper]);

    // 主选项卡配置
    const tabItems = useMemo(() => [
        {
            label: '一键安装',
            key: 'one-click',
            children: <InstallByOneClick/>
        },
        {
            label: '手动安装',
            key: 'manual',
            children: <InstallByManual/>
        },
    ], [InstallByOneClick, InstallByManual]);

    return (
        <Space direction="vertical" className="w-full">
            <div className="flex gap-2 items-center">
                <div
                    className="text-sm cursor-pointer hover:underline"
                    onClick={() => navigate(-1)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(-1)}
                >
                    返回 |
                </div>
                <h1 className="text-2xl font-semibold text-gray-900">探针部署指南</h1>
            </div>

            <Tabs
                style={{ marginTop: 24 }}
                tabPosition="left"
                items={tabItems}
            />
        </Space>
    );
};

export default AgentInstall;
