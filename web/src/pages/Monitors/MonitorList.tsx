import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {ActionType, ProColumns} from '@ant-design/pro-components';
import {ProTable} from '@ant-design/pro-components';
import {
    App,
    Button,
    Divider,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Switch,
    Tag,
} from 'antd';
import {PageHeader} from '../../components';
import {Plus, RefreshCw, Edit, Trash2, PlusCircle, MinusCircle} from 'lucide-react';
import dayjs from 'dayjs';
import {getAgentPaging} from '../../api/agent';
import type {Agent, MonitorTask, MonitorTaskRequest} from '../../types';
import {createMonitor, deleteMonitor, listMonitors, updateMonitor} from '../../api/monitor';
import {getErrorMessage} from '../../lib/utils';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const MonitorList = () => {
    const {message} = App.useApp();
    const actionRef = useRef<ActionType>(null);
    const [form] = Form.useForm();

    const [modalVisible, setModalVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingMonitor, setEditingMonitor] = useState<MonitorTask | null>(null);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loadingAgents, setLoadingAgents] = useState(false);
    const [keyword, setKeyword] = useState('');

    const loadAgents = useCallback(async () => {
        try {
            setLoadingAgents(true);
            const response = await getAgentPaging(1, 500);
            setAgents(response.data.items || []);
        } catch (error: unknown) {
            message.error(getErrorMessage(error, '获取探针列表失败'));
        } finally {
            setLoadingAgents(false);
        }
    }, [message]);

    useEffect(() => {
        void loadAgents();
    }, [loadAgents]);

    const agentOptions = useMemo(
        () =>
            agents.map((agent) => ({
                label: agent.name || agent.hostname || agent.id,
                value: agent.id,
            })),
        [agents],
    );

    const handleCreate = () => {
        setEditingMonitor(null);
        setModalVisible(true);
        form.resetFields();
        form.setFieldsValue({
            name: '',
            type: 'http',
            target: '',
            description: '',
            enabled: true,
            showTargetPublic: true,
            interval: 60,
            agentIds: [],
            httpMethod: 'GET',
            httpTimeout: 60,
            httpExpectedStatusCode: 200,
            httpHeaders: [],
            httpBody: '',
            tcpTimeout: 5,
        });
    };

    const handleEdit = (monitor: MonitorTask) => {
        setEditingMonitor(monitor);
        setModalVisible(true);

        const headers = Object.entries(monitor.httpConfig?.headers || {}).map(([key, value]) => ({
            key,
            value,
        }));

        form.setFieldsValue({
            name: monitor.name,
            type: monitor.type,
            target: monitor.target,
            description: monitor.description,
            enabled: monitor.enabled,
            showTargetPublic: monitor.showTargetPublic ?? true,
            interval: monitor.interval || 60,
            agentIds: monitor.agentIds || [],
            httpMethod: monitor.httpConfig?.method || 'GET',
            httpTimeout: monitor.httpConfig?.timeout || 60,
            httpExpectedStatusCode: monitor.httpConfig?.expectedStatusCode || 200,
            httpExpectedContent: monitor.httpConfig?.expectedContent,
            httpHeaders: headers.length > 0 ? headers : [{key: '', value: ''}],
            httpBody: monitor.httpConfig?.body,
            tcpTimeout: monitor.tcpConfig?.timeout || 5,
        });
    };

    const handleDelete = async (monitor: MonitorTask) => {
        Modal.confirm({
            title: '删除监控项',
            content: `确定要删除监控「${monitor.name}」吗？`,
            centered: true,
            okButtonProps: {danger: true},
            onOk: async () => {
                try {
                    await deleteMonitor(monitor.id);
                    message.success('删除成功');
                    actionRef.current?.reload();
                } catch (error: unknown) {
                    message.error(getErrorMessage(error, '删除失败'));
                }
            },
        });
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);

            const payload: MonitorTaskRequest = {
                name: values.name?.trim(),
                type: values.type,
                target: values.target?.trim(),
                description: values.description?.trim(),
                enabled: values.enabled,
                showTargetPublic: values.showTargetPublic ?? true,
                interval: values.interval || 60,
                agentIds: values.agentIds || [],
            };

            if (values.type === 'tcp') {
                payload.tcpConfig = {
                    timeout: values.tcpTimeout || 5,
                };
            } else {
                const headers: Record<string, string> = {};
                (values.httpHeaders || []).forEach((header: { key?: string; value?: string }) => {
                    const key = header?.key?.trim();
                    if (key) {
                        headers[key] = header?.value ?? '';
                    }
                });

                payload.httpConfig = {
                    method: values.httpMethod || 'GET',
                    timeout: values.httpTimeout || 60,
                    expectedStatusCode: values.httpExpectedStatusCode || 200,
                    expectedContent: values.httpExpectedContent?.trim(),
                    headers: Object.keys(headers).length > 0 ? headers : undefined,
                    body: values.httpBody,
                };
            }

            if (editingMonitor) {
                await updateMonitor(editingMonitor.id, payload);
                message.success('更新成功');
            } else {
                await createMonitor(payload);
                message.success('创建成功');
            }

            setModalVisible(false);
            setEditingMonitor(null);
            form.resetFields();
            actionRef.current?.reload();
        } catch (error: unknown) {
            if (typeof error === 'object' && error !== null && 'errorFields' in error) {
                return;
            }
            message.error(getErrorMessage(error, '保存失败'));
        } finally {
            setSubmitting(false);
        }
    };

    const watchType = Form.useWatch('type', form) || 'http';

    const columns: ProColumns<MonitorTask>[] = [
        {
            title: '名称',
            dataIndex: 'name',
            render: (_, record) => (
                <div className="flex flex-col">
                    <span className="font-medium text-gray-900">{record.name}</span>
                    {record.description ? (
                        <span className="text-xs text-gray-500">{record.description}</span>
                    ) : null}
                </div>
            ),
        },
        {
            title: '类型',
            dataIndex: 'type',
            width: 80,
            render: (type) => (
                <Tag color={type === 'tcp' ? 'blue' : 'green'} className="uppercase">
                    {type}
                </Tag>
            ),
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
                if (!record.agentIds || record.agentIds.length === 0) {
                    return <Tag color="purple">全部节点</Tag>;
                }
                return (
                    <Space wrap size={4}>
                        {record.agentIds.map((id) => (
                            <Tag key={id}>{id}</Tag>
                        ))}
                    </Space>
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
            title: '更新时间',
            dataIndex: 'updatedAt',
            width: 180,
            render: (value: number) => dayjs(value).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: '操作',
            valueType: 'option',
            width: 180,
            render: (_, record) => [
                <Button
                    key="edit"
                    type="link"
                    size="small"
                    icon={<Edit size={14}/>}
                    onClick={() => handleEdit(record)}
                >
                    编辑
                </Button>,
                <Button
                    key="delete"
                    type="link"
                    size="small"
                    icon={<Trash2 size={14}/>}
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
                title="服务监控"
                description="配置 HTTP/TCP 服务可用性检测，集中管理监控策略与探针覆盖范围"
                actions={[
                    {
                        key: 'refresh',
                        label: '刷新',
                        icon: <RefreshCw size={16}/>,
                        onClick: () => actionRef.current?.reload(),
                    },
                    {
                        key: 'create',
                        label: '新建监控',
                        icon: <Plus size={16}/>,
                        type: 'primary',
                        onClick: handleCreate,
                    },
                ]}
            />

            <Divider/>

            <ProTable<MonitorTask>
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
                        placeholder="按名称或目标搜索"
                        allowClear
                        onSearch={(value) => {
                            setKeyword(value.trim());
                            actionRef.current?.reload();
                        }}
                        style={{width: 260}}
                    />,
                    <Button key="add" type="primary" icon={<Plus size={16}/>} onClick={handleCreate}>
                        新建监控
                    </Button>,
                ]}
                request={async (params) => {
                    const {current = 1, pageSize = 10, keyword: kw = ''} = params;
                    try {
                        const response = await listMonitors(current, pageSize, kw as string | undefined);
                        return {
                            data: response.data.items || [],
                            success: true,
                            total: response.data.total,
                        };
                    } catch (error: unknown) {
                        message.error(getErrorMessage(error, '获取监控列表失败'));
                        return {
                            data: [],
                            success: false,
                        };
                    }
                }}
            />

            <Modal
                title={editingMonitor ? '编辑监控项' : '新建监控项'}
                open={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    setEditingMonitor(null);
                }}
                onOk={handleModalOk}
                confirmLoading={submitting}
                width={720}
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        label="名称"
                        name="name"
                        rules={[{required: true, message: '请输入监控名称'}]}
                    >
                        <Input placeholder="例如：支付服务健康检查"/>
                    </Form.Item>

                    <Form.Item label="描述" name="description">
                        <Input placeholder="可选，帮助识别监控用途"/>
                    </Form.Item>

                    <Form.Item
                        label="类型"
                        name="type"
                        rules={[{required: true, message: '请选择监控类型'}]}
                    >
                        <Select
                            options={[
                                {label: 'HTTP / HTTPS', value: 'http'},
                                {label: 'TCP', value: 'tcp'},
                            ]}
                        />
                    </Form.Item>

                    <Form.Item
                        label="目标地址"
                        name="target"
                        rules={[{required: true, message: '请输入目标地址'}]}
                    >
                        <Input placeholder="HTTP示例：https://example.com/health，TCP示例：example.com:3306"/>
                    </Form.Item>

                    <Form.Item label="探针范围" name="agentIds" extra="不选择表示所有探针节点都会执行此监控">
                        <Select
                            mode="multiple"
                            placeholder="选择探针节点（可多选）"
                            options={agentOptions}
                            loading={loadingAgents}
                            allowClear
                        />
                    </Form.Item>

                    <Form.Item
                        label="检测频率 (秒)"
                        name="interval"
                        initialValue={60}
                        rules={[{required: true, message: '请输入检测频率'}]}
                        extra="设置多久执行一次检测，建议不低于 30 秒"
                    >
                        <InputNumber min={10} max={3600} style={{width: '100%'}}/>
                    </Form.Item>

                    <Form.Item label="启用状态" name="enabled" valuePropName="checked">
                        <Switch checkedChildren="启用" unCheckedChildren="停用"/>
                    </Form.Item>

                    <Form.Item
                        label="公开页面显示目标"
                        name="showTargetPublic"
                        valuePropName="checked"
                        extra="控制在公开监控页面是否显示监控目标地址"
                    >
                        <Switch checkedChildren="显示" unCheckedChildren="隐藏"/>
                    </Form.Item>

                    {watchType === 'tcp' ? (
                        <Form.Item label="连接超时 (秒)" name="tcpTimeout" initialValue={5}>
                            <InputNumber min={1} max={120} style={{width: '100%'}}/>
                        </Form.Item>
                    ) : (
                        <>
                            <Form.Item label="HTTP 方法" name="httpMethod" initialValue="GET">
                                <Select options={HTTP_METHODS.map((method) => ({label: method, value: method}))}/>
                            </Form.Item>

                            <Form.Item label="请求超时 (秒)" name="httpTimeout" initialValue={60}>
                                <InputNumber min={1} max={300} style={{width: '100%'}}/>
                            </Form.Item>

                            <Form.Item label="期望状态码" name="httpExpectedStatusCode" initialValue={200}>
                                <InputNumber min={100} max={599} style={{width: '100%'}}/>
                            </Form.Item>

                            <Form.Item label="期望响应内容" name="httpExpectedContent">
                                <Input placeholder="可选，匹配关键字"/>
                            </Form.Item>

                            <Form.Item label="请求头">
                                <Form.List name="httpHeaders">
                                    {(fields, {add, remove}) => (
                                        <div className="space-y-2">
                                            {fields.map(({key, name, ...restField}) => (
                                                <Space key={key} align="baseline" className="flex">
                                                    <Form.Item
                                                        {...restField}
                                                        name={[name, 'key']}
                                                        className="flex-1"
                                                        rules={[{required: false}]}
                                                    >
                                                        <Input placeholder="Header 名称"/>
                                                    </Form.Item>
                                                    <Form.Item
                                                        {...restField}
                                                        name={[name, 'value']}
                                                        className="flex-1"
                                                        rules={[{required: false}]}
                                                    >
                                                        <Input placeholder="Header 值"/>
                                                    </Form.Item>
                                                    <Button
                                                        type="text"
                                                        danger
                                                        icon={<MinusCircle size={16}/>}
                                                        onClick={() => remove(name)}
                                                    />
                                                </Space>
                                            ))}
                                            <Button
                                                type="dashed"
                                                block
                                                icon={<PlusCircle size={16}/>}
                                                onClick={() => add({key: '', value: ''})}
                                            >
                                                添加请求头
                                            </Button>
                                        </div>
                                    )}
                                </Form.List>
                            </Form.Item>

                            <Form.Item label="请求体" name="httpBody">
                                <Input.TextArea rows={4} placeholder="可选，发送自定义请求体"/>
                            </Form.Item>
                        </>
                    )}
                </Form>
            </Modal>
        </div>
    );
};

export default MonitorList;
