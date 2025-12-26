import { useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, Radio, Space, Spin, Upload } from 'antd';
import { Upload as UploadIcon, Grid3x3, List } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SystemConfig } from '@/api/property.ts';
import { getSystemConfig, saveSystemConfig } from '@/api/property.ts';
import { getErrorMessage } from '@/lib/utils.ts';
import type { RcFile } from 'antd/es/upload/interface';

const SystemConfigComponent = () => {
    const [form] = Form.useForm();
    const { message: messageApi } = App.useApp();
    const queryClient = useQueryClient();
    const [logoPreview, setLogoPreview] = useState<string>('');
    const [uploading, setUploading] = useState(false);

    // 获取系统配置
    const { data: config, isLoading } = useQuery({
        queryKey: ['systemConfig'],
        queryFn: getSystemConfig,
    });

    // 保存系统配置 mutation
    const saveMutation = useMutation({
        mutationFn: saveSystemConfig,
        onSuccess: () => {
            messageApi.success('保存成功');
            queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
            // 刷新页面以应用新的系统配置
            window.location.reload();
        },
        onError: (error: unknown) => {
            messageApi.error(getErrorMessage(error, '保存失败'));
        },
    });

    // 初始化系统配置表单
    useEffect(() => {
        if (config) {
            form.setFieldsValue({
                systemNameEn: config.systemNameEn,
                systemNameZh: config.systemNameZh,
                icpCode: config.icpCode,
                defaultView: config.defaultView ?? true, // 默认为 grid 视图
                customCSS: config.customCSS,
                customJS: config.customJS,
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
                defaultView: values.defaultView ?? true,
                customCSS: values.customCSS || '',
                customJS: values.customJS || '',
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
                defaultView: config.defaultView ?? true,
                customCSS: config.customCSS,
                customJS: config.customJS,
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
                <Spin />
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
                                    { required: true, message: '请输入系统英文名称' },
                                    { max: 50, message: '系统名称不能超过 50 个字符' },
                                ]}
                            >
                                <Input placeholder="例如：Pika Monitor" />
                            </Form.Item>

                            <Form.Item
                                label="系统中文名称"
                                name="systemNameZh"
                                rules={[
                                    { required: true, message: '请输入系统中文名称' },
                                    { max: 50, message: '系统名称不能超过 50 个字符' },
                                ]}
                            >
                                <Input placeholder="例如：皮卡监控" />
                            </Form.Item>
                        </div>

                        <Form.Item
                            label="ICP 备案号"
                            name="icpCode"
                            rules={[
                                { max: 50, message: 'ICP 备案号不能超过 50 个字符' },
                            ]}
                            tooltip="ICP 备案号将显示在公共页面底部，例如：京ICP备12345678号"
                        >
                            <Input placeholder="例如：京ICP备12345678号" />
                        </Form.Item>

                        <Form.Item
                            label="默认视图模式"
                            name="defaultView"
                            tooltip="选择公共页面默认显示的视图模式"
                        >
                            <Radio.Group>
                                <Radio.Button value="grid">
                                    <Space size={4}>
                                        <Grid3x3 size={16} />
                                        <span>网格视图</span>
                                    </Space>
                                </Radio.Button>
                                <Radio.Button value="list">
                                    <Space size={4}>
                                        <List size={16} />
                                        <span>列表视图</span>
                                    </Space>
                                </Radio.Button>
                            </Radio.Group>
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
                                    <Button icon={<UploadIcon size={16} />} loading={uploading}>
                                        {uploading ? '处理中...' : '上传 Logo'}
                                    </Button>
                                </Upload>
                            </Space>
                        </Form.Item>
                    </Card>

                    <Card
                        title="自定义代码"
                        type="inner"
                        className="mb-4"
                    >
                        <Form.Item
                            label="自定义 CSS"
                            name="customCSS"
                            tooltip="输入自定义 CSS 代码，将注入到页面 <style> 标签中"
                        >
                            <Input.TextArea
                                placeholder="例如：body { background-color: #f0f0f0; }"
                                rows={6}
                            />
                        </Form.Item>

                        <Form.Item
                            label="自定义 JS"
                            name="customJS"
                            tooltip="输入自定义 JavaScript 代码，将注入到页面 <script> 标签中"
                        >
                            <Input.TextArea
                                placeholder="例如：console.log('Hello World');"
                                rows={6}
                            />
                        </Form.Item>
                    </Card>

                    <Card
                        title="预览效果"
                        type="inner"
                        className="mb-4"
                    >
                        <Form.Item noStyle shouldUpdate>
                            {({ getFieldValue }) => {
                                const systemNameEn = getFieldValue('systemNameEn') || '';
                                const systemNameZh = getFieldValue('systemNameZh') || '';

                                // 与 PublicHeader 相同的分割逻辑
                                let leftName = '';
                                let rightName = '';

                                if (systemNameEn) {
                                    // 优先在空格处分割
                                    const spaceIndex = systemNameEn.indexOf(' ');
                                    if (spaceIndex > 0) {
                                        leftName = systemNameEn.substring(0, spaceIndex);
                                        rightName = systemNameEn.substring(spaceIndex); // 保留空格
                                    } else {
                                        // 如果没有空格，从中间分割
                                        const mid = Math.floor(systemNameEn.length / 2);
                                        leftName = systemNameEn.substring(0, mid);
                                        rightName = systemNameEn.substring(mid);
                                    }
                                }

                                return (
                                    <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                        <img
                                            src={getLogoUrl()}
                                            alt="Logo 预览"
                                            className="h-8 w-8 sm:h-9 sm:w-9 object-contain rounded-md"
                                            onError={(e) => {
                                                e.currentTarget.src = '/logo.png';
                                            }}
                                        />
                                        <div>
                                            <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 dark:from-cyan-400 dark:via-blue-400 dark:to-purple-400 uppercase italic">
                                                {leftName}<span className="text-slate-800 dark:text-white">{rightName}</span>
                                            </h1>
                                            <p className="text-xs text-slate-500 dark:text-cyan-500 font-mono tracking-[0.3em] uppercase">
                                                {systemNameZh}
                                            </p>
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
