import React, {useRef} from 'react';
import {App, Button, Tag, Tooltip} from 'antd';
import {Terminal} from 'lucide-react';
import type {ActionType, ProColumns} from '@ant-design/pro-table';
import ProTable from '@ant-design/pro-table';
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
    const actionRef = useRef<ActionType>(null);

    // 定义表格列
    const columns: ProColumns<SSHLoginEvent>[] = [
        {
            title: '时间',
            dataIndex: 'timestamp',
            key: 'timestamp',
            width: 180,
            valueType: 'dateTime',
            hideInSearch: true,
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
            valueType: 'select',
            valueEnum: {
                success: {text: '成功', status: 'Success'},
                failed: {text: '失败', status: 'Error'},
            },
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
            hideInSearch: true,
            render: (_, record) => record.port || '-',
        },
        {
            title: '认证方式',
            dataIndex: 'method',
            key: 'method',
            width: 120,
            hideInSearch: true,
            render: (_, record) => (
                record.method ? (
                    <Tooltip
                        title={record.method === 'password' ? '密码认证' : record.method === 'publickey' ? '公钥认证' : record.method}>
                        <Tag>{record.method}</Tag>
                    </Tooltip>
                ) : '-'
            ),
        },
        {
            title: 'TTY',
            dataIndex: 'tty',
            key: 'tty',
            width: 100,
            hideInSearch: true,
            render: (_, record) => record.tty ? <span className="font-mono text-sm">{record.tty}</span> : '-',
        },
        {
            title: '会话 ID',
            dataIndex: 'sessionId',
            key: 'sessionId',
            width: 120,
            ellipsis: true,
            hideInSearch: true,
            render: (_, record) => record.sessionId ? (
                <Tooltip title={record.sessionId}>
                    <span className="font-mono text-xs text-gray-500">{record.sessionId}</span>
                </Tooltip>
            ) : '-',
        },
    ];

    // 删除所有事件 mutation
    const deleteMutation = useMutation({
        mutationFn: () => deleteSSHLoginEvents(agentId),
        onSuccess: () => {
            message.success('所有事件已删除');
            actionRef.current?.reload();
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
        <ProTable<SSHLoginEvent>
            columns={columns}
            actionRef={actionRef}
            cardBordered
            request={async (params) => {
                try {
                    const response = await getSSHLoginEvents(agentId, {
                        page: params.current || 1,
                        pageSize: params.pageSize || 20,
                        username: params.username,
                        ip: params.ip,
                        status: params.status,
                    });
                    return {
                        data: response.items || [],
                        success: true,
                        total: response.total || 0,
                    };
                } catch (error) {
                    console.error('Failed to load SSH login events:', error);
                    return {
                        data: [],
                        success: false,
                        total: 0,
                    };
                }
            }}
            rowKey="id"
            search={{
                labelWidth: 'auto',
            }}
            pagination={{
                pageSize: 20,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
            }}
            dateFormatter="string"
            headerTitle="登录事件"
            toolBarRender={() => [
                <Tooltip key="delete" title="删除所有事件">
                    <Button
                        onClick={handleDeleteAllEvents}
                        danger={true}
                    >
                        删除所有事件
                    </Button>
                </Tooltip>,
            ]}
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
    );
};

export default SSHLoginEvents;
