import {useEffect} from 'react';
import {App, DatePicker, Form, Input, InputNumber, Modal, Select} from 'antd';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import dayjs from 'dayjs';
import {getAgentForAdmin, updateAgentInfo} from '@/api/agent.ts';
import {getErrorMessage} from '@/lib/utils';

interface AgentEditModalProps {
    open: boolean;
    agentId?: string;
    existingTags: string[];
    onCancel: () => void;
    onSuccess: () => void;
}

const AgentEditModal = ({open, agentId, existingTags, onCancel, onSuccess}: AgentEditModalProps) => {
    const {message: messageApi} = App.useApp();
    const [form] = Form.useForm();
    const queryClient = useQueryClient();
    const isEditMode = !!agentId;

    const {
        data: agent,
        isLoading: detailLoading,
        isError: detailError,
        error: detailErrorInfo,
    } = useQuery({
        queryKey: ['admin', 'agents', 'detail', agentId],
        queryFn: async () => {
            const response = await getAgentForAdmin(agentId as string);
            return response.data;
        },
        enabled: open && isEditMode,
    });

    useEffect(() => {
        if (detailError && detailErrorInfo) {
            messageApi.error(getErrorMessage(detailErrorInfo, '加载探针详情失败'));
        }
    }, [detailError, detailErrorInfo, messageApi]);

    useEffect(() => {
        if (!open) {
            return;
        }
        if (!isEditMode) {
            form.resetFields();
            return;
        }
        if (!agent) {
            return;
        }
        form.setFieldsValue({
            name: agent.name,
            tags: agent.tags || [],
            expireTime: agent.expireTime ? dayjs(agent.expireTime) : null,
            visibility: agent.visibility || 'public',
            weight: agent.weight ?? 0,
            remark: agent.remark ?? '',
        });
    }, [open, isEditMode, agent, form]);

    const updateMutation = useMutation({
        mutationFn: (data: {id: string; payload: Record<string, any>}) =>
            updateAgentInfo(data.id, data.payload),
        onSuccess: () => {
            messageApi.success('探针信息更新成功');
            queryClient.invalidateQueries({queryKey: ['admin', 'agents']});
            queryClient.invalidateQueries({queryKey: ['admin', 'agents', 'tags']});
            if (agentId) {
                queryClient.invalidateQueries({queryKey: ['admin', 'agents', 'detail', agentId]});
            }
            onSuccess();
        },
    });

    const handleOk = async () => {
        if (!agentId) {
            return;
        }
        try {
            const values = await form.validateFields();
            const payload: Record<string, any> = {
                name: values.name,
                visibility: values.visibility || 'public',
                tags: values.tags || [],
                weight: values.weight || 0,
                remark: values.remark || '',
            };

            if (values.expireTime) {
                payload.expireTime = values.expireTime.endOf('day').valueOf();
            }

            await updateMutation.mutateAsync({id: agentId, payload});
        } catch (error: unknown) {
            if (typeof error === 'object' && error !== null && 'errorFields' in error) {
                return;
            }
            messageApi.error(getErrorMessage(error, '更新探针信息失败'));
        }
    };

    return (
        <Modal
            title="编辑探针信息"
            open={open}
            onOk={handleOk}
            onCancel={onCancel}
            confirmLoading={updateMutation.isPending}
            okButtonProps={{disabled: detailLoading || !agentId}}
            width={600}
            destroyOnHidden
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    label="名称"
                    name="name"
                    rules={[{required: true, message: '请输入探针名称'}]}
                >
                    <Input placeholder="请输入探针名称"/>
                </Form.Item>
                <Form.Item
                    label="标签"
                    name="tags"
                    extra="可以从已有标签中选择，或输入新标签后按回车添加"
                >
                    <Select
                        mode="tags"
                        placeholder="请选择或输入标签"
                        options={existingTags.map(tag => ({label: tag, value: tag}))}
                        tokenSeparators={[',']}
                    />
                </Form.Item>
                <Form.Item
                    label="到期时间"
                    name="expireTime"
                >
                    <DatePicker
                        style={{width: '100%'}}
                        format="YYYY-MM-DD"
                        placeholder="请选择到期时间"
                    />
                </Form.Item>
                <Form.Item
                    label="可见性"
                    name="visibility"
                    rules={[{required: true, message: '请选择可见性'}]}
                    extra="控制探针在公开页面的可见性"
                >
                    <Select
                        placeholder="请选择可见性"
                        options={[
                            {label: '匿名可见', value: 'public'},
                            {label: '登录可见', value: 'private'},
                        ]}
                    />
                </Form.Item>
                <Form.Item
                    label="权重排序"
                    name="weight"
                    extra="数字越大排序越靠前，默认为0"
                >
                    <InputNumber
                        min={0}
                        step={1}
                        precision={0}
                        placeholder="请输入权重"
                        style={{width: '100%'}}
                    />
                </Form.Item>
                <Form.Item
                    label="备注"
                    name="remark"
                    extra="备注信息"
                >
                    <Input.TextArea
                        rows={3}
                        placeholder="请输入备注信息"
                        maxLength={500}
                        showCount
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default AgentEditModal;
