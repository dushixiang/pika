import React, {useEffect, useState} from 'react';
import {AlertTriangle, FileWarning, Plus, RefreshCw, Save, Shield, Trash2} from 'lucide-react';
import {
    getTamperAlerts,
    getTamperConfig,
    getTamperEvents,
    type TamperAlert,
    type TamperConfig,
    type TamperEvent,
    updateTamperConfig
} from '../../api/tamper.ts';
import {App} from "antd";

interface TamperProtectionProps {
    agentId: string;
}

const TamperProtection: React.FC<TamperProtectionProps> = ({agentId}) => {
    const [activeTab, setActiveTab] = useState<'config' | 'events' | 'alerts'>('config');
    const [config, setConfig] = useState<TamperConfig | null>(null);
    const [events, setEvents] = useState<TamperEvent[]>([]);
    const [alerts, setAlerts] = useState<TamperAlert[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    let {message} = App.useApp();

    // 配置编辑状态
    const [editPaths, setEditPaths] = useState<string[]>([]);
    const [newPath, setNewPath] = useState('');

    // 分页状态
    const [eventsPage, setEventsPage] = useState(1);
    const [eventsTotal, setEventsTotal] = useState(0);
    const [alertsPage, setAlertsPage] = useState(1);
    const [alertsTotal, setAlertsTotal] = useState(0);

    // 加载配置
    const loadConfig = async () => {
        try {
            setLoading(true);
            const response = await getTamperConfig(agentId);
            if (response.data.success && response.data.data) {
                setConfig(response.data.data);
                setEditPaths(response.data.data.paths || []);
            } else {
                setEditPaths([]);
            }
        } catch (error) {
            console.error('Failed to load tamper config:', error);
        } finally {
            setLoading(false);
        }
    };

    // 加载事件
    const loadEvents = async (page: number = 1) => {
        try {
            setLoading(true);
            const response = await getTamperEvents(agentId, page, 20);
            if (response.data.success) {
                setEvents(response.data.data.items || []);
                setEventsTotal(response.data.data.total || 0);
                setEventsPage(page);
            }
        } catch (error) {
            console.error('Failed to load tamper events:', error);
        } finally {
            setLoading(false);
        }
    };

    // 加载告警
    const loadAlerts = async (page: number = 1) => {
        try {
            setLoading(true);
            const response = await getTamperAlerts(agentId, page, 20);
            if (response.data.success) {
                setAlerts(response.data.data.items || []);
                setAlertsTotal(response.data.data.total || 0);
                setAlertsPage(page);
            }
        } catch (error) {
            console.error('Failed to load tamper alerts:', error);
        } finally {
            setLoading(false);
        }
    };

    // 保存配置
    const handleSaveConfig = async () => {
        try {
            setSaving(true);
            const response = await updateTamperConfig(agentId, editPaths);
            if (response.data.success) {
                message.success('配置保存成功！');
                await loadConfig();
            }
        } catch (error) {
            console.error('Failed to save config:', error);
            message.error('配置保存失败，请重试。');
        } finally {
            setSaving(false);
        }
    };

    // 添加路径
    const handleAddPath = () => {
        if (newPath.trim() && !editPaths.includes(newPath.trim())) {
            setEditPaths([...editPaths, newPath.trim()]);
            setNewPath('');
        }
    };

    // 删除路径
    const handleRemovePath = (path: string) => {
        setEditPaths(editPaths.filter(p => p !== path));
    };

    // 初始化加载
    useEffect(() => {
        if (activeTab === 'config') {
            loadConfig();
        } else if (activeTab === 'events') {
            loadEvents(1);
        } else if (activeTab === 'alerts') {
            loadAlerts(1);
        }
    }, [activeTab, agentId]);

    // 格式化时间
    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleString('zh-CN');
    };

    return (
        <div className="space-y-6">
            {/* 标签页导航 */}
            <div className="flex space-x-2 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('config')}
                    className={`px-4 py-2 text-sm font-medium transition ${
                        activeTab === 'config'
                            ? 'border-b-2 border-blue-600 text-blue-600'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <Shield className="inline h-4 w-4 mr-1"/>
                    保护配置
                </button>
                <button
                    onClick={() => setActiveTab('events')}
                    className={`px-4 py-2 text-sm font-medium transition ${
                        activeTab === 'events'
                            ? 'border-b-2 border-blue-600 text-blue-600'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <FileWarning className="inline h-4 w-4 mr-1"/>
                    文件事件
                </button>
                <button
                    onClick={() => setActiveTab('alerts')}
                    className={`px-4 py-2 text-sm font-medium transition ${
                        activeTab === 'alerts'
                            ? 'border-b-2 border-blue-600 text-blue-600'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <AlertTriangle className="inline h-4 w-4 mr-1"/>
                    属性告警
                </button>
            </div>

            {/* 配置标签页 */}
            {activeTab === 'config' && (
                <div className="space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-blue-50 p-4">
                        <p className="text-sm text-slate-700">
                            <Shield className="inline h-4 w-4 mr-1 text-blue-600"/>
                            防篡改保护通过设置目录的不可变属性来防止文件被修改、删除或重命名。配置更新后将实时同步到探针。
                        </p>
                    </div>

                    {/* 添加路径 */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newPath}
                            onChange={(e) => setNewPath(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddPath()}
                            placeholder="输入要保护的目录路径，如 /etc/nginx"
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                        <button
                            onClick={handleAddPath}
                            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                            <Plus className="h-4 w-4"/>
                            添加
                        </button>
                    </div>

                    {/* 路径列表 */}
                    <div className="space-y-2">
                        {editPaths.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
                                <Shield className="mx-auto h-12 w-12 text-slate-300"/>
                                <p className="mt-2 text-sm text-slate-500">暂未配置保护目录</p>
                            </div>
                        ) : (
                            editPaths.map((path, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
                                >
                                    <span className="font-mono text-sm text-slate-700">{path}</span>
                                    <button
                                        onClick={() => handleRemovePath(path)}
                                        className="text-red-600 hover:text-red-700"
                                    >
                                        <Trash2 className="h-4 w-4"/>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    {/* 保存按钮 */}
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={loadConfig}
                            disabled={loading}
                            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>
                            重新加载
                        </button>
                        <button
                            onClick={handleSaveConfig}
                            disabled={saving}
                            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Save className="h-4 w-4"/>
                            {saving ? '保存中...' : '保存配置'}
                        </button>
                    </div>
                </div>
            )}

            {/* 事件标签页 */}
            {activeTab === 'events' && (
                <div className="space-y-4">
                    <div className="text-sm text-slate-500">
                        共 {eventsTotal} 条事件记录
                    </div>

                    {events.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
                            <FileWarning className="mx-auto h-12 w-12 text-slate-300"/>
                            <p className="mt-2 text-sm text-slate-500">暂无文件事件</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {events.map((event) => (
                                <div
                                    key={event.id}
                                    className="rounded-lg border border-slate-200 bg-white p-4"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                                    {event.operation}
                                                </span>
                                                <span className="font-mono text-sm text-slate-700">{event.path}</span>
                                            </div>
                                            <p className="mt-1 text-xs text-slate-500">{event.details}</p>
                                        </div>
                                        <span className="text-xs text-slate-400">{formatTime(event.timestamp)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 分页 */}
                    {eventsTotal > 20 && (
                        <div className="flex justify-center gap-2">
                            <button
                                onClick={() => loadEvents(eventsPage - 1)}
                                disabled={eventsPage === 1}
                                className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
                            >
                                上一页
                            </button>
                            <span className="px-3 py-1 text-sm text-slate-700">
                                {eventsPage} / {Math.ceil(eventsTotal / 20)}
                            </span>
                            <button
                                onClick={() => loadEvents(eventsPage + 1)}
                                disabled={eventsPage >= Math.ceil(eventsTotal / 20)}
                                className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
                            >
                                下一页
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* 告警标签页 */}
            {activeTab === 'alerts' && (
                <div className="space-y-4">
                    <div className="text-sm text-slate-500">
                        共 {alertsTotal} 条告警记录
                    </div>

                    {alerts.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
                            <AlertTriangle className="mx-auto h-12 w-12 text-slate-300"/>
                            <p className="mt-2 text-sm text-slate-500">暂无属性告警</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className={`rounded-lg border p-4 ${
                                        alert.restored
                                            ? 'border-green-200 bg-green-50'
                                            : 'border-red-200 bg-red-50'
                                    }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle
                                                    className={`h-4 w-4 ${
                                                        alert.restored ? 'text-green-600' : 'text-red-600'
                                                    }`}
                                                />
                                                <span className="font-mono text-sm text-slate-700">{alert.path}</span>
                                            </div>
                                            <p className="mt-1 text-xs text-slate-600">{alert.details}</p>
                                            <p className={`mt-1 text-xs font-medium ${
                                                alert.restored ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                                {alert.restored ? '✓ 已自动恢复' : '✗ 恢复失败'}
                                            </p>
                                        </div>
                                        <span className="text-xs text-slate-400">{formatTime(alert.timestamp)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 分页 */}
                    {alertsTotal > 20 && (
                        <div className="flex justify-center gap-2">
                            <button
                                onClick={() => loadAlerts(alertsPage - 1)}
                                disabled={alertsPage === 1}
                                className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
                            >
                                上一页
                            </button>
                            <span className="px-3 py-1 text-sm text-slate-700">
                                {alertsPage} / {Math.ceil(alertsTotal / 20)}
                            </span>
                            <button
                                onClick={() => loadAlerts(alertsPage + 1)}
                                disabled={alertsPage >= Math.ceil(alertsTotal / 20)}
                                className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
                            >
                                下一页
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TamperProtection;
