import {useState, useEffect} from 'react';
import {App, Modal, Form, Input, Switch, Tabs, Button, Descriptions, Tag} from 'antd';
import {getDNSProviders, upsertDNSProvider, deleteDNSProvider} from '@/api/dnsProvider.ts';
import type {DNSProviderConfig} from '@/types/ddns.ts';
import {getErrorMessage} from '@/lib/utils.ts';

interface DNSProviderModalProps {
    open: boolean;
    onCancel: () => void;
    onSuccess: () => void;
}

const DNSProviderModal = ({open, onCancel, onSuccess}: DNSProviderModalProps) => {
    const {message: messageApi, modal} = App.useApp();
    const [loading, setLoading] = useState(false);
    const [providers, setProviders] = useState<DNSProviderConfig[]>([]);
    const [activeTab, setActiveTab] = useState<string>('aliyun');
    const [form] = Form.useForm();

    useEffect(() => {
        if (open) {
            loadProviders();
        }
    }, [open]);

    const loadProviders = async () => {
        try {
            const response = await getDNSProviders();
            const data = response.data || [];
            setProviders(data);

            // 只设置启用状态，不设置脱敏后的配置值
            data.forEach((provider) => {
                form.setFieldsValue({
                    [`${provider.provider}_enabled`]: provider.enabled,
                });
            });
        } catch (error) {
            messageApi.error('加载 DNS Provider 配置失败');
        }
    };

    const handleSave = async (providerType: string) => {
        try {
            // 获取该 provider 需要验证的字段
            const configFields = getConfigFields(providerType);
            const fieldsToValidate = [
                `${providerType}_enabled`,
                ...configFields.map((field) => `${providerType}_${field}`),
            ];

            // 只验证当前 provider 的字段
            await form.validateFields(fieldsToValidate);
            const values = form.getFieldsValue();

            // 提取该 provider 的配置
            const enabled = values[`${providerType}_enabled`] || false;
            const config: Record<string, string> = {};

            // 根据不同的 provider 类型提取配置字段
            configFields.forEach((field) => {
                const value = values[`${providerType}_${field}`];
                if (value) {
                    config[field] = value;
                }
            });

            // 验证必须有完整的配置字段
            const missingFields = configFields.filter((field) => !config[field]);
            if (missingFields.length > 0) {
                messageApi.error('请填写完整的配置信息');
                return;
            }

            setLoading(true);
            await upsertDNSProvider({
                provider: providerType as any,
                enabled,
                config,
            });

            messageApi.success('保存成功');
            await loadProviders();
            onSuccess();
        } catch (error: any) {
            if (error.errorFields) {
                // 表单验证失败
                return;
            }
            messageApi.error(getErrorMessage(error, '保存失败'));
            console.error('保存 DNS Provider 失败:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = (providerType: string) => {
        modal.confirm({
            title: '删除 DNS Provider 配置',
            content: `确定要删除 ${getProviderName(providerType)} 的配置吗？`,
            okButtonProps: {danger: true},
            onOk: async () => {
                try {
                    await deleteDNSProvider(providerType);
                    messageApi.success('删除成功');
                    loadProviders();
                    onSuccess();

                    // 清空表单
                    const configFields = getConfigFields(providerType);
                    const fieldsToReset = [
                        `${providerType}_enabled`,
                        ...configFields.map((field) => `${providerType}_${field}`),
                    ];
                    form.resetFields(fieldsToReset);
                } catch (error: unknown) {
                    messageApi.error(getErrorMessage(error, '删除失败'));
                }
            },
        });
    };

    const getConfigFields = (providerType: string): string[] => {
        switch (providerType) {
            case 'aliyun':
                return ['accessKeyId', 'accessKeySecret'];
            case 'tencentcloud':
                return ['secretId', 'secretKey'];
            case 'cloudflare':
                return ['apiToken'];
            case 'huaweicloud':
                return ['accessKeyId', 'secretAccessKey', 'region'];
            default:
                return [];
        }
    };

    const getProviderName = (providerType: string): string => {
        const names: Record<string, string> = {
            aliyun: '阿里云',
            tencentcloud: '腾讯云',
            cloudflare: 'Cloudflare',
            huaweicloud: '华为云',
        };
        return names[providerType] || providerType;
    };

    const getProviderConfig = (providerType: string): DNSProviderConfig | undefined => {
        return providers.find((p) => p.provider === providerType);
    };

    const isProviderConfigured = (providerType: string): boolean => {
        return providers.some((p) => p.provider === providerType);
    };

    const renderProviderForm = (providerType: string) => {
        const providerConfig = getProviderConfig(providerType);
        const configured = !!providerConfig;

        // 如果已配置，显示只读信息
        if (configured && providerConfig) {
            return (
                <div>
                    <Descriptions bordered size="small" column={1}>
                        <Descriptions.Item label="状态">
                            <Tag color={providerConfig.enabled ? 'green' : 'default'}>
                                {providerConfig.enabled ? '已启用' : '已禁用'}
                            </Tag>
                        </Descriptions.Item>
                        {Object.entries(providerConfig.config).map(([key, value]) => (
                            <Descriptions.Item key={key} label={key}>
                                <code className="text-gray-600">{value}</code>
                            </Descriptions.Item>
                        ))}
                    </Descriptions>

                    <div className="mt-4">
                        <Button danger onClick={() => handleDelete(providerType)}>
                            删除配置
                        </Button>
                    </div>
                </div>
            );
        }

        // 未配置时显示表单
        return (
            <Form form={form} layout="vertical">
                <Form.Item
                    label="启用"
                    name={`${providerType}_enabled`}
                    valuePropName="checked"
                >
                    <Switch />
                </Form.Item>

                {providerType === 'aliyun' && (
                    <>
                        <Form.Item
                            label="AccessKey ID"
                            name={`${providerType}_accessKeyId`}
                            rules={[{required: true, message: '请输入 AccessKey ID'}]}
                        >
                            <Input placeholder="输入阿里云 AccessKey ID" />
                        </Form.Item>
                        <Form.Item
                            label="AccessKey Secret"
                            name={`${providerType}_accessKeySecret`}
                            rules={[{required: true, message: '请输入 AccessKey Secret'}]}
                        >
                            <Input.Password placeholder="输入阿里云 AccessKey Secret" />
                        </Form.Item>
                    </>
                )}

                {providerType === 'tencentcloud' && (
                    <>
                        <Form.Item
                            label="Secret ID"
                            name={`${providerType}_secretId`}
                            rules={[{required: true, message: '请输入 Secret ID'}]}
                        >
                            <Input placeholder="输入腾讯云 Secret ID" />
                        </Form.Item>
                        <Form.Item
                            label="Secret Key"
                            name={`${providerType}_secretKey`}
                            rules={[{required: true, message: '请输入 Secret Key'}]}
                        >
                            <Input.Password placeholder="输入腾讯云 Secret Key" />
                        </Form.Item>
                    </>
                )}

                {providerType === 'cloudflare' && (
                    <Form.Item
                        label="API Token"
                        name={`${providerType}_apiToken`}
                        rules={[{required: true, message: '请输入 API Token'}]}
                    >
                        <Input.Password placeholder="输入 Cloudflare API Token" />
                    </Form.Item>
                )}

                {providerType === 'huaweicloud' && (
                    <>
                        <Form.Item
                            label="AccessKey ID"
                            name={`${providerType}_accessKeyId`}
                            rules={[{required: true, message: '请输入 AccessKey ID'}]}
                        >
                            <Input placeholder="输入华为云 AccessKey ID" />
                        </Form.Item>
                        <Form.Item
                            label="Secret Access Key"
                            name={`${providerType}_secretAccessKey`}
                            rules={[{required: true, message: '请输入 Secret Access Key'}]}
                        >
                            <Input.Password placeholder="输入华为云 Secret Access Key" />
                        </Form.Item>
                        <Form.Item
                            label="区域"
                            name={`${providerType}_region`}
                        >
                            <Input placeholder="例如：cn-south-1（可选，默认 cn-south-1）" />
                        </Form.Item>
                    </>
                )}

                <Button type="primary" loading={loading} onClick={() => handleSave(providerType)}>
                    保存
                </Button>
            </Form>
        );
    };

    const tabItems = [
        {
            key: 'aliyun',
            label: '阿里云',
            children: renderProviderForm('aliyun'),
        },
        {
            key: 'tencentcloud',
            label: '腾讯云',
            children: renderProviderForm('tencentcloud'),
        },
        {
            key: 'cloudflare',
            label: 'Cloudflare',
            children: renderProviderForm('cloudflare'),
        },
        {
            key: 'huaweicloud',
            label: '华为云',
            children: renderProviderForm('huaweicloud'),
        },
    ];

    return (
        <Modal
            title="DNS Provider 配置管理"
            open={open}
            onCancel={onCancel}
            footer={null}
            width={700}
            destroyOnHidden
        >
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
        </Modal>
    );
};

export default DNSProviderModal;
