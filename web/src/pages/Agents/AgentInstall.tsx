import React, {type ReactElement, useEffect, useState} from 'react';
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

interface OSConfig {
    name: string;
    icon: ReactElement;
    downloadUrl: string;
}

const AgentInstall = () => {
    const [selectedOS, setSelectedOS] = useState<string>('linux');
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [selectedApiKey, setSelectedApiKey] = useState<string>('');

    const {message} = App.useApp();
    const serverUrl = window.location.origin;
    let navigate = useNavigate();

    // 加载API密钥列表
    useEffect(() => {
        const fetchApiKeys = async () => {
            try {
                const keys = await listApiKeys();
                const enabledKeys = keys.data?.items.filter(k => k.enabled);
                setApiKeys(enabledKeys);
                if (enabledKeys.length > 0) {
                    setSelectedApiKey(enabledKeys[0].key);
                }
            } catch (error) {
                console.error('Failed to load API keys:', error);
            }
        };
        fetchApiKeys();
    }, []);

    const osConfigs: Record<string, OSConfig> = {
        'linux': {
            name: 'Linux',
            icon: <img src={linuxPng} alt="Linux" className={'h-4 w-4'}/>,
            downloadUrl: '/api/agent/downloads/agent-linux-amd64',
        },
        'darwin': {
            name: 'macOS',
            icon: <img src={applePng} alt="macOS" className={'h-4 w-4'}/>,
            downloadUrl: '/api/agent/downloads/agent-darwin-amd64',
        },
        'windows': {
            name: 'Windows',
            icon: <img src={windowsPng} alt="Windows" className={'h-4 w-4'}/>,
            downloadUrl: '/api/agent/downloads/agent-windows-amd64.exe',
        },
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        message.success('已复制到剪贴板');
    };

    // 获取一键安装命令
    const getInstallCommand = (os: string) => {
        const token = selectedApiKey;

        if (os.startsWith('windows')) {
            // Windows 使用 PowerShell 手动安装
            const config = osConfigs[os];
            const agentName = 'pika-agent.exe';
            return `# Windows 安装方式（需要管理员权限）

# 1. 下载探针
Invoke-WebRequest -Uri "${serverUrl}${config.downloadUrl}" -OutFile "${agentName}"

# 2. 运行注册命令
.\\${agentName} register --endpoint "${serverUrl}" --token "${token}"`;
        } else {
            // Linux/macOS 使用一键安装脚本
            return `curl -fsSL ${serverUrl}/api/agent/install.sh?token=${token} | sudo bash`;
        }
    };

    // 常用命令
    const getCommonCommands = (os: string) => {
        const agentCmd = os.startsWith('windows') ? '.\\pika-agent.exe' : 'pika-agent';
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

    return (
        <div className="space-y-6">

            <div className="flex gap-2 items-center">
                <div className="text-sm cursor-pointer hover:underline"
                     onClick={() => navigate(-1)}
                >返回 |
                </div>
                <h1 className="text-2xl font-semibold text-gray-900">探针部署指南</h1>
            </div>

            {/* API Token 选择 */}
            <Card className="mb-6" size="small">
                <Space direction="vertical" className="w-full">
                    <Text strong>选择 API Token：</Text>
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
                            options={apiKeys.map(key => ({
                                label: `${key.name} (${key.key.substring(0, 8)}...)`,
                                value: key.key,
                            }))}
                        />
                    )}
                </Space>
            </Card>

            <Tabs
                activeKey={selectedOS}
                onChange={setSelectedOS}
                size="large"
            >
                {Object.entries(osConfigs).map(([key, config]) => (
                    <TabPane
                        tab={
                            <div className={'flex items-center gap-2'}>
                                {config.icon}
                                <span>{config.name}</span>
                            </div>
                        }
                        key={key}
                    >
                        <Space direction={'vertical'} className={'w-full'}>
                            <Card type="inner" title={key.startsWith('windows') ? '安装步骤' : '一键安装'}>
                                {!key.startsWith('windows') && (
                                    <Paragraph type="secondary" className="mb-3">
                                        脚本会自动检测系统架构并下载对应版本的探针，然后完成注册和安装。
                                    </Paragraph>
                                )}
                                <pre className="m-0 overflow-auto text-sm">
                                    <code>{getInstallCommand(key)}</code>
                                </pre>
                                <Button
                                    type={'link'}
                                    onClick={() => {
                                        copyToClipboard(getInstallCommand(key));
                                    }}
                                    icon={<CopyIcon className={'h-4 w-4'}/>}
                                    style={{margin: 0, padding: 0}}
                                >
                                    复制命令
                                </Button>
                            </Card>

                            {/* 常用命令 */}
                            <Card type="inner" title="服务管理命令">
                                <Paragraph type="secondary" className="mb-3">
                                    注册完成后，您可以使用以下命令管理探针服务：
                                </Paragraph>
                                <pre className="m-0 overflow-auto text-sm">
                                            <code>{getCommonCommands(key)}</code>
                                        </pre>
                            </Card>

                            {/* 参数说明 */}
                            <Card type="inner" title="配置文件说明">
                                <Paragraph>
                                    注册完成后，配置文件会保存在:
                                </Paragraph>
                                <ul className="space-y-2">
                                    <li>
                                        <Text code>~/.pika/agent.yaml</Text> - 配置文件路径
                                    </li>
                                    <li>
                                        您可以手动编辑此文件来修改配置，修改后需要重启服务生效
                                    </li>
                                </ul>
                            </Card>
                        </Space>
                    </TabPane>
                ))}
            </Tabs>
        </div>
    );
};

export default AgentInstall;
