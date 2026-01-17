import {useEffect} from 'react';
import {App, Form, Input, Modal} from 'antd';
import {generateApiKey, getApiKey, updateApiKeyName} from '@/api/apiKey.ts';
import type {ApiKey, GenerateApiKeyRequest, UpdateApiKeyNameRequest} from '@/types';
import {getErrorMessage} from '@/lib/utils';

interface ApiKeyModalProps {
    open: boolean;
    apiKeyId?: string; // 如果有 id 则为编辑模式，否则为新建模式
    onCancel: () => void;
    onSuccess: (apiKey?: ApiKey) => void; // 新建时传递新生成的 API Key
}

const ApiKeyModal = ({open, apiKeyId, onCancel, onSuccess}: ApiKeyModalProps) => {
    const {message: messageApi} = App.useApp();
    const [form] = Form.useForm();
    const isEditMode = !!apiKeyId;

    // 加载 API Key 详情（编辑模式）
    useEffect(() => {
        if (open && apiKeyId) {
            const loadApiKey = async () => {
                try {
                    const response = await getApiKey(apiKeyId);
                    form.setFieldsValue({
                        name: response.data.name,
                    });
                } catch (error) {
                    messageApi.error(getErrorMessage(error, '加载 API 密钥详情失败'));
                }
            };
            loadApiKey();
        } else if (open) {
            form.resetFields();
        }
    }, [open, apiKeyId, form, messageApi]);

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            const name = values.name?.trim();

            if (!name) {
                messageApi.warning('名称不能为空');
                return;
            }

            if (isEditMode) {
                // 编辑模式
                const updateData: UpdateApiKeyNameRequest = {name};
                await updateApiKeyName(apiKeyId, updateData);
                messageApi.success('更新成功');
                onSuccess();
            } else {
                // 创建模式
                const createData: GenerateApiKeyRequest = {name};
                const response = await generateApiKey(createData);
                messageApi.success('API密钥生成成功');
                onSuccess(response.data); // 传递新生成的 API Key
            }
        } catch (error: unknown) {
            if (typeof error === 'object' && error !== null && 'errorFields' in error) {
                return;
            }
            messageApi.error(getErrorMessage(error, '操作失败'));
        }
    };

    return (
        <Modal
            title={isEditMode ? '编辑API密钥' : '生成API密钥'}
            open={open}
            onOk={handleOk}
            onCancel={onCancel}
            okText={isEditMode ? '保存' : '生成'}
            cancelText="取消"
            destroyOnClose
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
    );
};

export default ApiKeyModal;
