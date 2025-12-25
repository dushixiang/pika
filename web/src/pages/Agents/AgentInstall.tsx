import React, {type ReactElement, useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, App, Button, Card, Select, Space, Tabs, Typography} from 'antd';
import {CopyIcon} from 'lucide-react';
import {listApiKeys} from '@/api/apiKey.ts';
import {getServerUrl} from '@/api/agent.ts';
import type {ApiKey} from '@/types';
import linuxPng from '../../assets/os/linux.png';
import applePng from '../../assets/os/apple.png';
import windowsPng from '../../assets/os/win11.png';
import {useNavigate} from "react-router-dom";
import copy from 'copy-to-clipboard';

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

    // 服务器地址相关状态
    const [backendServerUrl, setBackendServerUrl] = useState<string>('');

    const {message} = App.useApp();
    const navigate = useNavigate();
    const frontendUrl = useMemo(() => window.location.origin, []);

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

    // 加载服务器地址
    useEffect(() => {
        const fetchServerUrl = async () => {
            try {
                const response = await getServerUrl();
                const backendUrl = response.data.serverUrl || '';
                setBackendServerUrl(backendUrl);
            } catch (error) {
                console.error('Failed to load server URL:', error);
            }
        };

        void fetchServerUrl();
    }, []);

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
        'linux-loong64': {
            name: 'Linux (loongarch64)',
            icon: <img src={linuxPng} alt="Linux" className={'h-4 w-4'}/>,
            downloadUrl: '/api/agent/downloads/agent-linux-loong64',
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
    const copyToClipboard = (text: string) => {
        copy(text);
        message.success('已复制到剪贴板');
    }
    // 获取一键安装命令（使用后端检测的地址）
    const installCommand = useMemo(() => {
        if (!backendServerUrl || !selectedApiKey) {
            return '';
        }
        return `curl -fsSL ${backendServerUrl}/api/agent/install.sh?token=${selectedApiKey} | sudo bash`;
    }, [backendServerUrl, selectedApiKey]);

    // API Key 选择器选项
    const apiKeyOptions = useMemo(
        () => apiKeys.map(key => ({
            label: `${key.name} (${key.key.substring(0, 8)}...)`,
            value: key.key,
        })),
        [apiKeys]
    );

    // 服务器地址检查组件
    const ServerUrlChecker = useCallback(() => {
        const hasAddressMismatch = backendServerUrl && backendServerUrl !== frontendUrl;

        if (!hasAddressMismatch) {
            return null;
        }

        return (
            <Alert
                message="检测到地址不一致"
                description={
                    <Space direction="vertical" className="w-full">
                        <div>
                            当前访问地址: <Text code>{frontendUrl}</Text>
                            <br/>
                            后端检测地址: <Text code>{backendServerUrl}</Text>
                        </div>
                        <div>
                            <Text strong>这通常是因为您使用了反向代理，但未正确配置转发头部。</Text>
                        </div>
                        <div>
                            <Text>请在反向代理配置中添加以下头部：</Text>
                        </div>
                        <div>
                            <Text strong>Nginx 配置示例：</Text>
                            <pre className="m-0 mt-2 overflow-auto text-xs bg-gray-100 dark:bg-slate-900 p-2 rounded">
{`location / {
    proxy_pass http://backend;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}`}
                            </pre>
                        </div>
                        <div>
                            <Text strong>Caddy 配置示例：</Text>
                            <pre className="m-0 mt-2 overflow-auto text-xs bg-gray-100 dark:bg-slate-900 p-2 rounded">
{`reverse_proxy backend:8080 {
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Host {host}
}`}
                            </pre>
                        </div>
                        <div>
                            <Text strong>Traefik 配置说明：</Text>
                            <pre className="m-0 mt-2 overflow-auto text-xs bg-gray-100 dark:bg-slate-900 p-2 rounded">
{`# Traefik 默认会自动添加 X-Forwarded-* 头部
# 无需额外配置`}
                            </pre>
                        </div>
                        <div className="mt-2">
                            <Text type="secondary">配置完成后，刷新页面即可生效。</Text>
                        </div>
                    </Space>
                }
                type="warning"
                showIcon
                closable
            />
        );
    }, [backendServerUrl, frontendUrl]);

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
            <ServerUrlChecker/>
            <ApiChooser/>
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
    ), [ServerUrlChecker, ApiChooser, installCommand, copyToClipboard, selectedApiKey]);

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
            <Paragraph type="secondary" className="mb-3 text-gray-600 dark:text-slate-400">
                注册完成后，您可以使用以下命令管理探针服务：
            </Paragraph>
            <pre
                className="m-0 overflow-auto text-sm bg-gray-50 dark:bg-slate-800 p-3 rounded text-gray-900 dark:text-slate-100">
                <code>{getCommonCommands(os)}</code>
            </pre>
        </Card>
    ), [getCommonCommands]);

    // 配置文件说明组件
    const ConfigHelper = useCallback(() => (
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
    ), []);

    // 获取手动安装步骤
    const getManualInstallSteps = useCallback((os: OSType): InstallStep[] => {
        const config = osConfigs[os];

        if (os.startsWith('windows')) {
            return [
                {
                    title: '1. 下载探针',
                    command: `# 使用 PowerShell 下载
Invoke-WebRequest -Uri "${backendServerUrl}${config.downloadUrl}" -OutFile "${AGENT_NAME_EXE}"

# 或者使用浏览器直接下载
# ${backendServerUrl}${config.downloadUrl}`
                },
                {
                    title: '2. 注册探针',
                    command: `.\\${AGENT_NAME_EXE} register --endpoint "${backendServerUrl}" --token "${selectedApiKey}"`
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
wget ${backendServerUrl}${config.downloadUrl} -O ${AGENT_NAME}

# 或使用 curl 下载
curl -L ${backendServerUrl}${config.downloadUrl} -o ${AGENT_NAME}`
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
                command: `sudo ${AGENT_NAME} register --endpoint "${backendServerUrl}" --token "${selectedApiKey}"`
            },
            {
                title: '5. 验证安装',
                command: `sudo ${AGENT_NAME} status`
            }
        ];
    }, [osConfigs, backendServerUrl, selectedApiKey]);

    // 手动安装组件
    const InstallByManual = useCallback(() => (
        <Space direction="vertical" className="w-full">
            <ServerUrlChecker/>
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
                                            <Text strong
                                                  className="block mb-2 text-gray-900 dark:text-slate-100">{step.title}</Text>
                                            <pre
                                                className="m-0 overflow-auto text-sm bg-gray-50 dark:bg-slate-800 p-3 rounded text-gray-900 dark:text-slate-100">
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
    ), [ServerUrlChecker, ApiChooser, selectedOS, osConfigs, getManualInstallSteps, copyToClipboard, selectedApiKey, ServiceHelper, ConfigHelper]);

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

            <Tabs
                style={{marginTop: 24}}
                tabPosition="left"
                items={tabItems}
            />
        </Space>
    );
};

export default AgentInstall;
