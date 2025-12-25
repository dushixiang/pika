import {useRef, useState} from 'react';
import type {ActionType, ProColumns} from '@ant-design/pro-components';
import {ProTable} from '@ant-design/pro-components';
import {App, Button, Divider, Form, Input, Modal, Popconfirm, Tag,} from 'antd';
import {Copy, Edit, Eye, EyeOff, Plus, Power, PowerOff, RefreshCw, Trash2} from 'lucide-react';
import {
    deleteApiKey,
    disableApiKey,
    enableApiKey,
    generateApiKey,
    listApiKeys,
    updateApiKeyName,
} from '@/api/apiKey.ts';
import type {ApiKey, GenerateApiKeyRequest} from '@/types';
import dayjs from 'dayjs';
import {getErrorMessage} from '@/lib/utils';
import {PageHeader} from '@/components';
import copy from "copy-to-clipboard";

const ApiKeyList = () => {
    const {message: messageApi} = App.useApp();
    const actionRef = useRef<ActionType>(null);
    const [submitting, setSubmitting] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingApiKey, setEditingApiKey] = useState<ApiKey | null>(null);
    const [newApiKeyData, setNewApiKeyData] = useState<ApiKey | null>(null);
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
    const [form] = Form.useForm();

    const handleCreate = () => {
        setEditingApiKey(null);
        setIsModalVisible(true);
        form.resetFields();
    };

    const handleEdit = (apiKey: ApiKey) => {
        setEditingApiKey(apiKey);
        form.setFieldsValue({
            name: apiKey.name,
        });
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
            actionRef.current?.reload();
        } catch (error: unknown) {
            messageApi.error(getErrorMessage(error, '操作失败'));
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteApiKey(id);
            messageApi.success('删除成功');
            actionRef.current?.reload();
        } catch (error: unknown) {
            messageApi.error(getErrorMessage(error, '删除失败'));
        }
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            const name = values.name?.trim();

            if (!name) {
                messageApi.warning('名称不能为空');
                return;
            }

            setSubmitting(true);

            if (editingApiKey) {
                // 编辑模式
                if (name === editingApiKey.name) {
                    messageApi.info('名称未发生变化');
                    return;
                }
                await updateApiKeyName(editingApiKey.id, {name});
                messageApi.success('更新成功');
                setIsModalVisible(false);
            } else {
                // 创建模式
                const createData: GenerateApiKeyRequest = {name};
                const response = await generateApiKey(createData);
                setNewApiKeyData(response.data);
                messageApi.success('API密钥生成成功');
                setIsModalVisible(false);
                setShowApiKeyModal(true);
            }

            form.resetFields();
            actionRef.current?.reload();
        } catch (error: unknown) {
            if (typeof error === 'object' && error !== null && 'errorFields' in error) {
                return;
            }
            messageApi.error(getErrorMessage(error, '操作失败'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopyApiKey = (key: string) => {
        copy(key)
        messageApi.success('复制成功');
    };

    const toggleKeyVisibility = (id: string) => {
        setVisibleKeys((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const columns: ProColumns<ApiKey>[] = [
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
            hideInSearch: true,
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
            hideInSearch: true,
            render: (enabled) => (
                <Tag color={enabled ? 'green' : 'red'}>{enabled ? '启用' : '禁用'}</Tag>
            ),
            width: 80,
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            hideInSearch: true,
            render: (value: number) => (
                <span className="text-gray-600 dark:text-gray-400">{dayjs(value).format('YYYY-MM-DD HH:mm')}</span>
            ),
            width: 180,
        },
        {
            title: '更新时间',
            dataIndex: 'updatedAt',
            key: 'updatedAt',
            hideInSearch: true,
            render: (value: number) => (
                <span className="text-gray-600 dark:text-gray-400">{dayjs(value).format('YYYY-MM-DD HH:mm')}</span>
            ),
            width: 180,
        },
        {
            title: '操作',
            key: 'action',
            valueType: 'option',
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
            {/* 页面头部 */}
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
                        onClick: () => actionRef.current?.reload(),
                    },
                ]}
            />

            <Divider/>

            {/* API密钥列表 */}
            <ProTable<ApiKey>

                actionRef={actionRef}
                rowKey="id"
                search={{labelWidth: 80}}
                columns={columns}
                pagination={{
                    defaultPageSize: 10,
                    showSizeChanger: true,
                }}
                options={false}
                request={async (params) => {
                    const {current = 1, pageSize = 10, name} = params;
                    try {
                        const response = await listApiKeys(current, pageSize, name);
                        return {
                            data: response.data.items || [],
                            success: true,
                            total: response.data.total,
                        };
                    } catch (error: unknown) {
                        messageApi.error(getErrorMessage(error, '获取API密钥列表失败'));
                        return {
                            data: [],
                            success: false,
                        };
                    }
                }}
            />

            {/* 新建/编辑API密钥弹窗 */}
            <Modal
                title={editingApiKey ? '编辑API密钥' : '生成API密钥'}
                open={isModalVisible}
                onOk={handleModalOk}
                onCancel={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                }}
                okText={editingApiKey ? '保存' : '生成'}
                cancelText="取消"
                confirmLoading={submitting}
                destroyOnHidden={true}
            >
                <Form form={form} layout="vertical" autoComplete="off">
                    <Form.Item
                        label="密钥名称"
                        name="name"
                        rules={[
                            {required: true, message: '请输入密钥名称'},
                            {min: 2, message: '密钥名称至少2个字符'},
                        ]}
                    >
                        <Input placeholder="例如: 生产环境、测试环境等"/>
                    </Form.Item>
                </Form>
            </Modal>

            {/* 显示新生成的API密钥 */}
            <Modal
                title="API密钥已生成"
                open={showApiKeyModal}
                onOk={() => {
                    setShowApiKeyModal(false);
                    setNewApiKeyData(null);
                }}
                onCancel={() => {
                    setShowApiKeyModal(false);
                    setNewApiKeyData(null);
                }}
                footer={[
                    <Button
                        key="copy"
                        type="primary"
                        icon={<Copy size={14}/>}
                        onClick={() => {
                            if (newApiKeyData) {
                                handleCopyApiKey(newApiKeyData.key);
                            }
                        }}
                    >
                        复制密钥
                    </Button>,
                    <Button
                        key="ok"
                        onClick={() => {
                            setShowApiKeyModal(false);
                            setNewApiKeyData(null);
                        }}
                    >
                        关闭
                    </Button>,
                ]}
            >
                <div className="space-y-4">
                    <div
                        className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                            ⚠️ 重要提示:请妥善保管此密钥,关闭后将无法再次查看完整密钥!
                        </p>
                    </div>
                    <div>
                        <label
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">密钥名称</label>
                        <div
                            className="text-base font-semibold text-gray-900 dark:text-white">{newApiKeyData?.name}</div>
                    </div>
                    <div>
                        <label
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API密钥</label>
                        <code
                            className="block w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 dark:text-gray-200 rounded px-3 py-2 text-sm font-mono break-all">
                            {newApiKeyData?.key}
                        </code>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ApiKeyList;
