import {useEffect, useState} from 'react';
import {App, Button, Card, Form, Input, Space, Spin, Upload} from 'antd';
import {Upload as UploadIcon} from 'lucide-react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {SystemConfig} from '../../api/system-config';
import {getSystemConfig, saveSystemConfig} from '../../api/system-config';
import {getErrorMessage} from '../../lib/utils';
import type {RcFile} from 'antd/es/upload/interface';

const SystemConfigComponent = () => {
    const [form] = Form.useForm();
    const {message: messageApi} = App.useApp();
    const queryClient = useQueryClient();
    const [logoPreview, setLogoPreview] = useState<string>('');
    const [uploading, setUploading] = useState(false);

    // 获取系统配置
    const {data: config, isLoading} = useQuery({
        queryKey: ['systemConfig'],
        queryFn: getSystemConfig,
    });

    // 保存 mutation
    const saveMutation = useMutation({
        mutationFn: saveSystemConfig,
        onSuccess: () => {
            messageApi.success('保存成功');
            queryClient.invalidateQueries({queryKey: ['systemConfig']});
            // 刷新页面以应用新的系统配置
            window.location.reload();
        },
        onError: (error: unknown) => {
            messageApi.error(getErrorMessage(error, '保存失败'));
        },
    });

    // 初始化表单值
    useEffect(() => {
        if (config) {
            form.setFieldsValue({
                systemNameEn: config.systemNameEn,
                systemNameZh: config.systemNameZh,
                icpCode: config.icpCode,
            });
            if (config.logoBase64) {
                setLogoPreview(config.logoBase64);
            }
        }
    }, [config, form]);

    // 将文件转换为 base64
    const fileToBase64 = (file: RcFile): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
        });
    };

    // 处理图片上传前的验证
    const beforeUpload = (file: RcFile) => {
        const isImage = file.type.startsWith('image/');
        if (!isImage) {
            messageApi.error('只能上传图片文件！');
            return false;
        }

        // 限制大小为 500KB
        const isLt500K = file.size / 1024 < 500;
        if (!isLt500K) {
            messageApi.error('图片大小不能超过 500KB！');
            return false;
        }

        // 转换为 base64
        setUploading(true);
        fileToBase64(file)
            .then((base64) => {
                setLogoPreview(base64);
                setUploading(false);
            })
            .catch((error) => {
                console.error('转换图片失败:', error);
                messageApi.error('转换图片失败');
                setUploading(false);
            });

        return false; // 阻止自动上传
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            saveMutation.mutate({
                systemNameEn: values.systemNameEn,
                systemNameZh: values.systemNameZh,
                logoBase64: logoPreview,
                icpCode: values.icpCode || '',
            } as SystemConfig);
        } catch (error) {
            // 表单验证失败
        }
    };

    const handleReset = () => {
        // 重置为当前配置的值
        if (config) {
            form.setFieldsValue({
                systemNameEn: config.systemNameEn,
                systemNameZh: config.systemNameZh,
                icpCode: config.icpCode,
            });
            setLogoPreview(config.logoBase64 || '');
        }
    };

    // 获取 Logo 显示 URL
    const getLogoUrl = () => {
        if (logoPreview) {
            return logoPreview;
        }
        return '/logo.png';
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-20">
                <Spin size="large"/>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-4">
                <h2 className="text-xl font-bold">系统配置</h2>
                <p className="text-gray-500 mt-2">配置系统名称和 Logo，这些设置将在公共页面和管理后台显示</p>
            </div>

            <Form form={form} layout="vertical" onFinish={handleSave}>
                <Space direction={'vertical'} className={'w-full'}>
                    <Card
                        title="系统基本信息"
                        type="inner"
                        className="mb-4"
                    >
                        <div className={'flex items-center gap-2'}>
                            <Form.Item
                                label="系统英文名称"
                                name="systemNameEn"
                                rules={[
                                    {required: true, message: '请输入系统英文名称'},
                                    {max: 50, message: '系统名称不能超过 50 个字符'},
                                ]}
                            >
                                <Input placeholder="例如：Pika Monitor"/>
                            </Form.Item>

                            <Form.Item
                                label="系统中文名称"
                                name="systemNameZh"
                                rules={[
                                    {required: true, message: '请输入系统中文名称'},
                                    {max: 50, message: '系统名称不能超过 50 个字符'},
                                ]}
                            >
                                <Input placeholder="例如：皮卡监控"/>
                            </Form.Item>
                        </div>

                        <Form.Item
                            label="ICP 备案号"
                            name="icpCode"
                            rules={[
                                {max: 50, message: 'ICP 备案号不能超过 50 个字符'},
                            ]}
                            tooltip="ICP 备案号将显示在公共页面底部，例如：京ICP备12345678号"
                        >
                            <Input placeholder="例如：京ICP备12345678号"/>
                        </Form.Item>

                        <Form.Item
                            label="系统 Logo"
                            tooltip="上传系统 Logo，建议使用正方形图片，尺寸为 256x256 或更大，文件大小不超过 500KB"
                        >
                            <Space direction="vertical" className="w-full">
                                <Upload
                                    accept="image/*"
                                    showUploadList={false}
                                    beforeUpload={beforeUpload}
                                    disabled={uploading}
                                >
                                    <Button icon={<UploadIcon size={16}/>} loading={uploading}>
                                        {uploading ? '处理中...' : '上传 Logo'}
                                    </Button>
                                </Upload>

                                <div className="text-sm text-gray-500 space-y-1">
                                    <div>💡 使用提示：</div>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li>支持 PNG、JPG、GIF、SVG 等常见图片格式</li>
                                        <li>建议使用 PNG 格式，支持透明背景</li>
                                        <li>建议图片尺寸为 256x256 像素</li>
                                        <li>文件大小不能超过 500KB</li>
                                        <li>上传后图片将转换为 base64 格式存储</li>
                                    </ul>
                                </div>
                            </Space>
                        </Form.Item>
                    </Card>

                    <Card
                        title="预览效果"
                        type="inner"
                        className="mb-4"
                    >
                        <Form.Item noStyle shouldUpdate>
                            {({getFieldValue}) => {
                                const systemNameEn = getFieldValue('systemNameEn') || '';
                                const systemNameZh = getFieldValue('systemNameZh') || '';
                                return (
                                    <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
                                        <img
                                            src={getLogoUrl()}
                                            alt="Logo 预览"
                                            className="h-10 w-10 object-contain rounded-md"
                                            onError={(e) => {
                                                e.currentTarget.src = '/logo.png';
                                            }}
                                        />
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-blue-600">
                                                {systemNameEn}
                                            </p>
                                            <h1 className="text-sm font-bold text-slate-900">
                                                {systemNameZh}
                                            </h1>
                                        </div>
                                    </div>
                                );
                            }}
                        </Form.Item>
                    </Card>

                    <Form.Item>
                        <Space>
                            <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
                                保存配置
                            </Button>
                            <Button onClick={handleReset}>
                                恢复默认
                            </Button>
                        </Space>
                    </Form.Item>
                </Space>
            </Form>
        </div>
    );
};

export default SystemConfigComponent;
