package collector

import (
	"encoding/json"

	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/pkg/agent/config"
)

// WebSocketWriter 定义 WebSocket 写入接口
type WebSocketWriter interface {
	WriteJSON(v interface{}) error
}

// Manager 采集器管理器
type Manager struct {
	cpuCollector               *CPUCollector
	memoryCollector            *MemoryCollector
	diskCollector              *DiskCollector
	diskIOCollector            *DiskIOCollector
	networkCollector           *NetworkCollector
	networkConnectionCollector *NetworkConnectionCollector
	hostCollector              *HostCollector
	temperatureCollector       *TemperatureCollector
	gpuCollector               *GPUCollector
	monitorCollector           *MonitorCollector
	ddnsCollector              *DDNSCollector
}

// NewManager 创建采集器管理器
func NewManager(cfg *config.Config) *Manager {
	return &Manager{
		cpuCollector:               NewCPUCollector(),
		memoryCollector:            NewMemoryCollector(),
		diskCollector:              NewDiskCollector(cfg),
		diskIOCollector:            NewDiskIOCollector(),
		networkCollector:           NewNetworkCollector(cfg),
		networkConnectionCollector: NewNetworkConnectionCollector(),
		hostCollector:              NewHostCollector(),
		temperatureCollector:       NewTemperatureCollector(),
		gpuCollector:               NewGPUCollector(),
		monitorCollector:           NewMonitorCollector(),
		ddnsCollector:              nil, // DDNS 采集器需要配置后才能初始化
	}
}

// CollectAndSendCPU 采集并发送 CPU 指标
func (m *Manager) CollectAndSendCPU(conn WebSocketWriter) error {
	cpuData, err := m.cpuCollector.Collect()
	if err != nil {
		return err
	}

	return m.sendMetrics(conn, protocol.MetricTypeCPU, cpuData)
}

// CollectAndSendMemory 采集并发送内存指标
func (m *Manager) CollectAndSendMemory(conn WebSocketWriter) error {
	memData, err := m.memoryCollector.Collect()
	if err != nil {
		return err
	}

	return m.sendMetrics(conn, protocol.MetricTypeMemory, memData)
}

// CollectAndSendDisk 采集并发送磁盘指标
func (m *Manager) CollectAndSendDisk(conn WebSocketWriter) error {
	diskDataList, err := m.diskCollector.Collect()
	if err != nil {
		return err
	}
	return m.sendMetrics(conn, protocol.MetricTypeDisk, diskDataList)
}

// CollectAndSendDiskIO 采集并发送磁盘 IO 指标
func (m *Manager) CollectAndSendDiskIO(conn WebSocketWriter) error {
	diskIODataList, err := m.diskIOCollector.Collect()
	if err != nil {
		return err
	}
	return m.sendMetrics(conn, protocol.MetricTypeDiskIO, diskIODataList)
}

// CollectAndSendNetwork 采集并发送网络指标
func (m *Manager) CollectAndSendNetwork(conn WebSocketWriter) error {
	networkDataList, err := m.networkCollector.Collect()
	if err != nil {
		return err
	}
	return m.sendMetrics(conn, protocol.MetricTypeNetwork, networkDataList)
}

// CollectAndSendNetworkConnection 采集并发送网络连接统计
func (m *Manager) CollectAndSendNetworkConnection(conn WebSocketWriter) error {
	connectionData, err := m.networkConnectionCollector.Collect()
	if err != nil {
		return err
	}
	return m.sendMetrics(conn, protocol.MetricTypeNetworkConnection, connectionData)
}

// CollectAndSendHost 采集并发送主机信息
func (m *Manager) CollectAndSendHost(conn WebSocketWriter) error {
	hostData, err := m.hostCollector.Collect()
	if err != nil {
		return err
	}

	return m.sendMetrics(conn, protocol.MetricTypeHost, hostData)
}

// CollectAndSendGPU 采集并发送 GPU 指标
func (m *Manager) CollectAndSendGPU(conn WebSocketWriter) error {
	gpuDataList, err := m.gpuCollector.Collect()
	if err != nil || len(gpuDataList) == 0 {
		// GPU 监控不是必须的,失败或无数据时直接返回
		return nil
	}

	return m.sendMetrics(conn, protocol.MetricTypeGPU, gpuDataList)
}

// CollectAndSendTemperature 采集并发送温度信息
func (m *Manager) CollectAndSendTemperature(conn WebSocketWriter) error {
	tempDataList, err := m.temperatureCollector.Collect()
	if err != nil || len(tempDataList) == 0 {
		// 温度监控不是必须的,失败或无数据时直接返回
		return nil
	}

	return m.sendMetrics(conn, protocol.MetricTypeTemperature, tempDataList)
}

// CollectAndSendMonitor 采集并发送监控数据
func (m *Manager) CollectAndSendMonitor(conn WebSocketWriter, items []protocol.MonitorItem) error {
	monitorDataList := m.monitorCollector.Collect(items)
	return m.sendMetrics(conn, protocol.MetricTypeMonitor, monitorDataList)
}

// UpdateDDNSConfig 更新 DDNS 配置
func (m *Manager) UpdateDDNSConfig(config *protocol.DDNSConfigData) {
	if config == nil || !config.Enabled {
		m.ddnsCollector = nil
		return
	}

	if m.ddnsCollector == nil {
		m.ddnsCollector = NewDDNSCollector(config)
	} else {
		m.ddnsCollector.UpdateConfig(config)
	}
}

// CollectAndSendDDNSIP 采集并发送 DDNS IP 地址
func (m *Manager) CollectAndSendDDNSIP(conn WebSocketWriter) error {
	if m.ddnsCollector == nil {
		return nil // DDNS 未启用，静默返回
	}

	ipData, err := m.ddnsCollector.Collect()
	if err != nil {
		return err
	}

	// 只有当至少有一个 IP 地址时才发送
	if ipData.IPv4 == "" && ipData.IPv6 == "" {
		return nil
	}

	dataBytes, err := json.Marshal(ipData)
	if err != nil {
		return err
	}

	msg := protocol.Message{
		Type: protocol.MessageTypeDDNSIPReport,
		Data: dataBytes,
	}

	return conn.WriteJSON(msg)
}

// sendMetrics 发送指标数据
func (m *Manager) sendMetrics(conn WebSocketWriter, metricType protocol.MetricType, data interface{}) error {
	dataBytes, err := json.Marshal(data)
	if err != nil {
		return err
	}

	metrics := protocol.MetricsWrapper{
		Type: metricType,
		Data: json.RawMessage(dataBytes),
	}

	metricsData, err := json.Marshal(metrics)
	if err != nil {
		return err
	}

	msg := protocol.Message{
		Type: protocol.MessageTypeMetrics,
		Data: metricsData,
	}

	return conn.WriteJSON(msg)
}

// GetPublicIP 通过 API 获取公网 IP 地址
func (m *Manager) GetPublicIP(apiURL string, isIPv6 bool) (string, error) {
	collector := NewDDNSCollector(&protocol.DDNSConfigData{
		Enabled: true,
	})
	return collector.GetIPFromAPI(apiURL, isIPv6)
}

// GetInterfaceIP 从网络接口获取 IP 地址
func (m *Manager) GetInterfaceIP(interfaceName string, isIPv6 bool) (string, error) {
	collector := NewDDNSCollector(&protocol.DDNSConfigData{
		Enabled: true,
	})
	return collector.GetIPFromInterface(interfaceName, isIPv6)
}
