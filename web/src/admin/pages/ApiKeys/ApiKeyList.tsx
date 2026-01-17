import {useState, useEffect} from 'react';
import {useSearchParams} from 'react-router-dom';
import {App, Button, Divider, Input, Popconfirm, Space, Table, Tag} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {Copy, Edit, Eye, EyeOff, Plus, Power, PowerOff, RefreshCw, Trash2} from 'lucide-react';
import {deleteApiKey, disableApiKey, enableApiKey, listApiKeys} from '@/api/apiKey.ts';
import type {ApiKey} from '@/types';
import dayjs from 'dayjs';
import {getErrorMessage} from '@/lib/utils';
import {PageHeader} from '@admin/components';
import copy from 'copy-to-clipboard';
import ApiKeyModal from './ApiKeyModal';
import ShowApiKeyModal from './ShowApiKeyModal';

const ApiKeyList = () => {
    const {message: messageApi} = App.useApp();
    const [loading, setLoading] = useState(false);
    const [dataSource, setDataSource] = useState<ApiKey[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [total, setTotal] = useState(0);
    const [searchValue, setSearchValue] = useState('');
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingApiKeyId, setEditingApiKeyId] = useState<string | undefined>(undefined);
    const [newApiKeyData, setNewApiKeyData] = useState<ApiKey | null>(null);
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

    // 加载数据
    const current = Number(searchParams.get('page')) || 1;
    const pageSize = Number(searchParams.get('pageSize')) || 10;
    const name = searchParams.get('name') ?? '';

    const loadData = async (page: number, size: number, keyword: string) => {
        setLoading(true);
        try {
            const response = await listApiKeys(page, size, keyword || undefined);
            setDataSource(response.data.items || []);
            setTotal(response.data.total || 0);
        } catch (error: unknown) {
            messageApi.error(getErrorMessage(error, '获取API密钥列表失败'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setSearchValue(name);
    }, [name]);

    useEffect(() => {
        loadData(current, pageSize, name);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current, pageSize, name]);

    // 处理表格变化
    const handleTableChange = (newPagination: any) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('page', String(newPagination.current || 1));
        nextParams.set('pageSize', String(newPagination.pageSize || pageSize));
        setSearchParams(nextParams);
    };

    // 处理搜索
    const handleSearch = (value: string) => {
        const keyword = value.trim();
        setSearchValue(keyword);
        const nextParams = new URLSearchParams(searchParams);
        if (keyword) {
            nextParams.set('name', keyword);
        } else {
            nextParams.delete('name');
        }
        nextParams.set('page', '1');
        nextParams.set('pageSize', String(pageSize));
        setSearchParams(nextParams);
    };

    const handleCreate = () => {
        setEditingApiKeyId(undefined);
        setIsModalVisible(true);
    };

    const handleEdit = (apiKey: ApiKey) => {
        setEditingApiKeyId(apiKey.id);
        setIsModalVisible(true);
    };

    const handleToggleEnabled = async (apiKey: ApiKey) => {
        try {
            if (apiKey.enabled) {
                await disableApiKey(apiKey.id);
                messageApi.success('API密钥已禁用');
            } else {
                await enableApiKey(apiKey.id);
                messageApi.success('API密钥已启用');
            }
            loadData(current, pageSize, name);
        } catch (error: unknown) {
            messageApi.error(getErrorMessage(error, '操作失败'));
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteApiKey(id);
            messageApi.success('删除成功');
            loadData(current, pageSize, name);
        } catch (error: unknown) {
            messageApi.error(getErrorMessage(error, '删除失败'));
        }
    };

    const handleModalSuccess = (apiKey?: ApiKey) => {
        setIsModalVisible(false);
        if (apiKey) {
            // 新建成功，显示生成的密钥
            setNewApiKeyData(apiKey);
            setShowApiKeyModal(true);
        }
        loadData(current, pageSize, name);
    };

    const handleCopyApiKey = (key: string) => {
        copy(key);
        messageApi.success('复制成功');
    };

    const toggleKeyVisibility = (id: string) => {
        setVisibleKeys((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const columns: ColumnsType<ApiKey> = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            render: (text) => <span className="font-medium text-gray-900 dark:text-white">{text}</span>,
        },
        {
            title: 'API密钥',
            dataIndex: 'key',
            key: 'key',
            render: (_, record) => {
                const fullKey = record.key || '';
                const isVisible = visibleKeys[record.id];
                const displayText = isVisible ? fullKey : (fullKey.length > 8 ? `${fullKey.substring(0, 8)}...` : fullKey);
                return (
                    <div className="flex items-center gap-2">
                        <code
                            className="text-xs bg-gray-100 dark:bg-gray-800 dark:text-gray-200 px-2 py-1 rounded font-mono">
                            {displayText}
                        </code>
                        <Button
                            type="text"
                            size="small"
                            icon={isVisible ? <EyeOff size={14}/> : <Eye size={14}/>}
                            onClick={() => toggleKeyVisibility(record.id)}
                            title={isVisible ? '隐藏密钥' : '显示密钥'}
                        />
                        <Button
                            type="text"
                            size="small"
                            icon={<Copy size={14}/>}
                            onClick={() => handleCopyApiKey(fullKey)}
                            title="复制完整密钥"
                        />
                    </div>
                );
            },
        },
        {
            title: '状态',
            dataIndex: 'enabled',
            key: 'enabled',
            render: (enabled) => (
                <Tag color={enabled ? 'green' : 'red'}>{enabled ? '启用' : '禁用'}</Tag>
            ),
            width: 80,
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (value: number) => (
                <span className="text-gray-600 dark:text-gray-400">{dayjs(value).format('YYYY-MM-DD HH:mm')}</span>
            ),
            width: 180,
        },
        {
            title: '更新时间',
            dataIndex: 'updatedAt',
            key: 'updatedAt',
            render: (value: number) => (
                <span className="text-gray-600 dark:text-gray-400">{dayjs(value).format('YYYY-MM-DD HH:mm')}</span>
            ),
            width: 180,
        },
        {
            title: '操作',
            key: 'action',
            width: 200,
            render: (_, record) => [
                <Button
                    key="edit"
                    type="link"
                    size="small"
                    icon={<Edit size={14}/>}
                    onClick={() => handleEdit(record)}
                    style={{padding: 0, margin: 0}}
                >
                    编辑
                </Button>,
                <Button
                    key="toggle"
                    type="link"
                    size="small"
                    icon={record.enabled ? <PowerOff size={14}/> : <Power size={14}/>}
                    onClick={() => handleToggleEnabled(record)}
                    style={{padding: 0, margin: 0}}
                >
                    {record.enabled ? '禁用' : '启用'}
                </Button>,
                <Popconfirm
                    key="delete"
                    title="确定要删除这个API密钥吗?"
                    description="删除后无法恢复,且使用该密钥的探针将无法连接"
                    onConfirm={() => handleDelete(record.id)}
                    okText="确定"
                    cancelText="取消"
                >
                    <Button type="link"
                            size="small"
                            danger icon={<Trash2 size={14}/>}
                            style={{padding: 0, margin: 0}}
                    >
                        删除
                    </Button>
                </Popconfirm>,
            ],
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="API密钥管理"
                description="管理探针连接所需的API密钥,用于验证探针注册"
                actions={[
                    {
                        key: 'create',
                        label: '生成密钥',
                        icon: <Plus size={16}/>,
                        type: 'primary',
                        onClick: handleCreate,
                    },
                    {
                        key: 'refresh',
                        label: '刷新',
                        icon: <RefreshCw size={16}/>,
                        onClick: () => loadData(current, pageSize, name),
                    },
                ]}
            />

            <Divider/>

            <div style={{marginBottom: 16}}>
                <Input.Search
                    placeholder="按名称搜索"
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
            </div>

            <Table<ApiKey>
                columns={columns}
                dataSource={dataSource}
                loading={loading}
                rowKey="id"
                pagination={{
                    current,
                    pageSize,
                    total,
                    showSizeChanger: true,
                }}
                onChange={handleTableChange}
            />

            <ApiKeyModal
                open={isModalVisible}
                apiKeyId={editingApiKeyId}
                onCancel={() => setIsModalVisible(false)}
                onSuccess={handleModalSuccess}
            />

            <ShowApiKeyModal
                open={showApiKeyModal}
                apiKey={newApiKeyData}
                onClose={() => {
                    setShowApiKeyModal(false);
                    setNewApiKeyData(null);
                }}
            />
        </div>
    );
};

export default ApiKeyList;
