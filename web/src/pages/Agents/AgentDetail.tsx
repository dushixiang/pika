import {useEffect, useState} from 'react';
import {useNavigate, useParams, useSearchParams} from 'react-router-dom';
import type {MenuProps, TabsProps} from 'antd';
import {App, Button, Card, Col, Descriptions, Dropdown, Row, Space, Spin, Tag, Tabs, Alert, Statistic} from 'antd';
import {
    Activity,
    ArrowLeft,
    Clock,
    RefreshCw,
    Shield,
    Terminal,
    CheckCircle,
    XCircle,
    AlertTriangle,
    TrendingUp,
    FileWarning
} from 'lucide-react';
import TamperProtection from './TamperProtection.tsx';
import {getAgentForAdmin, getAuditResult, sendAuditCommand, type VPSAuditResult} from '../../api/agent';
import type {Agent} from '../../types';
import dayjs from 'dayjs';
import {getErrorMessage} from '../../lib/utils';
import AuditResultView from './AuditResultView';

const AgentDetail = () => {
    const {id} = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {message: messageApi} = App.useApp();
    const [loading, setLoading] = useState(false);
    const [agent, setAgent] = useState<Agent | null>(null);
    const [auditResult, setAuditResult] = useState<VPSAuditResult | null>(null);
    const [auditing, setAuditing] = useState(false);
    const [activeTab, setActiveTab] = useState<string>(searchParams.get('tab') || 'info');

    const fetchData = async () => {
        if (!id) return;

        setLoading(true);
        try {
            const [agentRes, auditRes] = await Promise.all([
                getAgentForAdmin(id),
                getAuditResult(id).catch(() => ({data: null})),
            ]);

            setAgent(agentRes.data);
            setAuditResult(auditRes.data);
        } catch (error: any) {
            messageApi.error(error.response?.data?.message || '获取探针信息失败');
        } finally {
            setLoading(false);
        }
    };

    const handleStartAudit = async () => {
        if (!id) return;

        // 检查是否为 Linux 系统
        if (!agent?.os.toLowerCase().includes('linux')) {
            messageApi.warning('安全审计功能仅支持 Linux 系统');
            return;
        }

        setAuditing(true);
        try {
            await sendAuditCommand(id);
            messageApi.success('安全审计已启动,请稍后查看结果');

            // 5秒后刷新结果
            setTimeout(() => {
                fetchData();
            }, 5000);
        } catch (error: unknown) {
            messageApi.error(getErrorMessage(error, '启动审计失败'));
        } finally {
            setAuditing(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    useEffect(() => {
        // 同步 activeTab 到 URL
        setSearchParams({tab: activeTab});
    }, [activeTab]);

    if (loading && !agent) {
        return (
            <div className="text-center py-24">
                <Spin size="large"/>
            </div>
        );
    }

    // 命令菜单配置
    const commandMenuItems: MenuProps['items'] = [
        {
            key: 'audit',
            icon: <Shield size={16}/>,
            label: '安全审计',
            onClick: handleStartAudit,
        },
        {
            type: 'divider',
        },
        {
            key: 'refresh',
            icon: <RefreshCw size={16}/>,
            label: '刷新数据',
            onClick: fetchData,
        },
    ];

    // 计算审计统计
    const passCount = auditResult?.securityChecks.filter(c => c.status === 'pass').length || 0;
    const failCount = auditResult?.securityChecks.filter(c => c.status === 'fail').length || 0;
    const warnCount = auditResult?.securityChecks.filter(c => c.status === 'warn').length || 0;
    const totalCount = auditResult?.securityChecks.length || 0;

    // Tab 项配置
    const tabItems: TabsProps['items'] = [
        {
            key: 'info',
            label: (
                <div className="flex items-center gap-2 text-sm">
                    <Activity size={16}/>
                    <div>基本信息</div>
                </div>
            ),
            children: (
                <Descriptions column={{xs: 1, sm: 2}} bordered>
                    <Descriptions.Item label="探针名称">{agent?.name}</Descriptions.Item>
                    <Descriptions.Item label="探针ID">{agent?.id}</Descriptions.Item>
                    <Descriptions.Item label="主机名">{agent?.hostname}</Descriptions.Item>
                    <Descriptions.Item label="IP地址">{agent?.ip}</Descriptions.Item>
                    <Descriptions.Item label="操作系统">
                        <Tag color="blue">{agent?.os}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="系统架构">
                        <Tag>{agent?.arch}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="到期时间">
                        {agent?.expireTime ? (
                            <div className="flex flex-col gap-1">
                                <div>{new Date(agent.expireTime).toLocaleDateString('zh-CN')}</div>
                                {(() => {
                                    const expireDate = new Date(agent.expireTime);
                                    const now = new Date();
                                    const isExpired = expireDate < now;
                                    const daysLeft = Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                                    if (isExpired) {
                                        return <Tag color="red" bordered={false}>已过期</Tag>;
                                    } else if (daysLeft <= 7) {
                                        return <Tag color="orange" bordered={false}>{daysLeft}天后到期</Tag>;
                                    } else if (daysLeft <= 30) {
                                        return <Tag color="gold" bordered={false}>{daysLeft}天后到期</Tag>;
                                    }
                                    return null;
                                })()}
                            </div>
                        ) : '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="探针版本">{agent?.version}</Descriptions.Item>
                    <Descriptions.Item label="最后活跃时间">
                        <Space>
                            <Clock size={14}/>
                            {agent?.lastSeenAt && dayjs(agent.lastSeenAt).format('YYYY-MM-DD HH:mm:ss')}
                        </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="创建时间">
                        {agent?.createdAt && dayjs(agent.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                    </Descriptions.Item>
                    <Descriptions.Item label="更新时间">
                        {agent?.updatedAt && dayjs(agent.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
                    </Descriptions.Item>
                </Descriptions>
            ),
        },
        {
            key: 'audit',
            label: (
                <div className="flex items-center gap-2 text-sm">
                    <Shield size={16}/>
                    <div>安全审计</div>
                    {auditResult && failCount > 0 && (
                        <Tag color="error" style={{marginLeft: 4}}>{failCount}</Tag>
                    )}
                </div>
            ),
            children: (
                <Space direction="vertical">
                    {/* 非 Linux 系统提示 */}
                    {agent && !agent.os.toLowerCase().includes('linux') && (
                        <Alert
                            message="功能限制"
                            description="安全审计功能仅支持 Linux 系统。当前系统为 Windows 或其他系统，无法使用此功能。"
                            type="warning"
                            showIcon
                        />
                    )}

                    {!auditResult ? (
                        agent?.os.toLowerCase().includes('linux') ? (
                            <Alert
                                message="暂无审计结果"
                                description={
                                    <Space direction="vertical">
                                        <span>该探针还没有进行过安全审计。点击右上角"下发命令"按钮，选择"安全审计"来执行首次审计。</span>
                                        <Button
                                            type="primary"
                                            icon={<Shield size={16}/>}
                                            onClick={handleStartAudit}
                                            loading={auditing}
                                        >
                                            立即开始审计
                                        </Button>
                                    </Space>
                                }
                                type="info"
                                showIcon
                            />
                        ) : null
                    ) : (
                        <>
                            {/* 审计概览 */}
                            <Card bordered={false}>
                                <Row gutter={[16, 16]}>
                                    <Col xs={12} sm={6}>
                                        <Statistic
                                            title="总检查项"
                                            value={totalCount}
                                            prefix={<Shield size={18} className="lg:w-5 lg:h-5"/>}
                                        />
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <Statistic
                                            title="通过"
                                            value={passCount}
                                            valueStyle={{color: '#52c41a'}}
                                            prefix={<CheckCircle size={18} className="lg:w-5 lg:h-5"/>}
                                        />
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <Statistic
                                            title="失败"
                                            value={failCount}
                                            valueStyle={{color: '#ff4d4f'}}
                                            prefix={<XCircle size={18} className="lg:w-5 lg:h-5"/>}
                                        />
                                    </Col>
                                    <Col xs={12} sm={6}>
                                        <Statistic
                                            title="警告"
                                            value={warnCount}
                                            valueStyle={{color: '#faad14'}}
                                            prefix={<AlertTriangle size={18} className="lg:w-5 lg:h-5"/>}
                                        />
                                    </Col>
                                    <Col xs={12} sm={12}>
                                        <Statistic
                                            title="风险评分"
                                            value={auditResult.riskScore}
                                            suffix="/ 100"
                                            valueStyle={{
                                                color: auditResult.riskScore >= 80 ? '#ff4d4f' :
                                                    auditResult.riskScore >= 50 ? '#faad14' :
                                                        auditResult.riskScore >= 20 ? '#1890ff' : '#52c41a'
                                            }}
                                            prefix={<Activity size={18} className="lg:w-5 lg:h-5"/>}
                                        />
                                    </Col>
                                    <Col xs={12} sm={12}>
                                        <div className="text-sm text-gray-500 mb-2">威胁等级</div>
                                        <Tag
                                            color={
                                                auditResult.threatLevel === 'critical' || auditResult.threatLevel === 'high' ? 'error' :
                                                    auditResult.threatLevel === 'medium' ? 'warning' : 'success'
                                            }
                                            className="text-base px-3 py-1"
                                        >
                                            {auditResult.threatLevel === 'critical' ? '严重风险' :
                                                auditResult.threatLevel === 'high' ? '高风险' :
                                                    auditResult.threatLevel === 'medium' ? '中风险' : '低风险'}
                                        </Tag>
                                    </Col>
                                </Row>
                                <div className="mt-4 text-sm text-gray-500">
                                    最近审计时间: {dayjs(auditResult.startTime).format('YYYY-MM-DD HH:mm:ss')}
                                </div>
                            </Card>

                            {/* 详细审计结果 */}
                            <AuditResultView result={auditResult}/>
                        </>
                    )}
                </Space>
            ),
        },
        {
            key: 'tamper',
            label: (
                <div className="flex items-center gap-2 text-sm">
                    <FileWarning size={16}/>
                    <div>防篡改保护</div>
                </div>
            ),
            children: agent?.os.toLowerCase().includes('linux') ? (
                <TamperProtection agentId={agent.id} />
            ) : (
                <Alert
                    message="功能限制"
                    description="防篡改保护功能仅支持 Linux 系统。当前系统为 Windows 或其他系统，无法使用此功能。"
                    type="warning"
                    showIcon
                />
            ),
        },
    ];

    return (
        <div className="space-y-4 lg:space-y-6">
            {/* 页面头部 */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                    icon={<ArrowLeft size={16}/>}
                    onClick={() => navigate('/admin/agents')}
                    size="middle"
                >
                    返回列表
                </Button>

                <Space size={8}>
                    <Dropdown
                        menu={{items: commandMenuItems}}
                        placement="bottomRight"
                        trigger={['click']}
                    >
                        <Button
                            type="primary"
                            icon={<Terminal size={16}/>}
                            loading={auditing}
                            size="middle"
                        >
                            <span className="hidden sm:inline">下发命令</span>
                            <span className="sm:hidden">命令</span>
                        </Button>
                    </Dropdown>
                </Space>
            </div>

            {/* 探针状态卡片 */}
            <Card variant={'outlined'}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Activity size={32} className="text-blue-500"/>
                        <div>
                            <h2 className="text-xl font-semibold m-0">{agent?.name || agent?.hostname}</h2>
                            <Space className="mt-1">
                                <span className="text-gray-500">{agent?.hostname}</span>
                                {agent?.status === 1 ? (
                                    <Tag color="success">在线</Tag>
                                ) : (
                                    <Tag color="error">离线</Tag>
                                )}
                            </Space>
                        </div>
                    </div>
                    {auditResult && (
                        <div className="text-center">
                            <div className="text-sm text-gray-500">安全评分</div>
                            <div className={`text-3xl font-bold ${
                                auditResult.riskScore >= 80 ? 'text-red-500' :
                                    auditResult.riskScore >= 50 ? 'text-orange-500' :
                                        auditResult.riskScore >= 20 ? 'text-blue-500' : 'text-green-500'
                            }`}>
                                {100 - auditResult.riskScore}
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            {/* Tabs 内容 */}
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                size="large"
            />
        </div>
    );
};

export default AgentDetail;
