import React, {useEffect} from 'react';
import {Alert, App, Button, Card, Form, Space, Switch} from 'antd';
import {Save, Terminal} from 'lucide-react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {SSHLoginConfig as SSHLoginConfigType} from '@/types';
import {getSSHLoginConfig, updateSSHLoginConfig} from '@/api/agent';
import {getErrorMessage} from '@/lib/utils';

interface SSHLoginConfigProps {
    agentId: string;
}

const SSHLoginConfig: React.FC<SSHLoginConfigProps> = ({agentId}) => {
    const {message} = App.useApp();
    const [form] = Form.useForm();
    const queryClient = useQueryClient();

    // 获取 SSH 登录监控配置
    const {data: config, isLoading} = useQuery({
        queryKey: ['sshLoginConfig', agentId],
        queryFn: () => getSSHLoginConfig(agentId),
    });

    // 保存配置 mutation
    const saveMutation = useMutation({
        mutationFn: async () => {
            const values = form.getFieldsValue();
            return updateSSHLoginConfig(agentId, {
                enabled: values.enabled,
                recordFailed: values.recordFailed,
            });
        },
        onSuccess: () => {
            message.success('配置已保存');
            queryClient.invalidateQueries({queryKey: ['sshLoginConfig', agentId]});
        },
        onError: (error: unknown) => {
            console.error('Failed to save SSH login config:', error);
            message.error(getErrorMessage(error, '配置保存失败'));
        },
    });

    // 初始化表单值
    useEffect(() => {
        if (config) {
            form.setFieldsValue({
                enabled: config.enabled || false,
                recordFailed: config.recordFailed !== undefined ? config.recordFailed : true,
            });
        } else {
            form.setFieldsValue({
                enabled: false,
                recordFailed: true,
            });
        }
    }, [config, form]);

    return (
        <Card
            title={
                <div className="flex items-center gap-2">
                    <Terminal size={18}/>
                    <span>SSH 登录监控配置</span>
                </div>
            }
            extra={
                <Button
                    type="primary"
                    icon={<Save size={16}/>}
                    onClick={() => saveMutation.mutate()}
                    loading={saveMutation.isPending}
                >
                    保存配置
                </Button>
            }
            loading={isLoading}
        >
            <Space direction="vertical" style={{width: '100%'}} size="large">
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                        enabled: false,
                        recordFailed: true,
                    }}
                >
                    <Form.Item
                        label="启用监控"
                        name="enabled"
                        valuePropName="checked"
                        extra={'启用后，探针将自动安装 PAM Hook 并开始监控 SSH 登录事件'}
                    >
                        <Switch
                            checkedChildren="已启用"
                            unCheckedChildren="已禁用"
                        />
                    </Form.Item>

                    <Form.Item
                        label="记录失败登录"
                        name="recordFailed"
                        valuePropName="checked"
                        extra={'是否记录失败的 SSH 登录尝试（有助于发现暴力破解攻击）'}
                    >
                        <Switch
                            checkedChildren="记录"
                            unCheckedChildren="不记录"
                        />
                    </Form.Item>
                </Form>

                {config?.applyStatus && (
                    <Alert
                        message={
                            config.applyStatus === 'success' ? '配置应用成功' :
                                config.applyStatus === 'failed' ? '配置应用失败' :
                                    '配置应用中...'
                        }
                        description={config.applyMessage}
                        type={
                            config.applyStatus === 'success' ? 'success' :
                                config.applyStatus === 'failed' ? 'error' :
                                    'info'
                        }
                        showIcon
                    />
                )}
            </Space>
        </Card>
    );
};

export default SSHLoginConfig;
