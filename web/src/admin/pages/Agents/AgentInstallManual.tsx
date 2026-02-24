import React, { type ReactElement, useMemo, useState } from 'react';
import { App, Button, Card, Space, Tabs, Typography } from 'antd';
import { CopyIcon } from 'lucide-react';
import copy from 'copy-to-clipboard';
import linuxPng from '../../assets/os/linux.png';
import applePng from '../../assets/os/apple.png';
import windowsPng from '../../assets/os/win11.png';
import {
    AgentInstallLayout,
    ApiChooser,
    ConfigHelper,
    ServiceHelper,
    AGENT_NAME,
    AGENT_NAME_EXE,
} from './AgentInstallShared';
import { useAgentInstallConfig } from './useAgentInstallConfig';

const { Text } = Typography;
const { TabPane } = Tabs;

type OSType = 'linux-amd64' | 'linux-arm64' | 'linux-loong64' | 'darwin-amd64' | 'darwin-arm64' | 'windows-amd64' | 'windows-arm64';

interface OSConfig {
    name: string;
    icon: ReactElement;
    downloadUrl: string;
}

interface InstallStep {
    title: string;
    command: string;
}

const DEFAULT_OS: OSType = 'linux-amd64';

const AgentInstallManual = () => {
    const { message } = App.useApp();
    const [selectedOS, setSelectedOS] = useState<OSType>(DEFAULT_OS);
    const {
        apiKeys,
        selectedApiKey,
        setSelectedApiKey,
        loading,
        backendServerUrl,
        apiKeyOptions,
    } = useAgentInstallConfig();

    const osConfigs: Record<OSType, OSConfig> = useMemo(() => ({
        'linux-amd64': {
            name: 'Linux (amd64)',
            icon: <img src={linuxPng} alt="Linux" className="h-4 w-4" />,
            downloadUrl: '/api/agent/downloads/agent-linux-amd64',
        },
        'linux-arm64': {
            name: 'Linux (arm64)',
            icon: <img src={linuxPng} alt="Linux" className="h-4 w-4" />,
            downloadUrl: '/api/agent/downloads/agent-linux-arm64',
        },
        'linux-loong64': {
            name: 'Linux (loongarch64)',
            icon: <img src={linuxPng} alt="Linux" className="h-4 w-4" />,
            downloadUrl: '/api/agent/downloads/agent-linux-loong64',
        },
        'darwin-amd64': {
            name: 'macOS (amd64)',
            icon: <img src={applePng} alt="macOS" className="h-4 w-4" />,
            downloadUrl: '/api/agent/downloads/agent-darwin-amd64',
        },
        'darwin-arm64': {
            name: 'macOS (arm64)',
            icon: <img src={applePng} alt="macOS" className="h-4 w-4" />,
            downloadUrl: '/api/agent/downloads/agent-darwin-arm64',
        },
        'windows-amd64': {
            name: 'Windows (amd64)',
            icon: <img src={windowsPng} alt="Windows" className="h-4 w-4" />,
            downloadUrl: '/api/agent/downloads/agent-windows-amd64.exe',
        },
        'windows-arm64': {
            name: 'Windows (arm64)',
            icon: <img src={windowsPng} alt="Windows" className="h-4 w-4" />,
            downloadUrl: '/api/agent/downloads/agent-windows-arm64.exe',
        },
    }), []);

    const copyToClipboard = (text: string) => {
        copy(text);
        message.success('已复制到剪贴板');
    };

    const getManualInstallSteps = (os: OSType): InstallStep[] => {
        const config = osConfigs[os];

        if (os.startsWith('windows')) {
            return [
                {
                    title: '1. 下载探针',
                    command: `# 使用 PowerShell 下载
Invoke-WebRequest -Uri "${backendServerUrl}${config.downloadUrl}?key=${selectedApiKey}" -OutFile "${AGENT_NAME_EXE}"

# 或者使用浏览器直接下载
# ${backendServerUrl}${config.downloadUrl}?key=${selectedApiKey}`
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
wget "${backendServerUrl}${config.downloadUrl}?key=${selectedApiKey}" -O ${AGENT_NAME}

# 或使用 curl 下载
curl -L "${backendServerUrl}${config.downloadUrl}?key=${selectedApiKey}" -o ${AGENT_NAME}`
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
    };

    return (
        <AgentInstallLayout activeKey="manual">
            <Space direction="vertical" className="w-full">
                <ApiChooser
                    apiKeys={apiKeys}
                    selectedApiKey={selectedApiKey}
                    apiKeyOptions={apiKeyOptions}
                    loading={loading}
                    onSelectApiKey={setSelectedApiKey}
                />
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
                                                    icon={<CopyIcon className="h-4 w-4" />}
                                                    size="small"
                                                    style={{ margin: 0, padding: 0 }}
                                                    disabled={!selectedApiKey}
                                                >
                                                    复制
                                                </Button>
                                            </div>
                                        ))}
                                    </Space>
                                </Card>

                                <ServiceHelper os={key} />
                                <ConfigHelper />
                            </Space>
                        </TabPane>
                    ))}
                </Tabs>
            </Space>
        </AgentInstallLayout>
    );
};

export default AgentInstallManual;
