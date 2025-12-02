import {Alert, Card, Descriptions, Empty, List, Space, Table, Tabs, Tag} from 'antd';
import {
    Activity,
    AlertOctagon,
    AlertTriangle,
    Calendar,
    CheckCircle,
    Cpu,
    FileText,
    LogIn,
    MinusCircle,
    Network,
    PlayCircle,
    Server,
    Settings,
    Shield,
    Users,
    XCircle
} from 'lucide-react';
import type {ProcessInfo, VPSAuditResult} from '@/api/agent.ts';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import React from 'react';

dayjs.extend(duration);

interface RiskItem {
    level: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
}

interface AuditResultViewProps {
    result: VPSAuditResult;
}

const AuditResultView = ({result}: AuditResultViewProps) => {

    const analyzeRisks = (result: VPSAuditResult): RiskItem[] => {
        const risks: RiskItem[] = [];

        // 1. Suspicious Processes
        if (result.assetInventory.processAssets?.suspiciousProcesses?.length) {
            risks.push({
                level: 'critical',
                title: '发现可疑进程',
                description: `发现 ${result.assetInventory.processAssets.suspiciousProcesses.length} 个可执行文件已删除的进程`
            });
        }

        // 2. Tmp Executables
        if (result.assetInventory.fileAssets?.tmpExecutables?.length) {
            risks.push({
                level: 'high',
                title: '发现临时目录可执行文件',
                description: `在 /tmp 或 /dev/shm 目录下发现 ${result.assetInventory.fileAssets.tmpExecutables.length} 个可执行文件`
            });
        }

        // 3. Root Equivalent Users
        const rootEquivUsers = result.assetInventory.userAssets?.systemUsers?.filter(u => u.isRootEquiv);
        if (rootEquivUsers?.length) {
            risks.push({
                level: 'high',
                title: '存在Root权限用户',
                description: `发现 ${rootEquivUsers.length} 个UID为0的非root用户: ${rootEquivUsers.map(u => u.username).join(', ')}`
            });
        }

        // 4. Loginable Users with No Password (排除系统用户)
        const systemUsernames = ['sync', 'shutdown', 'halt', 'daemon', 'bin', 'sys', 'adm', 'games', 'ftp', 'nobody', 'systemd-network', 'systemd-resolve'];
        const noPwdUsers = result.assetInventory.userAssets?.systemUsers?.filter(u => {
            // 必须可登录且无密码
            if (!u.isLoginable || u.hasPassword) return false;

            // 排除系统用户 (UID < 1000)
            const uid = parseInt(u.uid);
            if (!isNaN(uid) && uid < 1000) return false;

            // 排除常见系统用户名
            if (systemUsernames.includes(u.username)) return false;

            return true;
        });

        if (noPwdUsers?.length) {
            risks.push({
                level: 'medium',
                title: '存在无密码可登录用户',
                description: `发现 ${noPwdUsers.length} 个普通用户无密码且可登录: ${noPwdUsers.map(u => u.username).join(', ')}`
            });
        }

        // 5. Failed Login Attempts
        const failedLogins = result.assetInventory.loginAssets?.failedLogins?.length || 0;
        if (failedLogins > 100) {
            risks.push({
                level: 'high',
                title: '存在大量失败登录尝试',
                description: `发现 ${failedLogins} 次失败登录尝试，可能存在暴力破解攻击`
            });
        } else if (failedLogins > 50) {
            risks.push({
                level: 'medium',
                title: '存在失败登录尝试',
                description: `发现 ${failedLogins} 次失败登录尝试，建议检查日志`
            });
        }

        // 6. SSH Configuration Security Issues
        const sshConfig = result.assetInventory.userAssets?.sshConfig;
        if (sshConfig) {
            // 允许空密码登录
            if (sshConfig.permitEmptyPasswords) {
                risks.push({
                    level: 'critical',
                    title: 'SSH允许空密码登录',
                    description: 'SSH配置允许空密码登录，严重的安全隐患！'
                });
            }

            // 使用旧协议
            if (sshConfig.protocol && sshConfig.protocol.includes('1')) {
                risks.push({
                    level: 'high',
                    title: 'SSH使用不安全的协议版本',
                    description: 'SSH配置使用Protocol 1，存在安全漏洞，应仅使用Protocol 2'
                });
            }

            // 允许root密码登录
            if (sshConfig.permitRootLogin === 'yes' && sshConfig.passwordAuthentication) {
                risks.push({
                    level: 'medium',
                    title: 'SSH允许root密码登录',
                    description: 'SSH配置允许root用户使用密码登录，建议配合fail2ban等防护措施，或设置为 prohibit-password'
                });
            }

            // 仅使用密码认证，没有启用公钥认证
            if (sshConfig.passwordAuthentication && !sshConfig.pubkeyAuthentication) {
                risks.push({
                    level: 'low',
                    title: 'SSH仅启用密码认证',
                    description: 'SSH配置仅启用密码认证，建议同时启用公钥认证以提高安全性'
                });
            }
        }

        return risks;
    };

    const risks = analyzeRisks(result);

    const getThreatLevelTag = (level: string) => {
        const configs = {
            critical: {color: 'error', text: '危急'},
            high: {color: 'error', text: '高危'},
            medium: {color: 'warning', text: '中危'},
            low: {color: 'success', text: '低危'},
        };
        const config = configs[level as keyof typeof configs] || {color: 'default', text: level};
        return <Tag color={config.color} className="text-lg px-3 py-1">{config.text}</Tag>;
    };

    const formatUptime = (seconds: number) => {
        const d = dayjs.duration(seconds, 'seconds');
        const days = Math.floor(d.asDays());
        const hours = d.hours();
        const minutes = d.minutes();
        return `${days}天 ${hours}小时 ${minutes}分钟`;
    };

    const portColumns = [
        {title: '协议', dataIndex: 'protocol', key: 'protocol', width: 80},
        {
            title: '地址:端口',
            key: 'address',
            render: (record: any) => `${record.address}:${record.port}`,
        },
        {title: '进程', dataIndex: 'processName', key: 'processName'},
        {title: 'PID', dataIndex: 'processPid', key: 'processPid', width: 80},
    ];

    const connectionColumns = [
        {title: '协议', dataIndex: 'protocol', key: 'protocol', width: 80},
        {
            title: '本地地址',
            key: 'local',
            render: (record: any) => `${record.localAddr || ''}:${record.localPort || ''}`,
        },
        {
            title: '远程地址',
            key: 'remote',
            render: (record: any) => `${record.remoteAddr || ''}:${record.remotePort || ''}`,
        },
        {title: '状态', dataIndex: 'state', key: 'state', width: 120},
        {title: 'PID', dataIndex: 'processPid', key: 'processPid', width: 80},
        {title: '进程', dataIndex: 'processName', key: 'processName'},
    ];

    const processColumns = [
        {title: 'PID', dataIndex: 'pid', key: 'pid', width: 80},
        {title: '进程名', dataIndex: 'name', key: 'name'},
        {title: '用户', dataIndex: 'username', key: 'username', width: 100},
        {
            title: 'CPU %',
            dataIndex: 'cpuPercent',
            key: 'cpuPercent',
            width: 100,
            render: (val: number) => `${val.toFixed(2)}%`
        },
        {
            title: '内存 %',
            dataIndex: 'memPercent',
            key: 'memPercent',
            width: 100,
            render: (val: number) => `${val.toFixed(2)}%`
        },
        {
            title: '内存 (MB)',
            dataIndex: 'memoryMb',
            key: 'memoryMb',
            width: 120,
            render: (val: number) => `${val} MB`
        },
    ];

    const userColumns = [
        {title: '用户名', dataIndex: 'username', key: 'username'},
        {title: 'UID', dataIndex: 'uid', key: 'uid', width: 80},
        {title: 'GID', dataIndex: 'gid', key: 'gid', width: 80},
        {title: 'Shell', dataIndex: 'shell', key: 'shell'},
        {
            title: '可登录',
            dataIndex: 'isLoginable',
            key: 'isLoginable',
            width: 100,
            render: (val: boolean) => val ? <Tag color="success">是</Tag> : <Tag color="default">否</Tag>
        },
        {
            title: 'Root权限',
            dataIndex: 'isRootEquiv',
            key: 'isRootEquiv',
            width: 100,
            render: (val: boolean) => val ? <Tag color="error">是</Tag> : <Tag color="default">否</Tag>
        },
    ];

    const loginRecordColumns = [
        {title: '用户名', dataIndex: 'username', key: 'username'},
        {title: 'IP地址', dataIndex: 'ip', key: 'ip', width: 150},
        {title: '归属地', dataIndex: 'location', key: 'location', width: 200, ellipsis: true},
        {title: '终端', dataIndex: 'terminal', key: 'terminal', width: 100},
        {
            title: '登录时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            render: (val: number) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
            width: 180,
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 80,
            render: (status: string) => status === 'success' ?
                <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>
        },
    ];

    const currentSessionColumns = [
        {title: '用户名', dataIndex: 'username', key: 'username', width: 120},
        {title: 'IP地址', dataIndex: 'ip', key: 'ip', width: 150},
        {title: '归属地', dataIndex: 'location', key: 'location', width: 200, ellipsis: true},
        {title: '终端', dataIndex: 'terminal', key: 'terminal', width: 100},
        {
            title: '登录时间',
            dataIndex: 'loginTime',
            key: 'loginTime',
            render: (val: number) => dayjs(val).format('YYYY-MM-DD HH:mm:ss')
        },
        {
            title: '空闲时间',
            dataIndex: 'idleTime',
            key: 'idleTime',
            width: 100,
            render: (seconds: number) => {
                if (seconds === 0) return '-';
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
            }
        },
    ];

    const sshKeyColumns = [
        {title: '用户', dataIndex: 'username', key: 'username', width: 120},
        {title: '密钥类型', dataIndex: 'keyType', key: 'keyType', width: 120},
        {title: '指纹', dataIndex: 'fingerprint', key: 'fingerprint', ellipsis: true},
        {title: '注释', dataIndex: 'comment', key: 'comment', ellipsis: true},
        {
            title: '添加时间',
            dataIndex: 'addedTime',
            key: 'addedTime',
            width: 180,
            render: (val: number) => val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-'
        },
    ];

    const sudoUserColumns = [
        {title: '用户名', dataIndex: 'username', key: 'username', width: 150},
        {
            title: '免密码',
            dataIndex: 'noPasswd',
            key: 'noPasswd',
            width: 100,
            render: (val: boolean) => val ? <Tag color="warning">是</Tag> : <Tag color="default">否</Tag>
        },
        {title: '规则', dataIndex: 'rules', key: 'rules', ellipsis: true},
    ];

    const cronColumns = [
        {title: '用户', dataIndex: 'user', key: 'user', width: 100},
        {title: '计划', dataIndex: 'schedule', key: 'schedule', width: 150},
        {title: '命令', dataIndex: 'command', key: 'command', ellipsis: true},
        {title: '文件路径', dataIndex: 'filePath', key: 'filePath', width: 200, ellipsis: true},
    ];

    const [showAllServices, setShowAllServices] = React.useState(false);

    const serviceColumns = [
        {title: '服务名', dataIndex: 'name', key: 'name'},
        {
            title: '状态',
            dataIndex: 'state',
            key: 'state',
            width: 100,
            render: (state: string) => {
                const color = state === 'active' ? 'success' : state === 'failed' ? 'error' : 'default';
                return <Tag color={color}>{state || '-'}</Tag>;
            }
        },
        {
            title: '开机启动',
            dataIndex: 'enabled',
            key: 'enabled',
            width: 100,
            render: (val: boolean) => val ? <Tag color="success">是</Tag> : <Tag color="default">否</Tag>
        },
        {title: '启动命令', dataIndex: 'execStart', key: 'execStart', ellipsis: true},
        {title: '描述', dataIndex: 'description', key: 'description', ellipsis: true},
    ];

    // 过滤 systemd 服务
    const filteredServices = React.useMemo(() => {
        const services = result.assetInventory.fileAssets?.systemdServices || [];
        if (showAllServices) {
            return services;
        }
        return services.filter(s => s.state === 'active');
    }, [result.assetInventory.fileAssets?.systemdServices, showAllServices]);

    const startupScriptColumns = [
        {title: '类型', dataIndex: 'type', key: 'type', width: 150},
        {title: '名称', dataIndex: 'name', key: 'name'},
        {title: '路径', dataIndex: 'path', key: 'path', ellipsis: true},
        {
            title: '启用',
            dataIndex: 'enabled',
            key: 'enabled',
            width: 80,
            render: (val: boolean) => val ? <Tag color="success">是</Tag> : <Tag color="default">否</Tag>
        },
    ];

    const moduleColumns = [
        {title: '模块名', dataIndex: 'name', key: 'name'},
        {title: '大小', dataIndex: 'size', key: 'size', width: 120, render: (val: number) => `${val} bytes`},
        {title: '被引用次数', dataIndex: 'usedBy', key: 'usedBy', width: 120},
    ];

    return (
        <Space direction="vertical" style={{width: '100%'}}>
            {/* 风险概览 */}
            {risks.length > 0 && (
                <Card
                    title={<Space><AlertOctagon size={18} className="text-red-500"/><span
                        className="font-semibold text-red-500">风险概览</span></Space>}
                    className="border-red-200 bg-red-50"
                >
                    <List
                        dataSource={risks}
                        renderItem={item => (
                            <List.Item>
                                <List.Item.Meta
                                    avatar={getThreatLevelTag(item.level)}
                                    title={<span className="font-bold">{item.title}</span>}
                                    description={item.description}
                                />
                            </List.Item>
                        )}
                    />
                </Card>
            )}

            {/* 系统信息 */}
            <Card
                title={<Space><Server size={18}/><span className="font-semibold">系统信息</span></Space>}
                variant={'outlined'}
            >
                <Descriptions column={{xs: 1, sm: 2}} bordered>
                    <Descriptions.Item label="主机名">
                        {result.systemInfo.hostname}
                    </Descriptions.Item>
                    <Descriptions.Item label="操作系统">
                        {result.systemInfo.os}
                    </Descriptions.Item>
                    <Descriptions.Item label="内核版本">
                        {result.systemInfo.kernelVersion}
                    </Descriptions.Item>
                    <Descriptions.Item label="运行时长">
                        {formatUptime(result.systemInfo.uptime)}
                    </Descriptions.Item>
                    {result.systemInfo.publicIP && (
                        <Descriptions.Item label="公网IP" span={2}>
                            {result.systemInfo.publicIP}
                        </Descriptions.Item>
                    )}
                    <Descriptions.Item label="采集时间" span={2}>
                        {dayjs(result.startTime).format('YYYY-MM-DD HH:mm:ss')} - {dayjs(result.endTime).format('HH:mm:ss')}
                        <span className="ml-2 text-gray-500">
                            (耗时: {((result.endTime - result.startTime) / 1000).toFixed(2)}秒)
                        </span>
                    </Descriptions.Item>
                </Descriptions>
            </Card>


            {/* 资产清单 */}
            <Card
                title={<Space><Activity size={18}/><span className="font-semibold">资产清单</span></Space>}
                variant={'outlined'}
            >
                <Tabs
                    items={[
                        {
                            key: 'network',
                            label: <Space><Network size={16}/>网络资产</Space>,
                            children: (
                                <Space direction="vertical" size="middle" style={{width: '100%'}}>
                                    <Card size="small" title="监听端口">
                                        {result.assetInventory.networkAssets?.listeningPorts?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.networkAssets.listeningPorts}
                                                columns={portColumns}
                                                rowKey={(record, index) => `${record.address}:${record.port}-${index}`}
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无数据"/>
                                        )}
                                    </Card>
                                    <Card size="small" title="活跃连接">
                                        {result.assetInventory.networkAssets?.connections?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.networkAssets.connections}
                                                columns={connectionColumns}
                                                rowKey={(record, index) => `${record.localAddr}:${record.localPort}-${record.remoteAddr}:${record.remotePort}-${index}`}
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无数据"/>
                                        )}
                                    </Card>
                                    {result.statistics?.networkStats && (
                                        <Card size="small" title="网络统计">
                                            <Descriptions size="small" column={3}>
                                                <Descriptions.Item label="监听端口总数">
                                                    {result.statistics.networkStats.totalListeningPorts || 0}
                                                </Descriptions.Item>
                                                <Descriptions.Item label="公网端口">
                                                    {result.statistics.networkStats.publicListeningPorts || 0}
                                                </Descriptions.Item>
                                                <Descriptions.Item label="活跃连接">
                                                    {result.statistics.networkStats.activeConnections || 0}
                                                </Descriptions.Item>
                                            </Descriptions>
                                        </Card>
                                    )}
                                </Space>
                            ),
                        },
                        {
                            key: 'process',
                            label: <Space><Cpu size={16}/>进程资产</Space>,
                            children: (
                                <Space direction="vertical" size="middle" style={{width: '100%'}}>
                                    {result.assetInventory.processAssets?.suspiciousProcesses && result.assetInventory.processAssets.suspiciousProcesses.length > 0 && (
                                        <Alert
                                            message="发现可疑进程"
                                            description="以下进程的可执行文件已被删除，这通常是恶意软件的迹象（或者是进程更新中）。"
                                            type="error"
                                            showIcon
                                        />
                                    )}
                                    <Card size="small" title={<Space><AlertTriangle size={16}
                                                                                    className={result.assetInventory.processAssets?.suspiciousProcesses?.length ? "text-red-500" : ""}/>可疑进程</Space>}>
                                        {result.assetInventory.processAssets?.suspiciousProcesses?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.processAssets.suspiciousProcesses}
                                                columns={[
                                                    ...processColumns,
                                                    {
                                                        title: '异常信息',
                                                        key: 'issue',
                                                        render: (record: ProcessInfo) => record.exeDeleted ?
                                                            <Tag color="error">Exe已删除</Tag> : null
                                                    }
                                                ]}
                                                rowKey="pid"
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无发现"/>
                                        )}
                                    </Card>
                                    <Card size="small" title="TOP CPU进程">
                                        {result.assetInventory.processAssets?.topCpuProcesses?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.processAssets.topCpuProcesses}
                                                columns={processColumns}
                                                rowKey="pid"
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无数据"/>
                                        )}
                                    </Card>
                                    <Card size="small" title="TOP 内存进程">
                                        {result.assetInventory.processAssets?.topMemoryProcesses?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.processAssets.topMemoryProcesses}
                                                columns={processColumns}
                                                rowKey="pid"
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无数据"/>
                                        )}
                                    </Card>
                                </Space>
                            ),
                        },
                        {
                            key: 'user',
                            label: <Space><Users size={16}/>用户资产</Space>,
                            children: (
                                <Space direction="vertical" size="middle" style={{width: '100%'}}>
                                    <Card size="small" title="系统用户">
                                        {result.assetInventory.userAssets?.systemUsers?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.userAssets.systemUsers}
                                                columns={userColumns}
                                                rowKey="username"
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无数据"/>
                                        )}
                                    </Card>
                                    <Card size="small" title="SSH 密钥">
                                        {result.assetInventory.userAssets?.sshKeys?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.userAssets.sshKeys}
                                                columns={sshKeyColumns}
                                                rowKey={(record, index) => `${record.username}-${index}`}
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="未发现 SSH 密钥"/>
                                        )}
                                    </Card>
                                    <Card size="small" title="Sudo 用户">
                                        {result.assetInventory.userAssets?.sudoUsers?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.userAssets.sudoUsers}
                                                columns={sudoUserColumns}
                                                rowKey="username"
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="未发现 Sudo 用户"/>
                                        )}
                                    </Card>
                                    <Card size="small" title="当前登录会话">
                                        {result.assetInventory.userAssets?.currentLogins?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.userAssets.currentLogins}
                                                columns={currentSessionColumns}
                                                rowKey={(record, index) => `${record.username}-${record.terminal}-${index}`}
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无当前登录会话"/>
                                        )}
                                    </Card>
                                    {result.assetInventory.userAssets?.sshConfig && (
                                        <Card size="small" title="SSH 配置">
                                            <Descriptions size="small" column={2} bordered>
                                                <Descriptions.Item label="SSH端口">
                                                    {result.assetInventory.userAssets.sshConfig.port}
                                                    {result.assetInventory.userAssets.sshConfig.port !== 22 && (
                                                        <Tag color="warning" className="ml-2">非标准端口</Tag>
                                                    )}
                                                </Descriptions.Item>
                                                <Descriptions.Item label="Root登录">
                                                    {result.assetInventory.userAssets.sshConfig.permitRootLogin === 'yes' ? (
                                                        <Tag color="error">允许</Tag>
                                                    ) : result.assetInventory.userAssets.sshConfig.permitRootLogin === 'prohibit-password' ? (
                                                        <Tag color="success">仅密钥</Tag>
                                                    ) : (
                                                        <Tag color="success">禁止</Tag>
                                                    )}
                                                </Descriptions.Item>
                                                <Descriptions.Item label="密码认证">
                                                    {result.assetInventory.userAssets.sshConfig.passwordAuthentication ? (
                                                        <Tag color="warning">启用</Tag>
                                                    ) : (
                                                        <Tag color="success">禁用</Tag>
                                                    )}
                                                </Descriptions.Item>
                                                <Descriptions.Item label="公钥认证">
                                                    {result.assetInventory.userAssets.sshConfig.pubkeyAuthentication ? (
                                                        <Tag color="success">启用</Tag>
                                                    ) : (
                                                        <Tag color="warning">禁用</Tag>
                                                    )}
                                                </Descriptions.Item>
                                                <Descriptions.Item label="空密码登录">
                                                    {result.assetInventory.userAssets.sshConfig.permitEmptyPasswords ? (
                                                        <Tag color="error">允许</Tag>
                                                    ) : (
                                                        <Tag color="success">禁止</Tag>
                                                    )}
                                                </Descriptions.Item>
                                                <Descriptions.Item label="最大认证尝试">
                                                    {result.assetInventory.userAssets.sshConfig.maxAuthTries || '-'}
                                                </Descriptions.Item>
                                                {result.assetInventory.userAssets.sshConfig.protocol && (
                                                    <Descriptions.Item label="协议版本" span={2}>
                                                        {result.assetInventory.userAssets.sshConfig.protocol}
                                                        {result.assetInventory.userAssets.sshConfig.protocol.includes('1') && (
                                                            <Tag color="error" className="ml-2">不安全</Tag>
                                                        )}
                                                    </Descriptions.Item>
                                                )}
                                            </Descriptions>
                                        </Card>
                                    )}
                                </Space>
                            ),
                        },
                        {
                            key: 'file',
                            label: <Space><FileText size={16}/>文件资产</Space>,
                            children: (
                                <Space direction="vertical" size="middle" style={{width: '100%'}}>
                                    {result.assetInventory.fileAssets?.tmpExecutables && result.assetInventory.fileAssets.tmpExecutables.length > 0 && (
                                        <Alert
                                            message="发现临时目录可执行文件"
                                            description="在 /tmp 或 /dev/shm 目录发现可执行文件，这通常是恶意软件或webshell的特征。"
                                            type="error"
                                            showIcon
                                        />
                                    )}
                                    <Card size="small" title={<Space><AlertTriangle size={16}
                                                                                    className={result.assetInventory.fileAssets?.tmpExecutables?.length ? "text-red-500" : ""}/>临时目录可执行文件</Space>}>
                                        {result.assetInventory.fileAssets?.tmpExecutables?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.fileAssets.tmpExecutables}
                                                columns={[
                                                    {title: '路径', dataIndex: 'path', key: 'path'},
                                                    {
                                                        title: '大小',
                                                        dataIndex: 'size',
                                                        key: 'size',
                                                        render: (val: number) => `${(val / 1024).toFixed(2)} KB`
                                                    },
                                                    {
                                                        title: '修改时间',
                                                        dataIndex: 'modTime',
                                                        key: 'modTime',
                                                        render: (val: number) => dayjs(val).format('YYYY-MM-DD HH:mm:ss')
                                                    },
                                                    {title: '权限', dataIndex: 'permissions', key: 'permissions'},
                                                ]}
                                                rowKey="path"
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无发现"/>
                                        )}
                                    </Card>
                                    <Card size="small" title={<Space><Calendar size={16}/>定时任务</Space>}>
                                        {result.assetInventory.fileAssets?.cronJobs?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.fileAssets.cronJobs}
                                                columns={cronColumns}
                                                rowKey={(record, index) => `${record.user}-${index}`}
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无定时任务"/>
                                        )}
                                    </Card>
                                    <Card
                                        size="small"
                                        title={<Space><Settings size={16}/>Systemd服务</Space>}
                                        extra={
                                            <Space>
                                                <span className="text-gray-500 text-sm">
                                                    共 {result.assetInventory.fileAssets?.systemdServices?.length || 0} 个服务
                                                    {!showAllServices && ` (显示 ${filteredServices.length} 个活跃服务)`}
                                                </span>
                                                <button
                                                    onClick={() => setShowAllServices(!showAllServices)}
                                                    className="text-blue-500 hover:text-blue-700 text-sm"
                                                >
                                                    {showAllServices ? '仅显示活跃' : '显示全部'}
                                                </button>
                                            </Space>
                                        }
                                    >
                                        {filteredServices.length ? (
                                            <Table
                                                size="small"
                                                dataSource={filteredServices}
                                                columns={serviceColumns}
                                                rowKey="name"
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty
                                                description={showAllServices ? "无Systemd服务" : "无活跃的Systemd服务"}/>
                                        )}
                                    </Card>
                                    <Card size="small" title={<Space><PlayCircle size={16}/>启动脚本</Space>}>
                                        {result.assetInventory.fileAssets?.startupScripts?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.fileAssets.startupScripts}
                                                columns={startupScriptColumns}
                                                rowKey={(record, index) => `${record.path}-${index}`}
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无启动脚本"/>
                                        )}
                                    </Card>
                                </Space>
                            ),
                        },
                        {
                            key: 'login',
                            label: <Space><LogIn size={16}/>登录日志</Space>,
                            children: (
                                <Space direction="vertical" size="middle" style={{width: '100%'}}>
                                    {result.assetInventory.loginAssets?.failedLogins && result.assetInventory.loginAssets.failedLogins.length > 0 && (
                                        <Alert
                                            message="发现失败登录记录"
                                            description={`系统记录到 ${result.assetInventory.loginAssets.failedLogins.length} 次失败登录尝试，请检查是否存在暴力破解行为。`}
                                            type="warning"
                                            showIcon
                                        />
                                    )}
                                    <Card size="small" title="成功登录历史">
                                        {result.assetInventory.loginAssets?.successfulLogins?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.loginAssets.successfulLogins}
                                                columns={loginRecordColumns}
                                                rowKey={(record, index) => `success-${index}`}
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无登录历史"/>
                                        )}
                                    </Card>
                                    <Card size="small" title={<Space><AlertTriangle size={16}
                                                                                    className={result.assetInventory.loginAssets?.failedLogins?.length ? "text-yellow-500" : ""}/>失败登录历史</Space>}>
                                        {result.assetInventory.loginAssets?.failedLogins?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.loginAssets.failedLogins}
                                                columns={loginRecordColumns}
                                                rowKey={(record, index) => `failed-${index}`}
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无失败登录记录"/>
                                        )}
                                    </Card>
                                    <Card size="small" title="当前登录会话">
                                        {result.assetInventory.loginAssets?.currentSessions?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.loginAssets.currentSessions}
                                                columns={currentSessionColumns}
                                                rowKey={(record, index) => `session-${index}`}
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无当前登录会话"/>
                                        )}
                                    </Card>
                                </Space>
                            ),
                        },
                        {
                            key: 'kernel',
                            label: <Space><Shield size={16}/>内核信息</Space>,
                            children: (
                                <Space direction="vertical" size="middle" style={{width: '100%'}}>
                                    <Card size="small" title="已加载内核模块">
                                        {result.assetInventory.kernelAssets?.loadedModules?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.kernelAssets.loadedModules}
                                                columns={moduleColumns}
                                                rowKey="name"
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无已加载模块"/>
                                        )}
                                    </Card>
                                    {result.assetInventory.kernelAssets?.securityModules && (
                                        <Card size="small" title="安全模块状态">
                                            <Descriptions size="small" column={1}>
                                                <Descriptions.Item label="SELinux">
                                                    <Tag color={
                                                        result.assetInventory.kernelAssets.securityModules.selinuxStatus === 'enforcing' ? 'success' :
                                                            result.assetInventory.kernelAssets.securityModules.selinuxStatus === 'permissive' ? 'warning' : 'default'
                                                    }>
                                                        {result.assetInventory.kernelAssets.securityModules.selinuxStatus || 'unknown'}
                                                    </Tag>
                                                </Descriptions.Item>
                                                <Descriptions.Item label="AppArmor">
                                                    <Tag color={
                                                        result.assetInventory.kernelAssets.securityModules.apparmorStatus === 'enabled' ? 'success' : 'default'
                                                    }>
                                                        {result.assetInventory.kernelAssets.securityModules.apparmorStatus || 'unknown'}
                                                    </Tag>
                                                </Descriptions.Item>
                                                <Descriptions.Item label="Secure Boot">
                                                    <Tag color={
                                                        result.assetInventory.kernelAssets.securityModules.secureBootState === 'enabled' ? 'success' : 'default'
                                                    }>
                                                        {result.assetInventory.kernelAssets.securityModules.secureBootState || 'unknown'}
                                                    </Tag>
                                                </Descriptions.Item>
                                            </Descriptions>
                                        </Card>
                                    )}
                                    {result.assetInventory.kernelAssets?.kernelParameters && (
                                        <Card size="small" title="关键内核参数">
                                            <Descriptions size="small" column={1}>
                                                {Object.entries(result.assetInventory.kernelAssets.kernelParameters).map(([key, value]) => (
                                                    <Descriptions.Item key={key} label={key}>
                                                        <code>{value}</code>
                                                    </Descriptions.Item>
                                                ))}
                                            </Descriptions>
                                        </Card>
                                    )}
                                </Space>
                            ),
                        },
                    ]}
                />
            </Card>

            {/* 采集警告 */}
            {result.collectWarnings && result.collectWarnings.length > 0 && (
                <Alert
                    type="warning"
                    message="采集警告"
                    description={
                        <ul className="list-disc pl-5">
                            {result.collectWarnings.map((warning, index) => (
                                <li key={index}>{warning}</li>
                            ))}
                        </ul>
                    }
                />
            )}
        </Space>
    );
};

export default AuditResultView;
