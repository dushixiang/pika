import React from 'react';
import {useSearchParams} from 'react-router-dom';
import {App, Button, Table, Tag, Tooltip} from 'antd';
import type {ColumnsType, TablePaginationConfig} from 'antd/es/table';
import {FileWarning} from 'lucide-react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {deleteTamperEvents, getTamperEvents, type TamperEvent} from '@/api/tamper';
import {getErrorMessage} from '@/lib/utils';
import dayjs from 'dayjs';

interface TamperProtectionEventsProps {
    agentId: string;
}

const TamperProtectionEvents: React.FC<TamperProtectionEventsProps> = ({agentId}) => {
    const {message, modal} = App.useApp();
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();

    const pageIndex = Number(searchParams.get('pageIndex')) || 1;
    const pageSize = Number(searchParams.get('pageSize')) || 20;

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

    const {
        data: eventsPaging,
        isLoading,
        isFetching,
    } = useQuery({
        queryKey: ['admin', 'agents', 'tamper-events', agentId, pageIndex, pageSize],
        queryFn: () => getTamperEvents(agentId, {
            pageIndex,
            pageSize,
            sortField: 'createdAt',
            sortOrder: 'descend',
        }),
    });

    // 处理表格变化
    const handleTableChange = (newPagination: TablePaginationConfig) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set('pageIndex', String(newPagination.current || 1));
        nextParams.set('pageSize', String(newPagination.pageSize || pageSize));
        setSearchParams(nextParams);
    };

    // 删除所有事件 mutation
    const deleteMutation = useMutation({
        mutationFn: () => deleteTamperEvents(agentId),
        onSuccess: () => {
            message.success('所有事件已删除');
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set('pageIndex', '1');
            nextParams.set('pageSize', String(pageSize));
            setSearchParams(nextParams);
            queryClient.invalidateQueries({queryKey: ['admin', 'agents', 'tamper-events', agentId]});
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
                dataSource={eventsPaging?.data.items || []}
                loading={isLoading || isFetching}
                rowKey="id"
                scroll={{x: 'max-content'}}
                pagination={{
                    current: pageIndex,
                    pageSize,
                    total: eventsPaging?.data.total || 0,
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
