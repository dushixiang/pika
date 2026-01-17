import {Button} from 'antd';
import {Modal} from 'antd';
import {Copy} from 'lucide-react';
import type {ApiKey} from '@/types';
import {App} from 'antd';
import copy from 'copy-to-clipboard';

interface ShowApiKeyModalProps {
    open: boolean;
    apiKey: ApiKey | null;
    onClose: () => void;
}

const ShowApiKeyModal = ({open, apiKey, onClose}: ShowApiKeyModalProps) => {
    const {message: messageApi} = App.useApp();

    const handleCopyApiKey = (key: string) => {
        copy(key);
        messageApi.success('复制成功');
    };

    return (
        <Modal
            title="API密钥已生成"
            open={open}
            onOk={onClose}
            onCancel={onClose}
            footer={[
                <Button
                    key="copy"
                    type="primary"
                    icon={<Copy size={14}/>}
                    onClick={() => {
                        if (apiKey) {
                            handleCopyApiKey(apiKey.key);
                        }
                    }}
                >
                    复制密钥
                </Button>,
                <Button key="ok" onClick={onClose}>
                    关闭
                </Button>,
            ]}
        >
            <div className="space-y-4">
                <div
                    className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                        ⚠️ 重要提示:请妥善保管此密钥,关闭后将无法再次查看完整密钥!
                    </p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">密钥名称</label>
                    <div className="text-base font-semibold text-gray-900 dark:text-white">{apiKey?.name}</div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API密钥</label>
                    <code
                        className="block w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 dark:text-gray-200 rounded px-3 py-2 text-sm font-mono break-all">
                        {apiKey?.key}
                    </code>
                </div>
            </div>
        </Modal>
    );
};

export default ShowApiKeyModal;
