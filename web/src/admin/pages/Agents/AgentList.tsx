import {useMemo, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import type {MenuProps} from 'antd';
import {App, Button, Divider, Dropdown, Form, Input, Select, Space, Table, Tag, message} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {Edit, Eye, EyeOff, FileWarning, Lock, MoreVertical, Plus, RefreshCw, Shield, Tags, Trash2, Wrench} from 'lucide-react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import dayjs from 'dayjs';
import {cleanupOrphanedAgentMetrics, deleteAgent, getTags, listAgentsByAdmin} from '@/api/agent.ts';
import type {Agent} from '@/types';
import {getErrorMessage} from '@/lib/utils';
import {PageHeader} from '@admin/components';
import AgentEditModal from './AgentEditModal';
import BatchTagsModal from './BatchTagsModal';
import BatchTamperProtectionModal from './BatchTamperProtectionModal';
import BatchSSHLoginConfigModal from './BatchSSHLoginConfigModal';
import BatchVisibilityModal from './BatchVisibilityModal';

const AgentList = () => {
    const navigate = useNavigate();
    const {message: messageApi, modal} = App.useApp();
    const queryClient = useQueryClient();

    const [searchForm] = Form.useForm();
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [batchTagModalVisible, setBatchTagModalVisible] = useState(false);
    const [batchTamperModalVisible, setBatchTamperModalVisible] = useState(false);
    const [batchSSHModalVisible, setBatchSSHModalVisible] = useState(false);
    const [batchVisibilityModalVisible, setBatchVisibilityModalVisible] = useState(false);
    const [editingAgentId, setEditingAgentId] = useState<string | undefined>(undefined);

    // 清理遗留指标数据的 mutation
    const cleanupMutation = useMutation({
        mutationFn: cleanupOrphanedAgentMetrics,
        onSuccess: (response) => {
            messageApi.success(response.data.message || '成功清理残留探针指标数据');
            // 清理完成后，延时刷新页面显示最新状态（清理操作不影响探针列表本身）
            setTimeout(() => {
                queryClient.invalidateQueries({queryKey: ['admin', 'agents']});
            }, 2000); // 延时 2 秒后刷新，让用户能看到清理结果
        },
        onError: (error: unknown) => {
            messageApi.error(getErrorMessage(error, '清理残留探针指标数据失败'));
        },
    });

    // 清理遗留指标数据
    const handleCleanupMetrics = () => {
        modal.confirm({
            title: '清理残留探针指标数据',
            content: (
                <div>
                    <p>确定要清理已删除探针的残留指标数据吗？</p>
                    <p className="text-orange-500 text-sm mt-2">
                        此操作将扫描数据库和VictoriaMetrics中的探针数据，清理已经删除探针的残留指标数据
                    </p>
                </div>
            ),
            okText: '确认清理',
            cancelText: '取消',
            okButtonProps: {style: {background: '#16a34a'}}, // 绿色按钮提示非危险操作
            centered: true,
            onOk: async () => {
                try {
                    await cleanupMutation.mutateAsync();
                } catch (e) {
                    // 错误已经在 mutation 中处理
                }
            },
        });
    };

    // 过滤条件
    const [keyword, setKeyword] = useState('');
    const [status, setStatus] = useState<string | undefined>(undefined);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const {data: tags = []} = useQuery({
        queryKey: ['admin', 'agents', 'tags'],
        queryFn: async () => {
            const response = await getTags();
            return response.data.tags || [];
        },
    });

    const {
        data: agents = [],
        isLoading,
        isFetching,
        refetch,
    } = useQuery({
        queryKey: ['admin', 'agents'],
        queryFn: async () => {
            const response = await listAgentsByAdmin();
            return response.data;
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (agentId: string) => deleteAgent(agentId),
        onSuccess: () => {
            messageApi.success('探针删除成功');
            queryClient.invalidateQueries({queryKey: ['admin', 'agents']});
        },
        onError: (error: unknown) => {
            messageApi.error(getErrorMessage(error, '删除探针失败'));
        },
    });

    const handleSearch = () => {
        const values = searchForm.getFieldsValue();
        setKeyword(values.keyword?.trim() || '');
        setStatus(values.status);
    };

    const handleReset = () => {
        searchForm.resetFields();
        setKeyword('');
        setStatus(undefined);
        setSelectedTags([]);
    };

    const handleEdit = (agent: Agent) => {
        setEditingAgentId(agent.id);
        setEditModalVisible(true);
    };

    const handleDelete = (agent: Agent) => {
        modal.confirm({
            title: '删除探针',
            content: (
                <div>
                    <p>确定要删除探针「{agent.name || agent.hostname}」吗？</p>
                    <p className="text-red-500 text-sm mt-2">
                        警告：此操作将删除探针及其所有相关数据（指标数据、监控统计、审计结果等），且不可恢复！
                    </p>
                </div>
            ),
            okText: '确认删除',
            cancelText: '取消',
            okButtonProps: {danger: true},
            centered: true,
            onOk: async () => {
                try {
                    await deleteMutation.mutateAsync(agent.id);
                } catch {
                    // 错误提示已在 mutation 中处理
                }
            },
        });
    };

    const handleBatchTags = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请先选择要操作的探针');
            return;
        }
        setBatchTagModalVisible(true);
    };

    const handleBatchTamperConfig = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请先选择要操作的探针');
            return;
        }
        setBatchTamperModalVisible(true);
    };

    const handleBatchSSHConfig = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请先选择要操作的探针');
            return;
        }
        setBatchSSHModalVisible(true);
    };

    const handleBatchVisibility = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请先选择要操作的探针');
            return;
        }
        setBatchVisibilityModalVisible(true);
    };

    // 前端过滤数据
    const filteredAgents = useMemo(() => {
        let result = agents || [];

        // 关键字过滤
        if (keyword) {
            const lowerKeyword = keyword.toLowerCase();
            result = result.filter((agent: Agent) => {
                return (
                    agent.name?.toLowerCase().includes(lowerKeyword) ||
                    agent.hostname?.toLowerCase().includes(lowerKeyword) ||
                    agent.ip?.toLowerCase().includes(lowerKeyword) ||
                    agent.ipv4?.toLowerCase().includes(lowerKeyword) ||
                    agent.ipv6?.toLowerCase().includes(lowerKeyword)
                );
            });
        }

        // 状态过滤
        if (status) {
            const statusValue = status === 'online' ? 1 : 0;
            result = result.filter((agent: Agent) => agent.status === statusValue);
        }

        // 标签过滤
        if (selectedTags.length > 0) {
            result = result.filter((agent: Agent) => {
                return selectedTags.some(tag => agent.tags?.includes(tag));
            });
        }

        return result;
    }, [agents, keyword, status, selectedTags]);

    const columns: ColumnsType<Agent> = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            fixed: 'left',
            render: (_, record) => (
                <div className="space-y-1">
                    <div className="font-medium">
                        <Link to={`/admin/agents/${record.id}`}>
                            {record.name || record.hostname}
                        </Link>
                    </div>
                    <Tag color="geekblue" variant={'filled'}>{record.os} · {record.arch}</Tag>
                </div>
            ),
        },
        {
            title: '标签',
            dataIndex: 'tags',
            key: 'tags',
            width: 200,
            render: (_, record) => (
                <div className={'flex items-center gap-1'}>
                    {record.tags?.map((tag, index) => (
                        <Tag key={index} color="blue" variant={'filled'}>
                            {tag}
                        </Tag>
                    ))}
                </div>
            ),
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 80,
            render: (_, record) => (
                <Tag color={record.status === 1 ? 'success' : 'default'}>
                    {record.status === 1 ? '在线' : '离线'}
                </Tag>
            ),
        },
        {
            title: '可见性',
            dataIndex: 'visibility',
            key: 'visibility',
            width: 100,
            render: (visibility) => (
                <Tag color={visibility === 'public' ? 'green' : 'orange'}>
                    {visibility === 'public' ? '匿名可见' : '登录可见'}
                </Tag>
            ),
        },
        {
            title: '主机名',
            dataIndex: 'hostname',
            key: 'hostname',
            ellipsis: true,
            width: 150,
        },
        {
            title: '通信地址',
            dataIndex: 'ip',
            key: 'ip',
            ellipsis: true,
            width: 160,
            render: (value) => (
                <span className="font-mono text-xs">{value || '-'}</span>
            ),
        },
        {
            title: 'IPv4',
            dataIndex: 'ipv4',
            key: 'ipv4',
            ellipsis: true,
            width: 160,
            render: (value) => (
                <span className="font-mono text-xs">{value || '-'}</span>
            ),
        },
        {
            title: 'IPv6',
            dataIndex: 'ipv6',
            key: 'ipv6',
            ellipsis: true,
            width: 200,
            render: (value) => (
                <span className="font-mono text-xs">{value || '-'}</span>
            ),
        },
        {
            title: '版本',
            dataIndex: 'version',
            key: 'version',
        },
        {
            title: '到期时间',
            dataIndex: 'expireTime',
            key: 'expireTime',
            width: 100,
            render: (val) => {
                if (!val) return '-';
                const expireDate = new Date(val as number);
                const now = new Date();
                const isExpired = expireDate < now;
                const daysLeft = Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                return (
                    <div className="space-y-1">
                        <div>{expireDate.toLocaleDateString('zh-CN')}</div>
                        {isExpired ? (
                            <Tag color="red" variant={'filled'}>已过期</Tag>
                        ) : daysLeft <= 7 ? (
                            <Tag color="orange" variant={'filled'}>{daysLeft}天后到期</Tag>
                        ) : daysLeft <= 30 ? (
                            <Tag color="gold" variant={'filled'}>{daysLeft}天后到期</Tag>
                        ) : null}
                    </div>
                );
            },
        },
        {
            title: '流量统计',
            key: 'trafficStats',
            width: 120,
            render: (_, record) => {
                const trafficStats = record.trafficStats;
                if (!trafficStats || !trafficStats.enabled) {
                    return <Tag variant={'filled'}>未启用</Tag>;
                }
                return (
                    <div className="space-y-1">
                        <Tag color="green" variant={'filled'}>已启用</Tag>
                        {trafficStats.limit > 0 && (
                            <span className="text-xs text-gray-500">
                                {(trafficStats.used / (1024 * 1024 * 1024)).toFixed(2)}GB / {(trafficStats.limit / (1024 * 1024 * 1024)).toFixed(0)}GB
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            title: '防篡改保护',
            key: 'tamperProtect',
            width: 120,
            render: (_, record) => {
                const config = record.tamperProtectConfig;
                if (!config || !config.enabled) {
                    return <Tag variant={'filled'}>未启用</Tag>;
                }
                return (
                    <div className="space-y-1">
                        <Tag color="green" variant={'filled'}>已启用</Tag>
                        {config.paths && config.paths.length > 0 && (
                            <span className="text-xs text-gray-500">{config.paths.length} 个路径</span>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'SSH登录监控',
            key: 'sshLogin',
            width: 120,
            render: (_, record) => {
                const config = record.sshLoginConfig;
                if (!config || !config.enabled) {
                    return <Tag variant={'filled'}>未启用</Tag>;
                }
                return <Tag color="green" variant={'filled'}>已启用</Tag>;
            },
        },
        {
            title: '排序权重',
            dataIndex: 'weight',
            key: 'weight',
            width: 100,
        },
        {
            title: '备注',
            dataIndex: 'remark',
            key: 'remark',
            width: 200,
            ellipsis: true,
            render: (value) => (
                <span className="text-gray-700">{value || '-'}</span>
            ),
        },
        {
            title: '最后活跃时间',
            dataIndex: 'lastSeenAt',
            key: 'lastSeenAt',
            width: 180,
            render: (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'),
        },
        {
            title: '操作',
            key: 'action',
            width: 150,
            fixed: 'right',
            render: (_, record) => {
                const menuItems: MenuProps['items'] = [
                    {
                        key: 'view',
                        label: '查看详情',
                        icon: <Eye size={14}/>,
                        onClick: () => navigate(`/admin/agents/${record.id}`),
                    },
                    {
                        key: 'audit',
                        label: '安全审计',
                        icon: <Shield size={14}/>,
                        onClick: () => navigate(`/admin/agents/${record.id}?tab=audit`),
                    },
                    {
                        key: 'tamper',
                        label: '防篡改保护',
                        icon: <FileWarning size={14}/>,
                        onClick: () => navigate(`/admin/agents/${record.id}?tab=tamper`),
                    },
                    {
                        key: 'ssh-login',
                        label: 'SSH 登录监控',
                        icon: <Lock size={14}/>,
                        onClick: () => navigate(`/admin/agents/${record.id}?tab=ssh-login`),
                    },
                    {
                        key: 'edit',
                        label: '编辑信息',
                        icon: <Edit size={14}/>,
                        onClick: () => handleEdit(record),
                    },
                    {
                        type: 'divider',
                    },
                    {
                        key: 'delete',
                        label: '删除探针',
                        icon: <Trash2 size={14}/>,
                        danger: true,
                        onClick: () => handleDelete(record),
                    },
                ];

                return (
                    <Space size="small">
                        <Button
                            type="link"
                            icon={<Eye size={14}/>}
                            onClick={() => navigate(`/admin/agents/${record.id}`)}
                            style={{padding: 0}}
                        >
                            详情
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
                title="探针管理"
                description="管理和监控系统探针状态"
                actions={[
                    {
                        key: 'batch-tags',
                        label: `批量操作标签${selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}`,
                        icon: <Tags size={16}/>,
                        onClick: handleBatchTags,
                        disabled: selectedRowKeys.length === 0,
                    },
                    {
                        key: 'batch-visibility',
                        label: `批量修改可见性${selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}`,
                        icon: <EyeOff size={16}/>,
                        onClick: handleBatchVisibility,
                        disabled: selectedRowKeys.length === 0,
                    },
                    {
                        key: 'batch-tamper',
                        label: `批量配置防篡改保护${selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}`,
                        icon: <FileWarning size={16}/>,
                        onClick: handleBatchTamperConfig,
                        disabled: selectedRowKeys.length === 0,
                    },
                    {
                        key: 'batch-ssh',
                        label: `批量配置 SSH 登录监控${selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}`,
                        icon: <Lock size={16}/>,
                        onClick: handleBatchSSHConfig,
                        disabled: selectedRowKeys.length === 0,
                    },
                    {
                        key: 'register',
                        label: '注册探针',
                        icon: <Plus size={16}/>,
                        onClick: () => navigate('/admin/agents-install/one-click'),
                        type: 'primary',
                    },
                    {
                        key: 'refresh',
                        label: '刷新',
                        icon: <RefreshCw size={16}/>,
                        onClick: () => refetch(),
                    },
                ]}
            />

            <Button
                key="cleanup-metrics"
                icon={<Wrench size={16}/>}
                onClick={handleCleanupMetrics}
                loading={cleanupMutation.isPending}
                type="default"
                danger={false}
            >
                {cleanupMutation.isPending ? '清理中...' : '清理残留指标数据'}
            </Button>

            <Divider/>

            <Form form={searchForm} layout="inline" onFinish={handleSearch}>
                <Form.Item label="关键字" name="keyword">
                    <Input placeholder="名称/主机名/通信地址/IPv4/IPv6" style={{width: 225}}/>
                </Form.Item>
                <Form.Item label="状态" name="status">
                    <Select
                        placeholder="请选择状态"
                        allowClear
                        style={{width: 160}}
                        options={[
                            {label: '在线', value: 'online'},
                            {label: '离线', value: 'offline'},
                        ]}
                    />
                </Form.Item>
                <Form.Item>
                    <Space>
                        <Button type="primary" htmlType="submit">
                            查询
                        </Button>
                        <Button onClick={handleReset}>
                            重置
                        </Button>
                    </Space>
                </Form.Item>
            </Form>

            {tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-4">
                    <span className="">标签筛选：</span>
                    <Tag.CheckableTag
                        checked={selectedTags.length === 0}
                        onChange={() => setSelectedTags([])}
                    >
                        全部
                    </Tag.CheckableTag>
                    {tags.map((tag) => (
                        <Tag.CheckableTag
                            key={tag}
                            checked={selectedTags.includes(tag)}
                            onChange={(checked) => {
                                if (checked) {
                                    setSelectedTags([...selectedTags, tag]);
                                } else {
                                    setSelectedTags(selectedTags.filter(t => t !== tag));
                                }
                            }}
                        >
                            {tag}
                        </Tag.CheckableTag>
                    ))}
                </div>
            )}

            <Table<Agent>
                columns={columns}
                dataSource={filteredAgents}
                loading={isLoading || isFetching}
                rowKey="id"
                scroll={{x: 'max-content'}}
                rowSelection={{
                    selectedRowKeys,
                    onChange: (keys) => setSelectedRowKeys(keys),
                    preserveSelectedRowKeys: true,
                }}
                pagination={false}
                style={{
                    marginTop: 16,
                }}
            />

            <AgentEditModal
                open={editModalVisible}
                agentId={editingAgentId}
                existingTags={tags}
                onCancel={() => {
                    setEditModalVisible(false);
                    setEditingAgentId(undefined);
                }}
                onSuccess={() => {
                    setEditModalVisible(false);
                    setEditingAgentId(undefined);
                }}
            />

            <BatchTagsModal
                open={batchTagModalVisible}
                agentIds={selectedRowKeys as string[]}
                existingTags={tags}
                onCancel={() => setBatchTagModalVisible(false)}
                onSuccess={() => {
                    setBatchTagModalVisible(false);
                    setSelectedRowKeys([]);
                }}
            />

            <BatchTamperProtectionModal
                open={batchTamperModalVisible}
                agentIds={selectedRowKeys as string[]}
                onCancel={() => setBatchTamperModalVisible(false)}
                onSuccess={() => {
                    setBatchTamperModalVisible(false);
                    setSelectedRowKeys([]);
                }}
            />

            <BatchSSHLoginConfigModal
                open={batchSSHModalVisible}
                agentIds={selectedRowKeys as string[]}
                onCancel={() => setBatchSSHModalVisible(false)}
                onSuccess={() => {
                    setBatchSSHModalVisible(false);
                    setSelectedRowKeys([]);
                }}
            />

            <BatchVisibilityModal
                open={batchVisibilityModalVisible}
                agentIds={selectedRowKeys as string[]}
                onCancel={() => setBatchVisibilityModalVisible(false)}
                onSuccess={() => {
                    setBatchVisibilityModalVisible(false);
                    setSelectedRowKeys([]);
                }}
            />
        </div>
    );
};

export default AgentList;
