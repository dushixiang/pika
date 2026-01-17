import {useEffect} from 'react';
import {App, Form, Input, Modal, Select, Switch} from 'antd';
import {createDDNSConfig, getDDNSConfig, updateDDNSConfig} from '@/api/ddns.ts';
import {getDNSProviders} from '@/api/dnsProvider.ts';
import type {CreateDDNSConfigRequest, UpdateDDNSConfigRequest} from '@/types/ddns.ts';
import {getAgentPaging} from '@/api/agent.ts';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

interface DDNSModalProps {
    open: boolean;
    id?: string; // 如果有 id 则为编辑模式,否则为新建模式
    onCancel: () => void;
    onSuccess: () => void;
}

// 默认 IPv4 API 列表
const defaultIPv4APIs = [
    'https://myip.ipip.net',
    'https://ddns.oray.com/checkip',
    'https://ip.3322.net',
    'https://4.ipw.cn',
    'https://v4.yinghualuo.cn/bejson',
];

// 默认 IPv6 API 列表
const defaultIPv6APIs = [
    'https://speed.neu6.edu.cn/getIP.php',
    'https://v6.ident.me',
    'https://6.ipw.cn',
    'https://v6.yinghualuo.cn/bejson',
];

const DDNSModal = ({open, id, onCancel, onSuccess}: DDNSModalProps) => {
    const {message: messageApi} = App.useApp();
    const [form] = Form.useForm();
    const queryClient = useQueryClient();

    const isEditMode = !!id;

    // 查询探针列表（仅在新建模式下启用）
    const {data: agentsData} = useQuery({
        queryKey: ['agents', 'paging'],
        queryFn: async () => {
            const data = await getAgentPaging(1, 1000);
            return data.data.items || [];
        },
        enabled: open && !isEditMode,
    });

    // 查询 DNS 提供商列表
    const {data: providersData} = useQuery({
        queryKey: ['dns-providers'],
        queryFn: async () => {
            const response = await getDNSProviders();
            // 只显示已启用的 provider
            return (response.data || []).filter(p => p.enabled);
        },
        enabled: open,
    });

    const agents = agentsData || [];
    const providers = providersData || [];

    // 加载配置数据
    useEffect(() => {
        if (open) {
            const loadConfig = async () => {
                if (id) {
                    const resp = await getDDNSConfig(id);
                    let config = resp.data;
                    form.setFieldsValue({
                        ...config,
                        domainsIpv4: (config.domainsIpv4 as string[])?.join('\n'),
                        domainsIpv6: (config.domainsIpv6 as string[])?.join('\n'),
                    });
                } else {
                    form.setFieldsValue({
                        enableIpv4: true,
                        enableIpv6: false,
                        ipv4GetMethod: 'api',
                        ipv6GetMethod: 'api',
                    });
                }
            };
            loadConfig();
        }
    }, [open, id, form]);

    // 创建 DDNS 配置的 mutation
    const createMutation = useMutation({
        mutationFn: (data: CreateDDNSConfigRequest) => createDDNSConfig(data),
        onSuccess: () => {
            messageApi.success('创建成功');
            queryClient.invalidateQueries({queryKey: ['ddns-configs']});
            form.resetFields();
            onSuccess();
        },
        onError: (error: any) => {
            messageApi.error(error.message || '创建失败');
        }
    });

    // 更新 DDNS 配置的 mutation
    const updateMutation = useMutation({
        mutationFn: ({id, data}: { id: string; data: UpdateDDNSConfigRequest }) =>
            updateDDNSConfig(id, data),
        onSuccess: () => {
            messageApi.success('更新成功');
            queryClient.invalidateQueries({queryKey: ['ddns-configs']});
            queryClient.invalidateQueries({queryKey: ['ddns-config', id]});
            form.resetFields();
            onSuccess();
        },
        onError: (error: any) => {
            messageApi.error(error.message || '更新失败');
        }
    });

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            // 处理 IPv4 域名列表
            const domainsIpv4Text = values.domainsIpv4 || '';
            const domainsIpv4 = domainsIpv4Text
                .split('\n')
                .map((line: string) => line.trim())
                .filter((line: string) => line.length > 0);

            // 处理 IPv6 域名列表
            const domainsIpv6Text = values.domainsIpv6 || '';
            const domainsIpv6 = domainsIpv6Text
                .split('\n')
                .map((line: string) => line.trim())
                .filter((line: string) => line.length > 0);

            const data = {
                ...values,
                domainsIpv4,
                domainsIpv6,
            };

            if (isEditMode && id) {
                // 编辑模式
                updateMutation.mutate({id, data: data as UpdateDDNSConfigRequest});
            } else {
                // 新建模式
                createMutation.mutate(data as CreateDDNSConfigRequest);
            }
        } catch (error: any) {
            if (error.errorFields) {
                return;
            }
        }
    };

    const handleCancel = () => {
        form.resetFields();
        onCancel();
    };

    const providerNames: Record<string, string> = {
        aliyun: '阿里云',
        tencentcloud: '腾讯云',
        cloudflare: 'Cloudflare',
        huaweicloud: '华为云',
    };

    return (
        <Modal
            title={isEditMode ? '编辑 DDNS 配置' : '新建 DDNS 配置'}
            open={open}
            onOk={handleOk}
            onCancel={handleCancel}
            confirmLoading={createMutation.isPending || updateMutation.isPending}
            width={700}
            destroyOnHidden
        >
            <Form form={form} layout="vertical">
                <Form.Item label="配置名称" name="name" rules={[{required: true, message: '请输入配置名称'}]}>
                    <Input placeholder="例如:生产环境 DDNS"/>
                </Form.Item>

                {/* 新建模式才显示探针选择器 */}
                {!isEditMode && (
                    <Form.Item label="探针" name="agentId" rules={[{required: true, message: '请选择探针'}]}>
                        <Select
                            showSearch
                            placeholder="选择探针"
                            optionFilterProp="children"
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            options={agents.map((agent) => ({
                                label: agent.name || agent.id,
                                value: agent.id,
                            }))}
                        />
                    </Form.Item>
                )}

                <Form.Item label="DNS 服务商" name="provider" rules={[{required: true, message: '请选择 DNS 服务商'}]}>
                    <Select placeholder="选择已配置的 DNS 服务商" disabled={providers.length === 0}>
                        {providers.map((p) => (
                            <Select.Option key={p.provider} value={p.provider}>
                                {providerNames[p.provider]}
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <div className={'space-y-4'}>
                    {/* IPv4 配置卡片 */}
                    <div className="rounded-lg border dark:border-gray-700 p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <h4 className="font-medium dark:text-white">IPv4 配置</h4>
                            <Form.Item name="enableIpv4" valuePropName="checked" noStyle>
                                <Switch/>
                            </Form.Item>
                        </div>

                        <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.enableIpv4 !== currentValues.enableIpv4}>
                            {() => {
                                const enableIpv4 = form.getFieldValue('enableIpv4');
                                if (!enableIpv4) {
                                    return null;
                                }
                                return <>
                                    <Form.Item
                                        label="域名列表"
                                        name="domainsIpv4"
                                        rules={[
                                            {required: true, message: '请输入至少一个 IPv4 域名'},
                                        ]}
                                        extra="每行输入一个域名,用于 IPv4(A 记录)"
                                    >
                                        <Input.TextArea
                                            rows={3}
                                            placeholder="每行输入一个域名,例如:&#10;ddns.example.com&#10;www.example.com"
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        label="获取方式"
                                        name="ipv4GetMethod"
                                        rules={[{required: true, message: '请选择 IPv4 获取方式'}]}
                                    >
                                        <Select>
                                            <Select.Option value="api">API 获取</Select.Option>
                                            <Select.Option value="interface">网络接口</Select.Option>
                                        </Select>
                                    </Form.Item>

                                    <Form.Item
                                        label="配置值"
                                        name="ipv4GetValue"
                                        extra="留空使用默认 API,或指定网络接口名称(如: eth0)"
                                        tooltip={
                                            <div className="space-y-1">
                                                <div className="font-medium">默认 IPv4 API 列表:</div>
                                                {defaultIPv4APIs.map((api, index) => (
                                                    <div key={index} className="text-xs">{api}</div>
                                                ))}
                                            </div>
                                        }
                                    >
                                        <Input placeholder="留空使用默认 API / 接口名: eth0"/>
                                    </Form.Item>
                                </>
                            }}
                        </Form.Item>
                    </div>

                    {/* IPv6 配置卡片 */}
                    <div className="rounded-lg border dark:border-gray-700 p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <h4 className="font-medium dark:text-white">IPv6 配置</h4>
                            <Form.Item name="enableIpv6" valuePropName="checked" noStyle>
                                <Switch/>
                            </Form.Item>
                        </div>

                        <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.enableIpv6 !== currentValues.enableIpv6}>
                            {() => {
                                const enableIpv6 = form.getFieldValue('enableIpv6');
                                if (!enableIpv6) {
                                    return null;
                                }
                                return <>
                                    <Form.Item
                                        label="域名列表"
                                        name="domainsIpv6"
                                        rules={[
                                            {required: true, message: '请输入至少一个 IPv6 域名'},
                                        ]}
                                        extra="每行输入一个域名,用于 IPv6(AAAA 记录)"
                                    >
                                        <Input.TextArea
                                            rows={3}
                                            placeholder="每行输入一个域名,例如:&#10;ddns-v6.example.com&#10;www-v6.example.com"
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        label="获取方式"
                                        name="ipv6GetMethod"
                                        rules={[{required: true, message: '请选择 IPv6 获取方式'}]}
                                    >
                                        <Select>
                                            <Select.Option value="api">API 获取</Select.Option>
                                            <Select.Option value="interface">网络接口</Select.Option>
                                        </Select>
                                    </Form.Item>

                                    <Form.Item
                                        label="配置值"
                                        name="ipv6GetValue"
                                        extra="留空使用默认 API,或指定网络接口名称(如: eth0)"
                                        tooltip={
                                            <div className="space-y-1">
                                                <div className="font-medium">默认 IPv6 API 列表:</div>
                                                {defaultIPv6APIs.map((api, index) => (
                                                    <div key={index} className="text-xs">{api}</div>
                                                ))}
                                            </div>
                                        }
                                    >
                                        <Input placeholder="留空使用默认 API / 接口名: eth0"/>
                                    </Form.Item>
                                </>
                            }}
                        </Form.Item>
                    </div>
                </div>
            </Form>
        </Modal>
    );
};

export default DDNSModal;
