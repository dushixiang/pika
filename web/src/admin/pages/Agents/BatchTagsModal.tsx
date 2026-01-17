import {useEffect} from 'react';
import {App, Form, Modal, Radio, Select} from 'antd';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {batchUpdateTags} from '@/api/agent.ts';
import {getErrorMessage} from '@/lib/utils';

interface BatchTagsModalProps {
    open: boolean;
    agentIds: string[];
    existingTags: string[];
    onCancel: () => void;
    onSuccess: () => void;
}

const BatchTagsModal = ({open, agentIds, existingTags, onCancel, onSuccess}: BatchTagsModalProps) => {
    const {message: messageApi} = App.useApp();
    const [form] = Form.useForm();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!open) {
            return;
        }
        form.setFieldsValue({
            operation: 'add',
            tags: [],
        });
    }, [open, form]);

    const batchMutation = useMutation({
        mutationFn: (payload: {operation: 'add' | 'remove' | 'replace'; tags: string[]}) =>
            batchUpdateTags({
                agentIds,
                tags: payload.tags,
                operation: payload.operation,
            }),
        onSuccess: (_response, variables) => {
            messageApi.success(
                `成功${variables.operation === 'add' ? '添加' : variables.operation === 'remove' ? '移除' : '替换'}了 ${agentIds.length} 个探针的标签`,
            );
            queryClient.invalidateQueries({queryKey: ['admin', 'agents']});
            queryClient.invalidateQueries({queryKey: ['admin', 'agents', 'tags']});
            onSuccess();
        },
    });

    const handleOk = async () => {
        if (agentIds.length === 0) {
            messageApi.warning('请先选择要操作的探针');
            return;
        }
        try {
            const values = await form.validateFields();
            await batchMutation.mutateAsync({
                operation: values.operation,
                tags: values.tags || [],
            });
        } catch (error: unknown) {
            if (typeof error === 'object' && error !== null && 'errorFields' in error) {
                return;
            }
            messageApi.error(getErrorMessage(error, '批量更新标签失败'));
        }
    };

    return (
        <Modal
            title={`批量操作标签 (已选择 ${agentIds.length} 个探针)`}
            open={open}
            onOk={handleOk}
            onCancel={onCancel}
            confirmLoading={batchMutation.isPending}
            width={600}
            destroyOnHidden
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    label="操作类型"
                    name="operation"
                    rules={[{required: true, message: '请选择操作类型'}]}
                >
                    <Radio.Group>
                        <Radio value="add">添加标签（保留原有标签）</Radio>
                        <Radio value="remove">移除标签（从原有标签中移除）</Radio>
                        <Radio value="replace">替换标签（完全替换为新标签）</Radio>
                    </Radio.Group>
                </Form.Item>
                <Form.Item
                    label="标签"
                    name="tags"
                    rules={[{required: true, message: '请输入或选择标签'}]}
                    extra="可以从已有标签中选择，或输入新标签后按回车添加"
                >
                    <Select
                        mode="tags"
                        placeholder="请选择或输入标签"
                        options={existingTags.map(tag => ({label: tag, value: tag}))}
                        tokenSeparators={[',']}
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default BatchTagsModal;
