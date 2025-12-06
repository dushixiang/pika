import {useRef, useState} from 'react';
import type {ActionType, ProColumns} from '@ant-design/pro-components';
import {ProTable} from '@ant-design/pro-components';
import {App, Button, Divider, Input, Space, Tag, Tooltip} from 'antd';
import {PageHeader} from '@/components';
import {Globe, Plus, Settings} from 'lucide-react';
import dayjs from 'dayjs';
import type {DDNSConfig} from '@/types';
import {deleteDDNSConfig, disableDDNSConfig, enableDDNSConfig, getDDNSConfigs,} from '@/api/ddns';
import {getErrorMessage} from '@/lib/utils';
import DDNSModal from './components/DDNSModal';
import RecordsDrawer from './components/RecordsDrawer';
import DNSProviderModal from './components/DNSProviderModal';

const DDNSPage = () => {
    const {message, modal} = App.useApp();
    const actionRef = useRef<ActionType>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [recordsDrawerOpen, setRecordsDrawerOpen] = useState(false);
    const [providerModalOpen, setProviderModalOpen] = useState(false);
    const [selectedConfig, setSelectedConfig] = useState<DDNSConfig | null>(null);
    const [keyword, setKeyword] = useState('');

    const handleCreate = () => {
        setSelectedConfig(null);
        setModalOpen(true);
    };

    const handleUpdate = (config: DDNSConfig) => {
        setSelectedConfig(config);
        setModalOpen(true);
    };

    const handleViewRecords = (config: DDNSConfig) => {
        setSelectedConfig(config);
        setRecordsDrawerOpen(true);
    };

    const handleToggleStatus = async (config: DDNSConfig) => {
        try {
            if (config.enabled) {
                await disableDDNSConfig(config.id);
                message.success('已禁用');
            } else {
                await enableDDNSConfig(config.id);
                message.success('已启用');
            }
            actionRef.current?.reload();
        } catch (error: unknown) {
            message.error(getErrorMessage(error, '操作失败'));
        }
    };

    const handleDelete = (config: DDNSConfig) => {
        modal.confirm({
            title: '删除 DDNS 配置',
            content: `确定要删除 DDNS 配置"${config.name}"吗？删除后将无法恢复。`,
            okButtonProps: {danger: true},
            onOk: async () => {
                try {
                    await deleteDDNSConfig(config.id);
                    message.success('删除成功');
                    actionRef.current?.reload();
                } catch (error: unknown) {
                    message.error(getErrorMessage(error, '删除失败'));
                }
            },
        });
    };

    const providerNames: Record<string, string> = {
        aliyun: '阿里云',
        tencentcloud: '腾讯云',
        cloudflare: 'Cloudflare',
        huaweicloud: '华为云',
    };

    const columns: ProColumns<DDNSConfig>[] = [
        {
            title: '配置名称',
            dataIndex: 'name',
            render: (_, record) => (
                <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-500"/>
                    <span className="font-medium text-gray-900">{record.name}</span>
                </div>
            ),
        },
        {
            title: 'DNS 服务商',
            dataIndex: 'provider',
            width: 120,
            render: (provider: string) => (
                <Tag color="blue">{providerNames[provider] || provider}</Tag>
            ),
        },
        {
            title: '域名',
            key: 'domains',
            width: 250,
            render: (_, record) => {
                const allDomains = [
                    ...((record.domainsIpv4 || []).map(d => ({domain: d, type: 'IPv4'}))),
                    ...((record.domainsIpv6 || []).map(d => ({domain: d, type: 'IPv6'})))
                ];
                return (
                    <div className="flex flex-wrap gap-1">
                        {allDomains.slice(0, 2).map((item, index) => (
                            <Tag key={index} color={item.type === 'IPv4' ? 'blue' : 'cyan'}>
                                {item.domain}
                            </Tag>
                        ))}
                        {allDomains.length > 2 && (
                            <Tooltip
                                title={allDomains.slice(2).map(item => `${item.domain} (${item.type})`).join(', ')}>
                                <Tag>+{allDomains.length - 2}</Tag>
                            </Tooltip>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'IP 配置',
            key: 'ipConfig',
            width: 150,
            render: (_, record) => (
                <Space size={4}>
                    {record.enableIpv4 && <Tag color="green">IPv4</Tag>}
                    {record.enableIpv6 && <Tag color="cyan">IPv6</Tag>}
                </Space>
            ),
        },
        {
            title: '状态',
            dataIndex: 'enabled',
            width: 80,
            render: (enabled: boolean) => (
                <Tag color={enabled ? 'green' : 'red'}>
                    {enabled ? '启用' : '禁用'}
                </Tag>
            ),
        },
        {
            title: '更新时间',
            dataIndex: 'updatedAt',
            width: 180,
            render: (timestamp: number) =>
                dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss'),
        },
        {
            title: '操作',
            valueType: 'option',
            width: 200,
            render: (_, record) => [
                <Button
                    key="records"
                    type="link"
                    size="small"
                    style={{margin: 0, padding: 0}}
                    onClick={() => handleViewRecords(record)}
                >
                    记录
                </Button>,
                <Button
                    key="toggle"
                    type="link"
                    size="small"
                    style={{margin: 0, padding: 0}}
                    onClick={() => handleToggleStatus(record)}
                >
                    {record.enabled ? '禁用' : '启用'}
                </Button>,
                <Button
                    key="edit"
                    type="link"
                    size="small"
                    style={{margin: 0, padding: 0}}
                    onClick={() => handleUpdate(record)}
                >
                    编辑
                </Button>,
                <Button
                    key="delete"
                    type="link"
                    size="small"
                    style={{margin: 0, padding: 0}}
                    danger
                    onClick={() => handleDelete(record)}
                >
                    删除
                </Button>,
            ],
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="DDNS 配置管理"
                description="管理动态 DNS 配置，支持阿里云、腾讯云、Cloudflare、华为云等服务商，自动更新域名解析记录"
                actions={[
                    {
                        key: 'provider',
                        label: 'DNS Provider',
                        icon: <Settings size={16}/>,
                        type: 'primary',
                        onClick: () => setProviderModalOpen(true),
                    },
                ]}
            />

            <Divider/>

            <ProTable<DDNSConfig>
                columns={columns}
                rowKey="id"
                actionRef={actionRef}
                search={false}
                params={{keyword}}
                pagination={{
                    defaultPageSize: 10,
                    showSizeChanger: true,
                }}
                toolBarRender={() => [
                    <Input.Search
                        key="search"
                        placeholder="按配置名称搜索"
                        allowClear
                        onSearch={(value) => {
                            setKeyword(value.trim());
                            actionRef.current?.reload();
                        }}
                        style={{width: 260}}
                    />,
                    <Button key="add" type="primary" icon={<Plus size={16}/>} onClick={handleCreate}>
                        新建配置
                    </Button>,
                ]}
                request={async (params) => {
                    const {current = 1, pageSize = 10, keyword: kw = ''} = params;
                    try {
                        const response = await getDDNSConfigs(current, pageSize, kw as string | undefined);
                        return {
                            data: response.data.items || [],
                            success: true,
                            total: response.data.total,
                        };
                    } catch (error: unknown) {
                        message.error(getErrorMessage(error, '获取 DDNS 配置列表失败'));
                        return {
                            data: [],
                            success: false,
                        };
                    }
                }}
            />

            <DDNSModal
                open={modalOpen}
                id={selectedConfig?.id}
                config={selectedConfig || undefined}
                onCancel={() => {
                    setModalOpen(false);
                    setSelectedConfig(null);
                }}
                onSuccess={() => {
                    setModalOpen(false);
                    setSelectedConfig(null);
                    actionRef.current?.reload();
                }}
            />

            {selectedConfig && (
                <RecordsDrawer
                    open={recordsDrawerOpen}
                    config={selectedConfig}
                    onClose={() => {
                        setRecordsDrawerOpen(false);
                        setSelectedConfig(null);
                    }}
                />
            )}

            <DNSProviderModal
                open={providerModalOpen}
                onCancel={() => setProviderModalOpen(false)}
                onSuccess={() => {
                    // Provider 配置更新后，可能需要刷新 DDNS 列表
                    actionRef.current?.reload();
                }}
            />
        </div>
    );
};

export default DDNSPage;
