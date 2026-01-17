import React, {useState, useEffect} from 'react';
import {App, Button, Table, Tag, Tooltip} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {Terminal} from 'lucide-react';
import {useMutation} from '@tanstack/react-query';
import type {SSHLoginEvent} from '@/types';
import {deleteSSHLoginEvents, getSSHLoginEvents} from '@/api/agent';
import {getErrorMessage} from '@/lib/utils';
import dayjs from 'dayjs';

interface SSHLoginEventsProps {
    agentId: string;
}

const SSHLoginEvents: React.FC<SSHLoginEventsProps> = ({agentId}) => {
    const {message, modal} = App.useApp();
    const [loading, setLoading] = useState(false);
    const [dataSource, setDataSource] = useState<SSHLoginEvent[]>([]);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 20,
        total: 0,
    });
    const [searchParams, setSearchParams] = useState({
        username: '',
        ip: '',
        status: '',
    });

    // 定义表格列
    const columns: ColumnsType<SSHLoginEvent> = [
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
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (_, record) => (
                record.status === 'success' ? (
                    <Tag variant={'filled'} color="success">成功</Tag>
                ) : (
                    <Tag variant={'filled'} color="error">失败</Tag>
                )
            ),
        },
        {
            title: '用户名',
            dataIndex: 'username',
            key: 'username',
            width: 120,
            render: (_, record) => (
                <span className="font-mono text-sm">{record.username}</span>
            ),
        },
        {
            title: '来源 IP',
            dataIndex: 'ip',
            key: 'ip',
            width: 150,
            render: (_, record) => (
                <span className="font-mono text-sm">{record.ip}</span>
            ),
        },
        {
            title: '端口',
            dataIndex: 'port',
            key: 'port',
            width: 80,
            render: (_, record) => record.port || '-',
        },
        {
            title: 'TTY',
            dataIndex: 'tty',
            key: 'tty',
            width: 100,
            render: (_, record) => record.tty ? <span className="font-mono text-sm">{record.tty}</span> : '-',
        },
        {
            title: '会话 ID',
            dataIndex: 'sessionId',
            key: 'sessionId',
            width: 120,
            ellipsis: true,
            render: (_, record) => record.sessionId ? (
                <Tooltip title={record.sessionId}>
                    <span className="font-mono text-xs text-gray-500">{record.sessionId}</span>
                </Tooltip>
            ) : '-',
        },
    ];

    // 加载数据
    const loadData = async (page: number = pagination.current, pageSize: number = pagination.pageSize) => {
        setLoading(true);
        try {
            const response = await getSSHLoginEvents(agentId, {
                pageIndex: page,
                pageSize: pageSize,
                username: searchParams.username || undefined,
                ip: searchParams.ip || undefined,
                status: searchParams.status || undefined,
                sortField: 'createdAt',
                sortOrder: 'descend',
            });
            setDataSource(response.items || []);
            setPagination({
                current: page,
                pageSize: pageSize,
                total: response.total || 0,
            });
        } catch (error) {
            console.error('Failed to load SSH login events:', error);
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
        mutationFn: () => deleteSSHLoginEvents(agentId),
        onSuccess: () => {
            message.success('所有事件已删除');
            loadData(1);
        },
        onError: (error: unknown) => {
            console.error('Failed to delete SSH login events:', error);
            message.error(getErrorMessage(error, '删除失败'));
        },
    });

    // 删除所有事件
    const handleDeleteAllEvents = () => {
        modal.confirm({
            title: '确认删除',
            content: '确定要删除该探针的所有 SSH 登录事件吗？此操作不可恢复。',
            okText: '确定删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => deleteMutation.mutate(),
        });
    };

    return (
        <div className="space-y-4">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h3 className="text-lg font-medium">登录事件</h3>
                <Tooltip title="删除所有事件">
                    <Button onClick={handleDeleteAllEvents} danger>
                        删除所有事件
                    </Button>
                </Tooltip>
            </div>

            <Table<SSHLoginEvent>
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
                            <Terminal size={48} className="mx-auto mb-2 opacity-20"/>
                            <p>暂无 SSH 登录事件</p>
                            <p className="text-sm mt-2">
                                请先在"监控配置"中启用监控功能
                            </p>
                        </div>
                    ),
                }}
            />
        </div>
    );
};

export default SSHLoginEvents;
