import React, {useState, useEffect} from 'react';
import {App, Button, Table, Tag, Tooltip} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {FileWarning} from 'lucide-react';
import {useMutation} from '@tanstack/react-query';
import {deleteTamperEvents, getTamperEvents, type TamperEvent} from '@/api/tamper';
import {getErrorMessage} from '@/lib/utils';
import dayjs from 'dayjs';

interface TamperProtectionEventsProps {
    agentId: string;
}

const TamperProtectionEvents: React.FC<TamperProtectionEventsProps> = ({agentId}) => {
    const {message, modal} = App.useApp();
    const [loading, setLoading] = useState(false);
    const [dataSource, setDataSource] = useState<TamperEvent[]>([]);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 20,
        total: 0,
    });

    // 定义表格列
    const columns: ColumnsType<TamperEvent> = [
        {
            title: '时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            render: (_, record) => (
                <span className="text-sm">
                    {dayjs(record.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                </span>
            ),
        },
        {
            title: '操作类型',
            dataIndex: 'operation',
            key: 'operation',
            width: 120,
            render: (_, record) => {
                const operationColors: Record<string, string> = {
                    CREATE: 'blue',
                    MODIFY: 'orange',
                    DELETE: 'red',
                    RENAME: 'purple',
                    CHMOD: 'cyan',
                };
                return (
                    <Tag color={operationColors[record.operation] || 'default'}>
                        {record.operation}
                    </Tag>
                );
            },
        },
        {
            title: '文件路径',
            dataIndex: 'path',
            key: 'path',
            ellipsis: true,
            render: (_, record) => (
                <Tooltip title={record.path}>
                    <span className="font-mono text-sm">{record.path}</span>
                </Tooltip>
            ),
        },
        {
            title: '详细信息',
            dataIndex: 'details',
            key: 'details',
            ellipsis: true,
            render: (_, record) => (
                record.details ? (
                    <Tooltip title={record.details}>
                        <span className="text-xs text-gray-600">{record.details}</span>
                    </Tooltip>
                ) : '-'
            ),
        },
    ];

    // 加载数据
    const loadData = async (page: number = pagination.current, pageSize: number = pagination.pageSize) => {
        setLoading(true);
        try {
            const response = await getTamperEvents(agentId, {
                pageIndex: page,
                pageSize: pageSize,
                sortField: 'createdAt',
                sortOrder: 'descend',
            });
            setDataSource(response.data.items || []);
            setPagination({
                current: page,
                pageSize: pageSize,
                total: response.data.total || 0,
            });
        } catch (error) {
            console.error('Failed to load tamper events:', error);
            message.error(getErrorMessage(error, '加载失败'));
        } finally {
            setLoading(false);
        }
    };

    // 初始加载
    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agentId]);

    // 处理表格变化
    const handleTableChange = (newPagination: any) => {
        loadData(newPagination.current, newPagination.pageSize);
    };

    // 删除所有事件 mutation
    const deleteMutation = useMutation({
        mutationFn: () => deleteTamperEvents(agentId),
        onSuccess: () => {
            message.success('所有事件已删除');
            loadData(1);
        },
        onError: (error: unknown) => {
            console.error('Failed to delete tamper events:', error);
            message.error(getErrorMessage(error, '删除失败'));
        },
    });

    // 删除所有事件
    const handleDeleteAllEvents = () => {
        modal.confirm({
            title: '确认删除',
            content: '确定要删除该探针的所有防篡改事件吗？此操作不可恢复。',
            okText: '确定删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => deleteMutation.mutate(),
        });
    };

    return (
        <div className="space-y-4">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h3 className="text-lg font-medium">文件事件</h3>
                <Tooltip title="删除所有事件">
                    <Button onClick={handleDeleteAllEvents} danger>
                        删除所有事件
                    </Button>
                </Tooltip>
            </div>

            <Table<TamperEvent>
                columns={columns}
                dataSource={dataSource}
                loading={loading}
                rowKey="id"
                pagination={{
                    ...pagination,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`,
                }}
                onChange={handleTableChange}
                locale={{
                    emptyText: (
                        <div className="py-8 text-center text-gray-500">
                            <FileWarning size={48} className="mx-auto mb-2 opacity-20"/>
                            <p>暂无防篡改事件</p>
                            <p className="text-sm mt-2">
                                请先在"保护配置"中启用保护功能并配置目录
                            </p>
                        </div>
                    ),
                }}
            />
        </div>
    );
};

export default TamperProtectionEvents;
