import {Card, Collapse, List, Space, Tag, Descriptions, Tabs, Table, Empty, Alert} from 'antd';
import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    MinusCircle,
    Server,
    Network,
    Cpu,
    Users,
    FileText,
    Shield,
    Activity,
    Calendar,
    Settings,
    PlayCircle
} from 'lucide-react';
import type {VPSAuditResult, VPSAuditAnalysis} from '../../api/agent';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

const {Panel} = Collapse;

interface AuditResultViewProps {
    result: VPSAuditResult;
}

const AuditResultView = ({result}: AuditResultViewProps) => {
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pass':
                return <CheckCircle size={16} className="text-green-500"/>;
            case 'fail':
                return <XCircle size={16} className="text-red-500"/>;
            case 'warn':
                return <AlertTriangle size={16} className="text-yellow-500"/>;
            case 'skip':
                return <MinusCircle size={16} className="text-gray-400"/>;
            default:
                return null;
        }
    };

    const getStatusTag = (status: string) => {
        const configs = {
            pass: {color: 'success', text: '通过'},
            fail: {color: 'error', text: '失败'},
            warn: {color: 'warning', text: '警告'},
            skip: {color: 'default', text: '跳过'},
        };
        const config = configs[status as keyof typeof configs] || {color: 'default', text: status};
        return <Tag color={config.color}>{config.text}</Tag>;
    };

    const getSeverityTag = (severity?: string) => {
        if (!severity) return null;
        const configs = {
            high: {color: 'error', text: '高危'},
            medium: {color: 'warning', text: '中危'},
            low: {color: 'default', text: '低危'},
        };
        const config = configs[severity as keyof typeof configs];
        return config ? <Tag color={config.color}>{config.text}</Tag> : null;
    };

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
        {
            title: '公网暴露',
            dataIndex: 'isPublic',
            key: 'isPublic',
            width: 100,
            render: (isPublic: boolean) => isPublic ?
                <Tag color="warning">是</Tag> : <Tag color="default">否</Tag>
        },
        {title: '进程', dataIndex: 'processName', key: 'processName'},
        {title: 'PID', dataIndex: 'processPid', key: 'processPid', width: 80},
    ];

    const connectionColumns = [
        {title: '协议', dataIndex: 'protocol', key: 'protocol', width: 80},
        {
            title: '本地地址',
            key: 'local',
            render: (record: any) => `${record.laddr?.ip || ''}:${record.laddr?.port || ''}`,
        },
        {
            title: '远程地址',
            key: 'remote',
            render: (record: any) => `${record.raddr?.ip || ''}:${record.raddr?.port || ''}`,
        },
        {title: '状态', dataIndex: 'status', key: 'status', width: 120},
        {title: 'PID', dataIndex: 'pid', key: 'pid', width: 80},
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

    const cronColumns = [
        {title: '用户', dataIndex: 'user', key: 'user', width: 100},
        {title: '计划', dataIndex: 'schedule', key: 'schedule', width: 150},
        {title: '命令', dataIndex: 'command', key: 'command', ellipsis: true},
        {title: '文件路径', dataIndex: 'filePath', key: 'filePath', width: 200, ellipsis: true},
    ];

    const serviceColumns = [
        {title: '服务名', dataIndex: 'name', key: 'name'},
        {title: '状态', dataIndex: 'state', key: 'state', width: 100},
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
        <Space direction="vertical" size="large" style={{width: '100%'}}>
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
                                                rowKey={(record, index) => `${record.laddr?.ip}:${record.laddr?.port}-${record.raddr?.ip}:${record.raddr?.port}-${index}`}
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
                            ),
                        },
                        {
                            key: 'file',
                            label: <Space><FileText size={16}/>文件资产</Space>,
                            children: (
                                <Space direction="vertical" size="middle" style={{width: '100%'}}>
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
                                    <Card size="small" title={<Space><Settings size={16}/>Systemd服务</Space>}>
                                        {result.assetInventory.fileAssets?.systemdServices?.length ? (
                                            <Table
                                                size="small"
                                                dataSource={result.assetInventory.fileAssets.systemdServices}
                                                columns={serviceColumns}
                                                rowKey="name"
                                                pagination={false}
                                            />
                                        ) : (
                                            <Empty description="无Systemd服务"/>
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
