import { useEffect, useMemo } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch } from 'antd';
import { MinusCircle, PlusCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listAgentsByAdmin } from '@/api/agent.ts';
import { createMonitor, getMonitor, updateMonitor } from '@/api/monitor.ts';
import type { Agent, MonitorTaskRequest } from '@/types';
import { getErrorMessage } from '@/lib/utils';
import { hasText } from "@/lib/strings.ts";

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

interface MonitorModalProps {
    open: boolean;
    monitorId?: string;
    onCancel: () => void;
    onSuccess: () => void;
}

const MonitorModal = ({ open, monitorId, onCancel, onSuccess }: MonitorModalProps) => {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const queryClient = useQueryClient();
    const isEditMode = hasText(monitorId);

    const {
        data: agents = [],
        isLoading: loadingAgents,
        isError: agentsError,
        error: agentsErrorDetail,
    } = useQuery({
        queryKey: ['agents', 'paging'],
        queryFn: async () => {
            const response = await listAgentsByAdmin();
            return response.data || [];
        },
        enabled: open,
    });

    const {
        data: monitor,
        isLoading: detailLoading,
        isError: detailError,
        error: detailErrorDetail,
    } = useQuery({
        queryKey: ['admin', 'monitors', 'detail', monitorId],
        queryFn: async () => {
            const response = await getMonitor(monitorId);
            return response.data;
        },
        enabled: open && isEditMode,
    });

    useEffect(() => {
        if (agentsError && agentsErrorDetail) {
            message.error(getErrorMessage(agentsErrorDetail, '获取探针列表失败'));
        }
    }, [agentsError, agentsErrorDetail, message]);

    useEffect(() => {
        if (detailError && detailErrorDetail) {
            message.error(getErrorMessage(detailErrorDetail, '获取监控详情失败'));
        }
    }, [detailError, detailErrorDetail, message]);

    const agentOptions = useMemo(
        () =>
            agents.map((agent: Agent) => ({
                label: agent.name || agent.hostname || agent.id,
                value: agent.id,
            })),
        [agents],
    );

    useEffect(() => {
        if (!open) {
            return;
        }
        if (!isEditMode) {
            form.resetFields();
            form.setFieldsValue({
                name: '',
                type: 'http',
                target: '',
                description: '',
                enabled: true,
                showTargetPublic: true,
                visibility: 'public',
                interval: 60,
                agentMode: 'include',
                agentIds: [],
                excludeAgentIds: [],
                tags: [],
                httpMethod: 'GET',
                httpTimeout: 60,
                httpExpectedStatusCode: 200,
                httpHeaders: [{ key: '', value: '' }],
                httpBody: '',
                tcpTimeout: 5,
                icmpTimeout: 5,
                icmpCount: 4,
            });
            return;
        }
        if (!monitor) {
            return;
        }
        const headers = Object.entries(monitor.httpConfig?.headers || {}).map(([key, value]) => ({
            key,
            value,
        }));

        form.resetFields();
        form.setFieldsValue({
            name: monitor.name,
            type: monitor.type,
            target: monitor.target,
            description: monitor.description,
            enabled: monitor.enabled,
            showTargetPublic: monitor.showTargetPublic ?? true,
            visibility: monitor.visibility || 'public',
            interval: monitor.interval || 60,
            agentMode: monitor.agentMode || 'include',
            agentIds: monitor.agentIds || [],
            excludeAgentIds: monitor.excludeAgentIds || [],
            tags: monitor.tags || [],
            httpMethod: monitor.httpConfig?.method || 'GET',
            httpTimeout: monitor.httpConfig?.timeout || 60,
            httpExpectedStatusCode: monitor.httpConfig?.expectedStatusCode || 200,
            httpExpectedContent: monitor.httpConfig?.expectedContent,
            httpHeaders: headers.length > 0 ? headers : [{ key: '', value: '' }],
            httpBody: monitor.httpConfig?.body,
            tcpTimeout: monitor.tcpConfig?.timeout || 5,
            icmpTimeout: monitor.icmpConfig?.timeout || 5,
            icmpCount: monitor.icmpConfig?.count || 4,
        });
    }, [open, isEditMode, monitor, form]);

    const createMutation = useMutation({
        mutationFn: (payload: MonitorTaskRequest) => createMonitor(payload),
        onSuccess: () => {
            message.success('创建成功');
            queryClient.invalidateQueries({ queryKey: ['admin', 'monitors'] });
            onSuccess();
        },
    });

    const updateMutation = useMutation({
        mutationFn: (payload: MonitorTaskRequest) => updateMonitor(monitorId, payload),
        onSuccess: () => {
            message.success('更新成功');
            queryClient.invalidateQueries({ queryKey: ['admin', 'monitors'] });
            if (monitorId !== undefined) {
                queryClient.invalidateQueries({ queryKey: ['admin', 'monitors', 'detail', monitorId] });
            }
            onSuccess();
        },
    });

    const handleOk = async () => {
        try {
            const values = await form.validateFields();

            const payload: MonitorTaskRequest = {
                name: values.name?.trim(),
                type: values.type,
                target: values.target?.trim(),
                description: values.description?.trim(),
                enabled: values.enabled,
                showTargetPublic: values.showTargetPublic ?? true,
                visibility: values.visibility || 'public',
                interval: values.interval || 60,
                agentMode: values.agentMode || 'include',
                agentIds: values.agentMode === 'include' ? (values.agentIds || []) : [],
                excludeAgentIds: values.agentMode === 'exclude' ? (values.excludeAgentIds || []) : [],
                tags: values.tags || [],
            };

            if (values.type === 'tcp') {
                payload.tcpConfig = {
                    timeout: values.tcpTimeout || 5,
                };
            } else if (values.type === 'icmp' || values.type === 'ping') {
                payload.icmpConfig = {
                    timeout: values.icmpTimeout || 5,
                    count: values.icmpCount || 4,
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

            if (isEditMode) {
                await updateMutation.mutateAsync(payload);
            } else {
                await createMutation.mutateAsync(payload);
            }
        } catch (error: unknown) {
            if (typeof error === 'object' && error !== null && 'errorFields' in error) {
                return;
            }
            message.error(getErrorMessage(error, isEditMode ? '更新失败' : '创建失败'));
        }
    };

    const watchType = Form.useWatch('type', form) || 'http';
    const watchAgentMode = Form.useWatch('agentMode', form) || 'include';
    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    return (
        <Modal
            title={isEditMode ? '编辑监控项' : '新建监控项'}
            open={open}
            onCancel={onCancel}
            onOk={handleOk}
            confirmLoading={isSubmitting}
            okButtonProps={{ disabled: isEditMode && detailLoading }}
            width={720}
            destroyOnHidden
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    label="名称"
                    name="name"
                    rules={[{ required: true, message: '请输入监控名称' }]}
                >
                    <Input placeholder="例如：支付服务健康检查" />
                </Form.Item>

                <Form.Item label="描述" name="description">
                    <Input placeholder="可选，帮助识别监控用途" />
                </Form.Item>

                <Form.Item
                    label="类型"
                    name="type"
                    rules={[{ required: true, message: '请选择监控类型' }]}
                >
                    <Select
                        options={[
                            { label: 'HTTP / HTTPS', value: 'http' },
                            { label: 'TCP', value: 'tcp' },
                            { label: 'ICMP (Ping)', value: 'icmp' },
                        ]}
                    />
                </Form.Item>

                <Form.Item
                    label="目标地址"
                    name="target"
                    rules={[{ required: true, message: '请输入目标地址' }]}
                >
                    <Input placeholder={
                        watchType === 'icmp'
                            ? 'ICMP示例：8.8.8.8 或 google.com'
                            : watchType === 'tcp'
                                ? 'TCP示例：example.com:3306'
                                : 'HTTP示例：https://example.com/health'
                    } />
                </Form.Item>

                <Form.Item label="探针模式" name="agentMode" extra="选择探针的匹配方式">
                    <Select
                        options={[
                            { label: '包含指定探针', value: 'include' },
                            { label: '排除指定探针', value: 'exclude' },
                        ]}
                    />
                </Form.Item>

                {watchAgentMode === 'include' ? (
                    <Form.Item label="包含探针" name="agentIds" extra="选择特定探针节点执行此监控，不选则所有探针执行">
                        <Select
                            mode="multiple"
                            placeholder="选择探针节点（可多选）"
                            options={agentOptions}
                            loading={loadingAgents}
                            allowClear
                        />
                    </Form.Item>
                ) : (
                    <Form.Item label="排除探针" name="excludeAgentIds" extra="选择要排除的探针节点，未选中的探针将执行此监控">
                        <Select
                            mode="multiple"
                            placeholder="选择要排除的探针节点（可多选）"
                            options={agentOptions}
                            loading={loadingAgents}
                            allowClear
                        />
                    </Form.Item>
                )}

                <Form.Item
                    label="检测频率 (秒)"
                    name="interval"
                    initialValue={60}
                    rules={[{ required: true, message: '请输入检测频率' }]}
                    extra="设置多久执行一次检测，建议不低于 30 秒"
                >
                    <InputNumber min={10} max={3600} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item label="启用状态" name="enabled" valuePropName="checked">
                    <Switch checkedChildren="启用" unCheckedChildren="停用" />
                </Form.Item>

                <Form.Item
                    label="公开页面显示目标"
                    name="showTargetPublic"
                    valuePropName="checked"
                    extra="控制在公开监控页面是否显示监控目标地址"
                >
                    <Switch checkedChildren="显示" unCheckedChildren="隐藏" />
                </Form.Item>

                <Form.Item
                    label="可见性"
                    name="visibility"
                    rules={[{ required: true, message: '请选择可见性' }]}
                    extra="控制监控任务在公开页面的可见性"
                >
                    <Select
                        placeholder="请选择可见性"
                        options={[
                            { label: '匿名可见', value: 'public' },
                            { label: '登录可见', value: 'private' },
                        ]}
                    />
                </Form.Item>

                {watchType === 'tcp' ? (
                    <Form.Item label="连接超时 (秒)" name="tcpTimeout" initialValue={5}>
                        <InputNumber min={1} max={120} style={{ width: '100%' }} />
                    </Form.Item>
                ) : watchType === 'icmp' ? (
                    <>
                        <Form.Item label="Ping 超时 (秒)" name="icmpTimeout" initialValue={5}>
                            <InputNumber min={1} max={60} style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item
                            label="Ping 次数"
                            name="icmpCount"
                            initialValue={4}
                            extra="单次检测发送的 ICMP 包数量"
                        >
                            <InputNumber min={1} max={10} style={{ width: '100%' }} />
                        </Form.Item>
                    </>
                ) : (
                    <>
                        <Form.Item label="HTTP 方法" name="httpMethod" initialValue="GET">
                            <Select options={HTTP_METHODS.map((method) => ({ label: method, value: method }))} />
                        </Form.Item>

                        <Form.Item label="请求超时 (秒)" name="httpTimeout" initialValue={60}>
                            <InputNumber min={1} max={300} style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item label="期望状态码" name="httpExpectedStatusCode" initialValue={200}>
                            <InputNumber min={100} max={599} style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item label="期望响应内容" name="httpExpectedContent">
                            <Input placeholder="可选，匹配关键字" />
                        </Form.Item>

                        <Form.Item label="请求头">
                            <Form.List name="httpHeaders">
                                {(fields, { add, remove }) => (
                                    <div className="space-y-2">
                                        {fields.map(({ key, name, ...restField }) => (
                                            <Space key={key} align="baseline" className="flex">
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'key']}
                                                    className="flex-1"
                                                    rules={[{ required: false }]}
                                                >
                                                    <Input placeholder="Header 名称" />
                                                </Form.Item>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'value']}
                                                    className="flex-1"
                                                    rules={[{ required: false }]}
                                                >
                                                    <Input placeholder="Header 值" />
                                                </Form.Item>
                                                <Button
                                                    type="text"
                                                    danger
                                                    icon={<MinusCircle size={16} />}
                                                    onClick={() => remove(name)}
                                                />
                                            </Space>
                                        ))}
                                        <Button
                                            type="dashed"
                                            block
                                            icon={<PlusCircle size={16} />}
                                            onClick={() => add({ key: '', value: '' })}
                                        >
                                            添加请求头
                                        </Button>
                                    </div>
                                )}
                            </Form.List>
                        </Form.Item>

                        <Form.Item label="请求体" name="httpBody">
                            <Input.TextArea rows={4} placeholder="可选，发送自定义请求体" />
                        </Form.Item>
                    </>
                )}
            </Form>
        </Modal>
    );
};

export default MonitorModal;
