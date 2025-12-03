import {useEffect} from 'react';
import {App, Button, Card, Form, InputNumber, Space, Switch} from 'antd';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {AlertConfig} from '@/api/property';
import {getAlertConfig, saveAlertConfig} from '@/api/property';
import {getErrorMessage} from '@/lib/utils';

const AlertSettings = () => {
    const [form] = Form.useForm();
    const {message: messageApi} = App.useApp();
    const queryClient = useQueryClient();

    // 获取全局告警配置
    const {data: configData, isLoading: configLoading} = useQuery({
        queryKey: ['alertConfig'],
        queryFn: getAlertConfig,
    });

    // 设置表单默认值
    useEffect(() => {
        if (configData) {
            form.setFieldsValue(configData);
        }
    }, [configData, configLoading, form]);

    // 保存 mutation
    const saveMutation = useMutation({
        mutationFn: (config: AlertConfig) => saveAlertConfig(config),
        onSuccess: () => {
            messageApi.success('告警配置保存成功');
            queryClient.invalidateQueries({queryKey: ['alertConfig']});
        },
        onError: (error: unknown) => {
            messageApi.error(getErrorMessage(error, '保存配置失败'));
        },
    });

    const handleSubmit = async () => {
        const values = await form.validateFields();
        saveMutation.mutate(values as AlertConfig);
    };

    return (
        <div>
            <Form form={form}>
                <Space direction="vertical" className="w-full">
                    <Card title="基本信息" type="inner">
                        <Form.Item label="启用告警" name="enabled" valuePropName="checked">
                            <Switch checkedChildren="开启" unCheckedChildren="关闭"/>
                        </Form.Item>
                    </Card>

                    {/*<Divider orientation="left">告警规则</Divider>*/}

                    {[
                        {key: 'cpu', title: 'CPU 告警规则', thresholdLabel: 'CPU 使用率阈值 (%)', max: 100},
                        {key: 'memory', title: '内存告警规则', thresholdLabel: '内存使用率阈值 (%)', max: 100},
                        {key: 'disk', title: '磁盘告警规则', thresholdLabel: '磁盘使用率阈值 (%)', max: 100},
                        {key: 'network', title: '网速告警规则', thresholdLabel: '网速阈值 (MB/s)', max: 10000},
                    ].map((rule) => (
                        <Card key={rule.key} title={rule.title} type="inner">
                            <Form.Item noStyle shouldUpdate>
                                {({getFieldValue}) => {
                                    const enabled = getFieldValue(['rules', `${rule.key}Enabled`]);
                                    return (
                                        <div className="flex items-center gap-8">
                                            <Form.Item
                                                label="开关"
                                                name={['rules', `${rule.key}Enabled`]}
                                                valuePropName="checked"
                                                className="mb-0"
                                            >
                                                <Switch/>
                                            </Form.Item>
                                            <Form.Item
                                                label={rule.thresholdLabel}
                                                name={['rules', `${rule.key}Threshold`]}
                                                className="mb-0"
                                            >
                                                <InputNumber
                                                    min={0}
                                                    max={rule.max}
                                                    style={{width: '100%'}}
                                                    disabled={!enabled}
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                label="持续时间（秒）"
                                                name={['rules', `${rule.key}Duration`]}
                                                className="mb-0"
                                            >
                                                <InputNumber min={1} max={3600} style={{width: '100%'}}
                                                             disabled={!enabled}/>
                                            </Form.Item>
                                        </div>
                                    );
                                }}
                            </Form.Item>
                        </Card>
                    ))}

                    <Card title="HTTPS 证书告警规则" type="inner">
                        <Form.Item noStyle shouldUpdate>
                            {({getFieldValue}) => {
                                const enabled = getFieldValue(['rules', 'certEnabled']);
                                return (
                                    <div className="flex items-center gap-8">
                                        <Form.Item
                                            label="开关"
                                            name={['rules', 'certEnabled']}
                                            valuePropName="checked"
                                            className="mb-0"
                                        >
                                            <Switch/>
                                        </Form.Item>
                                        <Form.Item
                                            label="证书剩余天数阈值（天）"
                                            name={['rules', 'certThreshold']}
                                            className="mb-0"
                                            tooltip="当证书剩余天数低于此阈值时触发告警"
                                        >
                                            <InputNumber
                                                min={1}
                                                max={365}
                                                style={{width: '100%'}}
                                                disabled={!enabled}
                                            />
                                        </Form.Item>
                                    </div>
                                );
                            }}
                        </Form.Item>
                    </Card>

                    <Card title="服务下线告警规则" type="inner">
                        <Form.Item noStyle shouldUpdate>
                            {({getFieldValue}) => {
                                const enabled = getFieldValue(['rules', 'serviceEnabled']);
                                return (
                                    <div className="flex items-center gap-8">
                                        <Form.Item
                                            label="开关"
                                            name={['rules', 'serviceEnabled']}
                                            valuePropName="checked"
                                            className="mb-0"
                                        >
                                            <Switch/>
                                        </Form.Item>
                                        <Form.Item
                                            label="持续时间（秒）"
                                            name={['rules', 'serviceDuration']}
                                            className="mb-0"
                                            tooltip="服务持续离线多久后触发告警"
                                        >
                                            <InputNumber
                                                min={1}
                                                max={3600}
                                                style={{width: '100%'}}
                                                disabled={!enabled}
                                            />
                                        </Form.Item>
                                    </div>
                                );
                            }}
                        </Form.Item>
                    </Card>

                    <Card title="探针离线告警规则" type="inner">
                        <Form.Item noStyle shouldUpdate>
                            {({getFieldValue}) => {
                                const enabled = getFieldValue(['rules', 'agentOfflineEnabled']);
                                return (
                                    <div className="flex items-center gap-8">
                                        <Form.Item
                                            label="开关"
                                            name={['rules', 'agentOfflineEnabled']}
                                            valuePropName="checked"
                                            className="mb-0"
                                        >
                                            <Switch/>
                                        </Form.Item>
                                        <Form.Item
                                            label="持续时间（秒）"
                                            name={['rules', 'agentOfflineDuration']}
                                            className="mb-0"
                                            tooltip="探针持续离线多久后触发告警"
                                        >
                                            <InputNumber
                                                min={1}
                                                max={3600}
                                                style={{width: '100%'}}
                                                disabled={!enabled}
                                            />
                                        </Form.Item>
                                    </div>
                                );
                            }}
                        </Form.Item>
                    </Card>

                    <Button
                        type="primary"
                        loading={saveMutation.isPending}
                        onClick={handleSubmit}
                    >
                        保存配置
                    </Button>
                </Space>
            </Form>
        </div>
    );
};

export default AlertSettings;
