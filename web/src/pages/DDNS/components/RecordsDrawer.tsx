import {useState, useEffect} from 'react';
import {App, Drawer, Table, Tag, Empty} from 'antd';
import type {ColumnType} from 'antd/es/table';
import dayjs from 'dayjs';
import {getDDNSRecords} from '@/api/ddns';
import type {DDNSConfig, DDNSRecord} from '@/types/ddns';
import {ArrowRight, CheckCircle2, XCircle} from 'lucide-react';

interface RecordsDrawerProps {
    open: boolean;
    config: DDNSConfig;
    onClose: () => void;
}

const RecordsDrawer = ({open, config, onClose}: RecordsDrawerProps) => {
    const {message: messageApi} = App.useApp();
    const [loading, setLoading] = useState(false);
    const [records, setRecords] = useState<DDNSRecord[]>([]);

    useEffect(() => {
        if (open && config) {
            loadRecords();
        }
    }, [open, config]);

    const loadRecords = async () => {
        setLoading(true);
        try {
            const response = await getDDNSRecords(config.id);
            setRecords(response.data.items || []);
        } catch (error) {
            messageApi.error('加载更新记录失败');
        } finally {
            setLoading(false);
        }
    };

    const columns: ColumnType<DDNSRecord>[] = [
        {
            title: '域名',
            dataIndex: 'domain',
            key: 'domain',
            width: 200,
        },
        {
            title: '记录类型',
            dataIndex: 'recordType',
            key: 'recordType',
            width: 100,
            render: (type: string) => (
                <Tag color={type === 'A' ? 'green' : 'cyan'}>{type}</Tag>
            ),
        },
        {
            title: 'IP 变化',
            key: 'ipChange',
            width: 400,
            render: (_, record) => {
                const isIPv6 = record.recordType === 'AAAA' || record.newIp?.includes(':');
                return (
                    <div className={`flex ${isIPv6 ? 'flex-col gap-1' : 'items-center gap-2'}`}>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">旧:</span>
                            <span className={`font-mono text-gray-600 ${isIPv6 ? 'text-xs' : ''}`}>
                                {record.oldIp || '(初始)'}
                            </span>
                        </div>
                        {!isIPv6 && <ArrowRight className="h-4 w-4 text-gray-400"/>}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">新:</span>
                            <span className={`font-mono font-medium text-blue-600 ${isIPv6 ? 'text-xs break-all' : ''}`}>
                                {record.newIp}
                            </span>
                        </div>
                    </div>
                );
            },
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: string) => (
                <div className="flex items-center gap-1">
                    {status === 'success' ? (
                        <>
                            <CheckCircle2 className="h-4 w-4 text-green-500"/>
                            <span className="text-green-600">成功</span>
                        </>
                    ) : (
                        <>
                            <XCircle className="h-4 w-4 text-red-500"/>
                            <span className="text-red-600">失败</span>
                        </>
                    )}
                </div>
            ),
        },
        {
            title: '更新时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 180,
            render: (timestamp: number) =>
                dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss'),
        },
        {
            title: '错误信息',
            dataIndex: 'errorMessage',
            key: 'errorMessage',
            ellipsis: true,
            render: (msg: string) => msg && <span className="text-red-500">{msg}</span>,
        },
    ];

    return (
        <Drawer
            title={`DDNS 更新记录 - ${config.name}`}
            open={open}
            onClose={onClose}
            width={1200}
            destroyOnHidden={true}
        >
            <div className="mb-4 rounded-lg bg-gray-50 p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-gray-500">配置名称：</span>
                        <span className="font-medium">{config.name}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">DNS 服务商：</span>
                        <span className="font-medium">{config.provider}</span>
                    </div>
                    <div>
                        <span className="text-gray-500">域名数量：</span>
                        <span className="font-medium">{(config.domainsIpv4?.length || 0) + (config.domainsIpv6?.length || 0)} 个</span>
                    </div>
                    <div>
                        <span className="text-gray-500">状态：</span>
                        <Tag color={config.enabled ? 'success' : 'default'}>
                            {config.enabled ? '启用' : '禁用'}
                        </Tag>
                    </div>
                </div>
            </div>

            {records.length === 0 ? (
                <Empty description="暂无更新记录" image={Empty.PRESENTED_IMAGE_SIMPLE}/>
            ) : (
                <Table
                    columns={columns}
                    dataSource={records}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        pageSize: 10,
                        showTotal: (total) => `共 ${total} 条记录`,
                    }}
                    scroll={{x: 900}}
                />
            )}
        </Drawer>
    );
};

export default RecordsDrawer;
