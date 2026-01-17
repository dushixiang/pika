import React, {useState, useEffect} from 'react';
import {App, Divider, Select, Space, Table, Tag} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {Trash2} from 'lucide-react';
import {clearAlertRecords, getAlertRecords} from '@/api/alert.ts';
import type {AlertRecord} from '@/types';
import dayjs from 'dayjs';
import {getErrorMessage} from '@/lib/utils';
import {PageHeader} from '@admin/components';
import {getAgentPaging} from '@/api/agent.ts';
import {useQuery} from '@tanstack/react-query';

const AlertRecordList = () => {
    const {message: messageApi, modal} = App.useApp();
    const [selectedAgentId, setSelectedAgentId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [dataSource, setDataSource] = useState<AlertRecord[]>([]);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 20,
        total: 0,
    });

    // 使用 react-query 获取探针列表
    const {data: agentsData} = useQuery({
        queryKey: ['agents-for-alert-filter'],
        queryFn: async () => {
            const response = await getAgentPaging(1, 1000);
            return response.data;
        },
    });

    // 告警类型中文映射
    const alertTypeMap: Record<string, string> = {
        cpu: 'CPU使用率',
        memory: '内存使用率',
        disk: '磁盘使用率',
        network: '网速',
        traffic: '流量',
        cert: 'HTTPS证书',
        service: '服务下线',
        agent_offline: '探针离线',
    };

    // 告警级别映射
    const getLevelTag = (level: string) => {
        const config = {
            info: {color: 'blue', text: '信息'},
            warning: {color: 'orange', text: '警告'},
            critical: {color: 'red', text: '严重'},
        };
        const levelConfig = config[level as keyof typeof config] || {color: 'default', text: level};
        return <Tag color={levelConfig.color}>{levelConfig.text}</Tag>;
    };

    // 状态映射
    const getStatusTag = (status: string) => {
        const config = {
            firing: {color: 'red', text: '告警中'},
            resolved: {color: 'green', text: '已恢复'},
            notice: {color: 'blue', text: '通知'},
        };
        const statusConfig = config[status as keyof typeof config] || {color: 'default', text: status};
        return <Tag color={statusConfig.color}>{statusConfig.text}</Tag>;
    };

    // 格式化持续时间
    const formatDuration = (firedAt: number, resolvedAt: number | null, status: string) => {
        // 如果告警还在进行中，返回 "-"
        if (status === 'firing' || !resolvedAt || resolvedAt <= firedAt) {
            return '-';
        }

        const durationMs = resolvedAt - firedAt;
        const durationSec = Math.floor(durationMs / 1000);

        if (durationSec < 60) {
            return `${durationSec}秒`;
        }

        if (durationSec < 3600) {
            const minutes = Math.floor(durationSec / 60);
            const seconds = durationSec % 60;
            return `${minutes}分${seconds}秒`;
        }

        const hours = Math.floor(durationSec / 3600);
        const minutes = Math.floor((durationSec % 3600) / 60);
        const seconds = durationSec % 60;
        return `${hours}时${minutes}分${seconds}秒`;
    };

    // 计算探针选项
    const agentOptions = agentsData?.items?.map((agent) => ({
        label: agent.name || agent.id,
        value: agent.id,
    })) || [];

    // 加载数据
    const loadData = async (page: number = pagination.current, pageSize: number = pagination.pageSize, agentId: string = selectedAgentId) => {
        setLoading(true);
        try {
            const result = await getAlertRecords(page, pageSize, agentId || undefined);
            setDataSource(result.items || []);
            setPagination({
                current: page,
                pageSize: pageSize,
                total: result.total || 0,
            });
        } catch (error) {
            messageApi.error(getErrorMessage(error, '获取告警记录失败'));
        } finally {
            setLoading(false);
        }
    };

    // 处理表格变化
    const handleTableChange = (newPagination: any) => {
        loadData(newPagination.current, newPagination.pageSize);
    };

    // 处理探针筛选变化
    const handleAgentChange = (value: string) => {
        setSelectedAgentId(value || '');
        loadData(1, pagination.pageSize, value || '');
    };

    // 清空记录
    const handleClear = () => {
        modal.confirm({
            title: '确认清空',
            content: selectedAgentId
                ? '确定要清空该探针的所有告警记录吗？'
                : '确定要清空所有告警记录吗？此操作不可恢复！',
            okText: '确定',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    await clearAlertRecords(selectedAgentId || undefined);
                    messageApi.success('清空成功');
                    loadData();
                } catch (error: unknown) {
                    messageApi.error(getErrorMessage(error, '清空失败'));
                }
            },
        });
    };

    // 初始加载
    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const columns: ColumnsType<AlertRecord> = [
        {
            title: 'ID',
            dataIndex: 'id',
            width: 80,
        },
        {
            title: '探针',
            dataIndex: 'agentName',
            width: 200,
            ellipsis: true,
        },
        {
            title: '告警类型',
            dataIndex: 'alertType',
            width: 120,
            render: (_, record) => alertTypeMap[record.alertType] || record.alertType,
        },
        {
            title: '告警消息',
            dataIndex: 'message',
            ellipsis: true,
        },
        {
            title: '阈值',
            dataIndex: 'threshold',
            width: 100,
            render: (_, record) => {
                if (record.alertType === 'network') {
                    return `${record.threshold.toFixed(2)} MB/s`;
                }
                if (record.alertType === 'cert') {
                    return `${record.threshold.toFixed(0)} 天`;
                }
                if (record.alertType === 'service' || record.alertType === 'agent_offline') {
                    return `${record.threshold.toFixed(0)} 秒`;
                }
                return `${record.threshold.toFixed(2)}%`;
            },
        },
        {
            title: '实际值',
            dataIndex: 'actualValue',
            width: 100,
            render: (_, record) => {
                if (record.alertType === 'network') {
                    return `${record.actualValue.toFixed(2)} MB/s`;
                }
                if (record.alertType === 'cert') {
                    return `${record.actualValue.toFixed(0)} 天`;
                }
                if (record.alertType === 'service' || record.alertType === 'agent_offline') {
                    return `${record.actualValue.toFixed(0)} 秒`;
                }
                return `${record.actualValue.toFixed(2)}%`;
            },
        },
        {
            title: '告警级别',
            dataIndex: 'level',
            width: 100,
            render: (_, record) => getLevelTag(record.level),
        },
        {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (_, record) => getStatusTag(record.status),
        },
        {
            title: '触发时间',
            dataIndex: 'firedAt',
            width: 180,
            render: (_, record) => dayjs(record.firedAt).format('YYYY-MM-DD HH:mm:ss'),
        },
        {
            title: '恢复时间',
            dataIndex: 'resolvedAt',
            width: 180,
            render: (_, record) =>
                record.resolvedAt ? dayjs(record.resolvedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
        },
        {
            title: '持续时间',
            dataIndex: 'duration',
            width: 130,
            render: (_, record) => formatDuration(record.firedAt, record.resolvedAt, record.status),
        },
    ];

    return (
        <div>
            <PageHeader
                title="告警记录"
                description="查看和管理系统的告警记录"
                actions={[
                    {
                        key: 'clear',
                        label: '清空记录',
                        icon: <Trash2 className="h-4 w-4"/>,
                        type: 'primary',
                        danger: true,
                        onClick: handleClear,
                    },
                ]}
            />

            <Divider/>

            <div style={{marginBottom: 16}}>
                <Space>
                    <Select
                        placeholder="选择探针"
                        allowClear
                        showSearch
                        style={{width: 200}}
                        value={selectedAgentId || undefined}
                        onChange={handleAgentChange}
                        filterOption={(input, option) =>
                            (option?.label?.toString() ?? '')
                                .toLowerCase()
                                .includes(input.toLowerCase())
                        }
                        options={agentOptions}
                    />
                </Space>
            </div>

            <Table<AlertRecord>
                columns={columns}
                dataSource={dataSource}
                loading={loading}
                rowKey="id"
                pagination={{
                    ...pagination,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (total) => `共 ${total} 条`,
                }}
                onChange={handleTableChange}
            />
        </div>
    );
};

export default AlertRecordList;
