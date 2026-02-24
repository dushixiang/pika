import {useEffect, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {App, Button, Divider, Dropdown, Input, Space, Table, Tag, Tooltip} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import type {MenuProps} from 'antd';
import {PageHeader} from '@admin/components';
import {Globe, MoreVertical, Plus, Settings} from 'lucide-react';
import dayjs from 'dayjs';
import type {DDNSConfig} from '@/types';
import {deleteDDNSConfig, disableDDNSConfig, enableDDNSConfig, getDDNSConfigs, triggerDDNSUpdate,} from '@/api/ddns';
import {getErrorMessage} from '@/lib/utils';
import DDNSModal from './DDNSModal.tsx';
import RecordsDrawer from './RecordsDrawer.tsx';
import DNSProviderModal from './DNSProviderModal.tsx';
import {useQuery, useQueryClient} from '@tanstack/react-query';

const DDNSPage = () => {
    const {message, modal} = App.useApp();
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchValue, setSearchValue] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [recordsDrawerOpen, setRecordsDrawerOpen] = useState(false);
    const [providerModalOpen, setProviderModalOpen] = useState(false);
    const [selectedConfig, setSelectedConfig] = useState<DDNSConfig | null>(null);

    const providerNames: Record<string, string> = {
        aliyun: '阿里云',
        tencentcloud: '腾讯云',
        cloudflare: 'Cloudflare',
        huaweicloud: '华为云',
    };

    const pageIndex = Number(searchParams.get('pageIndex')) || 1;
    const pageSize = Number(searchParams.get('pageSize')) || 10;
    const keyword = searchParams.get('keyword') ?? '';

    const {
        data: ddnsPaging,
        isLoading,
        isFetching,
    } = useQuery({
        queryKey: ['admin', 'ddns', pageIndex, pageSize, keyword],
        queryFn: async () => {
            const response = await getDDNSConfigs(pageIndex, pageSize, keyword || undefined);
            return response.data;
        },
    });

    useEffect(() => {
        setSearchValue(keyword);
    }, [keyword]);

    // 处理表格变化
    const handleTableChange = (newPagination: any) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('pageIndex', String(newPagination.current || 1));
        nextParams.set('pageSize', String(newPagination.pageSize || pageSize));
        setSearchParams(nextParams);
    };

    // 处理搜索
    const handleSearch = (value: string) => {
        const trimmedValue = value.trim();
        setSearchValue(trimmedValue);
        const nextParams = new URLSearchParams(searchParams);
        if (trimmedValue) {
            nextParams.set('keyword', trimmedValue);
        } else {
            nextParams.delete('keyword');
        }
        nextParams.set('pageIndex', '1');
        nextParams.set('pageSize', String(pageSize));
        setSearchParams(nextParams);
    };

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
            queryClient.invalidateQueries({queryKey: ['admin', 'ddns']});
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
                    queryClient.invalidateQueries({queryKey: ['admin', 'ddns']});
                } catch (error: unknown) {
                    message.error(getErrorMessage(error, '删除失败'));
                }
            },
        });
    };

    const handleTrigger = async (config: DDNSConfig) => {
        try {
            await triggerDDNSUpdate(config.id);
            message.success('DDNS 更新触发成功，探针将在几秒内上报 IP 并更新记录');
        } catch (error: unknown) {
            message.error(getErrorMessage(error, '触发失败'));
        }
    };

    const columns: ColumnsType<DDNSConfig> = [
        {
            title: '配置名称',
            dataIndex: 'name',
            render: (_, record) => (
                <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-500"/>
                    <span className="font-medium text-gray-900 dark:text-white">{record.name}</span>
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
                    ...((record.domainsIpv4 as string[] || []).map(d => ({domain: d, type: 'IPv4'}))),
                    ...((record.domainsIpv6 as string[] || []).map(d => ({domain: d, type: 'IPv6'})))
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
            key: 'action',
            width: 150,
            fixed: 'right',
            render: (_, record) => {
                const menuItems: MenuProps['items'] = [
                    {
                        key: 'records',
                        label: '查看记录',
                        onClick: () => handleViewRecords(record),
                    },
                    {
                        key: 'trigger',
                        label: '触发更新',
                        onClick: () => handleTrigger(record),
                        disabled: !record.enabled,
                    },
                    {
                        key: 'toggle',
                        label: record.enabled ? '禁用' : '启用',
                        onClick: () => handleToggleStatus(record),
                    },
                    {
                        key: 'edit',
                        label: '编辑',
                        onClick: () => handleUpdate(record),
                    },
                    {
                        type: 'divider',
                    },
                    {
                        key: 'delete',
                        label: '删除',
                        danger: true,
                        onClick: () => handleDelete(record),
                    },
                ];

                return (
                    <Space size="small">
                        <Button
                            type="link"
                            onClick={() => handleViewRecords(record)}
                            style={{padding: 0}}
                        >
                            记录
                        </Button>
                        <Dropdown menu={{items: menuItems}} trigger={['click']} placement="bottomRight">
                            <Button
                                type="link"
                                icon={<MoreVertical size={14}/>}
                                style={{padding: 0}}
                            />
                        </Dropdown>
                    </Space>
                );
            },
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

            <div style={{marginBottom: 16, display: 'flex', justifyContent: 'space-between'}}>
                <Input.Search
                    placeholder="按配置名称搜索"
                    allowClear
                    value={searchValue}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        setSearchValue(nextValue);
                        if (!nextValue) {
                            handleSearch('');
                        }
                    }}
                    onSearch={handleSearch}
                    style={{width: 260}}
                />
                <Button type="primary" icon={<Plus size={16}/>} onClick={handleCreate}>
                    新建配置
                </Button>
            </div>

            <Table<DDNSConfig>
                columns={columns}
                dataSource={ddnsPaging?.items || []}
                loading={isLoading || isFetching}
                rowKey="id"
                pagination={{
                    current: pageIndex,
                    pageSize,
                    total: ddnsPaging?.total || 0,
                    showSizeChanger: true,
                }}
                onChange={handleTableChange}
            />

            <DDNSModal
                open={modalOpen}
                id={selectedConfig?.id}
                onCancel={() => {
                    setModalOpen(false);
                    setSelectedConfig(null);
                }}
                onSuccess={() => {
                    setModalOpen(false);
                    setSelectedConfig(null);
                    queryClient.invalidateQueries({queryKey: ['admin', 'ddns']});
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
                    queryClient.invalidateQueries({queryKey: ['admin', 'ddns']});
                }}
            />
        </div>
    );
};

export default DDNSPage;
