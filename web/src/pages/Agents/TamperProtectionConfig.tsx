import React, {useEffect, useState} from 'react';
import {Alert, App, Button, Card, Form, Input, List, Space, Switch} from 'antd';
import {Plus, Save, Shield, Trash2} from 'lucide-react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {getTamperConfig, updateTamperConfig} from '@/api/tamper';
import {getErrorMessage} from '@/lib/utils';

interface TamperProtectionConfigProps {
    agentId: string;
}

const TamperProtectionConfig: React.FC<TamperProtectionConfigProps> = ({agentId}) => {
    const {message} = App.useApp();
    const [form] = Form.useForm();
    const queryClient = useQueryClient();
    const [editPaths, setEditPaths] = useState<string[]>([]);
    const [newPath, setNewPath] = useState('');

    // 获取防篡改配置
    const {data: config, isLoading} = useQuery({
        queryKey: ['tamperConfig', agentId],
        queryFn: async () => {
            const response = await getTamperConfig(agentId);
            if (response.data.success && response.data.data) {
                return response.data.data;
            }
            return null;
        },
    });

    // 保存配置 mutation
    const saveMutation = useMutation({
        mutationFn: async () => {
            const values = form.getFieldsValue();
            return updateTamperConfig(agentId, values.enabled, editPaths);
        },
        onSuccess: () => {
            message.success('配置已保存');
            queryClient.invalidateQueries({queryKey: ['tamperConfig', agentId]});
        },
        onError: (error: unknown) => {
            console.error('Failed to save config:', error);
            message.error(getErrorMessage(error, '配置保存失败'));
        },
    });

    // 添加路径
    const handleAddPath = () => {
        if (newPath.trim() && !editPaths.includes(newPath.trim())) {
            setEditPaths([...editPaths, newPath.trim()]);
            setNewPath('');
        }
    };

    // 删除路径
    const handleRemovePath = (path: string) => {
        setEditPaths(editPaths.filter(p => p !== path));
    };

    // 初始化表单值
    useEffect(() => {
        if (config) {
            setEditPaths(config.paths || []);
            form.setFieldsValue({
                enabled: config.enabled || false,
            });
        } else {
            setEditPaths([]);
            form.setFieldsValue({
                enabled: false,
            });
        }
    }, [config, form]);

    return (
        <Card
            title={
                <div className="flex items-center gap-2">
                    <Shield size={18}/>
                    <span>防篡改保护配置</span>
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
            <Space orientation="vertical" style={{width: '100%'}} size="large">
                <Alert
                    title="防篡改保护通过设置目录的不可变属性来防止文件被修改、删除或重命名。配置更新后将实时同步到探针。"
                    type="info"
                    showIcon
                    icon={<Shield size={16}/>}
                />

                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                        enabled: false,
                    }}
                >
                    <Form.Item
                        label="启用防篡改保护"
                        name="enabled"
                        valuePropName="checked"
                        extra="开启后将对配置的目录进行实时监控和保护"
                    >
                        <Switch
                            checkedChildren="已启用"
                            unCheckedChildren="已禁用"
                        />
                    </Form.Item>
                </Form>

                <div>
                    <div className="mb-2 text-sm font-medium">受保护的目录列表</div>
                    <Space.Compact style={{width: '100%'}} className="mb-3">
                        <Input
                            placeholder="输入要保护的目录路径，如 /etc/nginx"
                            value={newPath}
                            onChange={(e) => setNewPath(e.target.value)}
                            onPressEnter={handleAddPath}
                        />
                        <Button
                            type="primary"
                            icon={<Plus size={16}/>}
                            onClick={handleAddPath}
                        >
                            添加
                        </Button>
                    </Space.Compact>

                    {editPaths.length === 0 ? (
                        <div className="rounded border border-dashed border-gray-300 p-8 text-center">
                            <Shield size={48} className="mx-auto mb-2 text-gray-300"/>
                            <p className="text-sm text-gray-500">暂未配置保护目录</p>
                        </div>
                    ) : (
                        <List
                            bordered
                            dataSource={editPaths}
                            renderItem={(path) => (
                                <List.Item
                                    actions={[
                                        <Button
                                            key="delete"
                                            type="text"
                                            danger
                                            icon={<Trash2 size={16}/>}
                                            onClick={() => handleRemovePath(path)}
                                        />,
                                    ]}
                                >
                                    <span className="font-mono text-sm">{path}</span>
                                </List.Item>
                            )}
                        />
                    )}
                </div>

                {config?.applyStatus && (
                    <Alert
                        title={
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

export default TamperProtectionConfig;
