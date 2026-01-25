import {Card} from '@portal/components/Card.tsx';

interface NetworkInterface {
    name: string;
    addrs: string[];
}

interface NetworkAddressSectionProps {
    ipv4?: string;
    ipv6?: string;
    deviceIpInterfaces: NetworkInterface[];
}

/**
 * 网络地址信息展示组件
 * 包含公网地址（IPv4/IPv6）和设备网卡地址信息
 */
export const NetworkAddressSection = ({ipv4, ipv6, deviceIpInterfaces}: NetworkAddressSectionProps) => {
    const hasPublicIp = ipv4 || ipv6;
    const hasDeviceIp = deviceIpInterfaces.length > 0;

    if (!hasPublicIp && !hasDeviceIp) {
        return null;
    }

    return (
        <Card
            title="网络地址"
            description="已登录用户可见的公网 IP 及设备网卡地址信息"
        >
            <div className="space-y-6">
                {/* 公网地址 */}
                {hasPublicIp && (
                    <div className="space-y-3">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            公网地址
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">IPv4</div>
                                <div className="font-mono text-sm text-slate-900 dark:text-slate-100">{ipv4 || '-'}</div>
                            </div>
                            <div className="space-y-2">
                                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">IPv6</div>
                                <div className="font-mono text-sm text-slate-900 dark:text-slate-100">{ipv6 || '-'}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 分割线 */}
                {hasPublicIp && hasDeviceIp && (
                    <div className="border-t border-slate-200 dark:border-slate-700"></div>
                )}

                {/* 网卡地址 */}
                {hasDeviceIp && (
                    <div className="space-y-3">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            网卡地址
                        </div>
                        <div className="space-y-4">
                            {deviceIpInterfaces.map((netInterface) => (
                                <div key={netInterface.name} className="space-y-2">
                                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                        {netInterface.name}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {netInterface.addrs.map((addr) => (
                                            <span
                                                key={`${netInterface.name}-${addr}`}
                                                className="px-2 py-0.5 rounded-sm border border-slate-200 bg-white/70 text-xs font-mono text-slate-600 dark:border-cyan-900/40 dark:bg-cyan-950/40 dark:text-cyan-200"
                                            >
                                                {addr}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};
