import React, {useState} from 'react';
import TamperProtectionConfig from './TamperProtectionConfig';
import TamperProtectionEvents from './TamperProtectionEvents';

interface TamperProtectionProps {
    agentId: string;
}

const TamperProtection: React.FC<TamperProtectionProps> = ({agentId}) => {
    const [activeTab, setActiveTab] = useState<'config' | 'events'>('config');

    return (
        <div className="space-y-4">
            {/* Tab 切换 */}
            <div className="flex gap-2 border-b border-gray-200">
                <button
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'config'
                            ? 'border-b-2 border-blue-500 text-blue-600'
                            : 'text-gray-600 hover:text-gray-900'
                    }`}
                    onClick={() => setActiveTab('config')}
                >
                    保护配置
                </button>
                <button
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'events'
                            ? 'border-b-2 border-blue-500 text-blue-600'
                            : 'text-gray-600 hover:text-gray-900'
                    }`}
                    onClick={() => setActiveTab('events')}
                >
                    文件事件
                </button>
            </div>

            {/* 配置面板 */}
            {activeTab === 'config' && <TamperProtectionConfig agentId={agentId}/>}

            {/* 事件列表面板 */}
            {activeTab === 'events' && <TamperProtectionEvents agentId={agentId}/>}
        </div>
    );
};

export default TamperProtection;
