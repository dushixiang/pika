import React, {useRef} from 'react';
import {App, Button, Tag, Tooltip} from 'antd';
import {FileWarning} from 'lucide-react';
import type {ActionType, ProColumns} from '@ant-design/pro-table';
import ProTable from '@ant-design/pro-table';
import {useMutation} from '@tanstack/react-query';
import {deleteTamperEvents, getTamperEvents, type TamperEvent} from '@/api/tamper';
import {getErrorMessage} from '@/lib/utils';
import dayjs from 'dayjs';

interface TamperProtectionEventsProps {
    agentId: string;
}

const TamperProtectionEvents: React.FC<TamperProtectionEventsProps> = ({agentId}) => {
    const {message, modal} = App.useApp();
    const actionRef = useRef<ActionType>(null);

    // 定义表格列
    const columns: ProColumns<TamperEvent>[] = [
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
            title: '操作类型',
            dataIndex: 'operation',
            key: 'operation',
            width: 120,
            valueType: 'select',
            valueEnum: {
                CREATE: {text: '创建', status: 'Processing'},
                MODIFY: {text: '修改', status: 'Warning'},
                DELETE: {text: '删除', status: 'Error'},
                RENAME: {text: '重命名', status: 'Default'},
                CHMOD: {text: '权限变更', status: 'Default'},
            },
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
            hideInSearch: true,
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

    // 删除所有事件 mutation
    const deleteMutation = useMutation({
        mutationFn: () => deleteTamperEvents(agentId),
        onSuccess: () => {
            message.success('所有事件已删除');
            actionRef.current?.reload();
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
        <ProTable<TamperEvent>
            columns={columns}
            actionRef={actionRef}
            cardBordered
            request={async (params) => {
                try {
                    const response = await getTamperEvents(
                        agentId,
                        params.current || 1,
                        params.pageSize || 20
                    );
                    if (response.data.success) {
                        return {
                            data: response.data.data.items || [],
                            success: true,
                            total: response.data.data.total || 0,
                        };
                    }
                    return {
                        data: [],
                        success: false,
                        total: 0,
                    };
                } catch (error) {
                    console.error('Failed to load tamper events:', error);
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
            headerTitle="文件事件"
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
                        <FileWarning size={48} className="mx-auto mb-2 opacity-20"/>
                        <p>暂无防篡改事件</p>
                        <p className="text-sm mt-2">
                            请先在"保护配置"中启用保护功能并配置目录
                        </p>
                    </div>
                ),
            }}
        />
    );
};

export default TamperProtectionEvents;
