import {useEffect, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {App, Button, Divider, Input, Space, Table, Tag} from 'antd';
import type {ColumnsType, TablePaginationConfig} from 'antd/es/table';
import {Edit, Plus, RefreshCw, Trash2} from 'lucide-react';
import dayjs from 'dayjs';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {deleteMonitor, listMonitors} from '@/api/monitor.ts';
import type {MonitorTask} from '@/types';
import {getErrorMessage} from '@/lib/utils';
import {PageHeader} from '@admin/components';
import MonitorModal from './MonitorModal';

const MonitorList = () => {
    const {message, modal} = App.useApp();
    const queryClient = useQueryClient();

    const [modalVisible, setModalVisible] = useState(false);
    const [editingMonitorId, setEditingMonitorId] = useState<string>(undefined);
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchValue, setSearchValue] = useState('');

    const pageIndex = Number(searchParams.get('pageIndex')) || 1;
    const pageSize = Number(searchParams.get('pageSize')) || 10;
    const keyword = searchParams.get('keyword') ?? '';

    const {
        data: monitorPaging,
        isLoading,
        isFetching,
        refetch,
    } = useQuery({
        queryKey: ['admin', 'monitors', pageIndex, pageSize, keyword],
        queryFn: async () => {
            const response = await listMonitors(
                pageIndex,
                pageSize,
                keyword || undefined,
            );
            return response.data;
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteMonitor,
        onSuccess: () => {
            message.success('删除成功');
            queryClient.invalidateQueries({queryKey: ['admin', 'monitors']});
        },
        onError: (error: unknown) => {
            message.error(getErrorMessage(error, '删除失败'));
        },
    });

    useEffect(() => {
        setSearchValue(keyword);
    }, [keyword]);

    const handleCreate = () => {
        setEditingMonitorId(undefined);
        setModalVisible(true);
    };

    const handleEdit = (monitor: MonitorTask) => {
        setEditingMonitorId(monitor.id);
        setModalVisible(true);
    };

    const handleDelete = (monitor: MonitorTask) => {
        modal.confirm({
            title: '删除监控项',
            content: `确定要删除监控「${monitor.name}」吗？`,
            okButtonProps: {danger: true},
            onOk: async () => {
                try {
                    await deleteMutation.mutateAsync(monitor.id);
                } catch {
                    // 错误提示已在 mutation 中处理
                }
            },
        });
    };

    const handleTableChange = (nextPagination: TablePaginationConfig) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('pageIndex', String(nextPagination.current || 1));
        nextParams.set('pageSize', String(nextPagination.pageSize || pageSize));
        setSearchParams(nextParams);
    };

    const handleKeywordSearch = (value: string) => {
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

    const columns: ColumnsType<MonitorTask> = [
        {
            title: '名称',
            dataIndex: 'name',
            render: (_, record) => (
                <div className="flex flex-col">
                    <span className="font-medium text-gray-900 dark:text-white">{record.name}</span>
                    {record.description ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{record.description}</span>
                    ) : null}
                </div>
            ),
        },
        {
            title: '类型',
            dataIndex: 'type',
            width: 80,
            render: (type) => {
                let color = 'green';
                if (type === 'tcp') color = 'blue';
                else if (type === 'icmp' || type === 'ping') color = 'purple';

                return (
                    <Tag color={color} className="uppercase">
                        {type === 'ping' ? 'icmp' : type}
                    </Tag>
                );
            },
        },
        {
            title: '目标',
            dataIndex: 'target',
            ellipsis: true,
        },
        {
            title: '探针范围',
            dataIndex: 'agentIds',
            render: (_, record) => {
                const hasAgents = record.agentIds && record.agentIds.length > 0;
                const hasTags = record.tags && record.tags.length > 0;

                if (!hasAgents && !hasTags) {
                    return <Tag color="purple">全部节点</Tag>;
                }

                return (
                    <div className="flex flex-col gap-2">
                        {hasAgents && (
                            <Space wrap size={4}>
                                <span className="text-xs text-gray-500 dark:text-gray-400">探针:</span>
                                {record.agentNames?.map((id) => (
                                    <Tag key={id} color="blue">{id}</Tag>
                                ))}
                            </Space>
                        )}
                        {hasTags && (
                            <Space wrap size={4}>
                                <span className="text-xs text-gray-500 dark:text-gray-400">标签:</span>
                                {record.tags?.map((tag) => (
                                    <Tag key={tag} color="green">{tag}</Tag>
                                ))}
                            </Space>
                        )}
                    </div>
                );
            },
        },
        {
            title: '状态',
            dataIndex: 'enabled',
            width: 80,
            render: (enabled: boolean) => (
                <Tag color={enabled ? 'green' : 'red'}>{enabled ? '启用' : '禁用'}</Tag>
            ),
        },
        {
            title: '可见性',
            dataIndex: 'visibility',
            width: 100,
            render: (visibility: string) => (
                <Tag color={visibility === 'public' ? 'green' : 'orange'}>
                    {visibility === 'public' ? '匿名可见' : '登录可见'}
                </Tag>
            ),
        },
        {
            title: '更新时间',
            dataIndex: 'updatedAt',
            width: 180,
            render: (value: number) => dayjs(value).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: '操作',
            width: 180,
            render: (_, record) => (
                <Space>
                    <Button
                        type="link"
                        size="small"
                        icon={<Edit size={14}/>}
                        onClick={() => handleEdit(record)}
                        style={{padding: 0, margin: 0}}
                    >
                        编辑
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        icon={<Trash2 size={14}/>}
                        danger
                        onClick={() => handleDelete(record)}
                        style={{padding: 0, margin: 0}}
                    >
                        删除
                    </Button>
                </Space>
            ),
        },
    ];

    const dataSource = monitorPaging?.items || [];
    const total = monitorPaging?.total || 0;

    return (
        <div className="space-y-6">
            <PageHeader
                title="服务监控"
                description="配置 HTTP/TCP/ICMP 服务可用性检测，集中管理监控策略与探针覆盖范围"
                actions={[
                    {
                        key: 'create',
                        label: '新建监控',
                        icon: <Plus size={16}/>,
                        type: 'primary',
                        onClick: handleCreate,
                    },
                    {
                        key: 'refresh',
                        label: '刷新',
                        icon: <RefreshCw size={16}/>,
                        onClick: () => refetch(),
                    },
                ]}
            />

            <Divider/>

            <Input.Search
                placeholder="按名称或目标搜索"
                allowClear
                value={searchValue}
                onChange={(event) => {
                    const nextValue = event.target.value;
                    setSearchValue(nextValue);
                    if (!nextValue) {
                        handleKeywordSearch('');
                    }
                }}
                onSearch={(value) => handleKeywordSearch(value)}
                style={{width: 260}}
            />

            <Table<MonitorTask>
                columns={columns}
                dataSource={dataSource}
                loading={isLoading || isFetching}
                rowKey="id"
                pagination={{
                    current: pageIndex,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    showTotal: (count) => `共 ${count} 条`,
                }}
                onChange={handleTableChange}
            />

            <MonitorModal
                open={modalVisible}
                monitorId={editingMonitorId}
                onCancel={() => {
                    setModalVisible(false);
                    setEditingMonitorId(undefined);
                }}
                onSuccess={() => {
                    setModalVisible(false);
                    setEditingMonitorId(undefined);
                }}
            />
        </div>
    );
};

export default MonitorList;
