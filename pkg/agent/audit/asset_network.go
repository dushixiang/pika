package audit

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/dushixiang/pika/internal/protocol"
	gopsutilNet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

// NetworkAssetsCollector 网络资产收集器
type NetworkAssetsCollector struct {
	config   *Config
	cache    *ProcessCache
	executor *CommandExecutor
}

// NewNetworkAssetsCollector 创建网络资产收集器
func NewNetworkAssetsCollector(config *Config, cache *ProcessCache, executor *CommandExecutor) *NetworkAssetsCollector {
	return &NetworkAssetsCollector{
		config:   config,
		cache:    cache,
		executor: executor,
	}
}

// Collect 收集网络资产
func (nac *NetworkAssetsCollector) Collect() *protocol.NetworkAssets {
	assets := &protocol.NetworkAssets{}

	// 收集监听端口
	assets.ListeningPorts = nac.collectListeningPorts()

	// 收集网络连接
	assets.Connections = nac.collectConnections()

	// 收集网卡接口
	assets.Interfaces = nac.collectInterfaces()

	// 收集路由表
	assets.RoutingTable = nac.collectRoutingTable()

	// 收集防火墙规则
	assets.FirewallRules = nac.collectFirewallRules()

	// 收集DNS服务器
	assets.DNSServers = nac.collectDNSServers()

	// 收集ARP表
	assets.ARPTable = nac.collectARPTable()

	// 统计信息
	assets.Statistics = nac.calculateStatistics(assets)

	return assets
}

// collectListeningPorts 收集监听端口
func (nac *NetworkAssetsCollector) collectListeningPorts() []protocol.ListeningPort {
	var ports []protocol.ListeningPort

	connections, err := gopsutilNet.Connections("all")
	if err != nil {
		globalLogger.Warn("获取网络连接失败: %v", err)
		return ports
	}

	for _, conn := range connections {
		if conn.Status != "LISTEN" {
			continue
		}

		// 确定协议类型
		protocolType := "tcp"
		if conn.Type == 2 { // SOCK_DGRAM
			protocolType = "udp"
		}

		port := protocol.ListeningPort{
			Protocol:   protocolType,
			Address:    conn.Laddr.IP,
			Port:       conn.Laddr.Port,
			ProcessPID: conn.Pid,
		}

		// 判断是否公网监听
		port.IsPublic = !isLocalIP(conn.Laddr.IP)

		// 获取进程信息
		if conn.Pid > 0 {
			if proc, err := process.NewProcess(conn.Pid); err == nil {
				port.ProcessName, _ = proc.Name()
				port.ProcessPath, _ = proc.Exe()
			}
		}

		ports = append(ports, port)
	}

	return ports
}

// collectConnections 收集网络连接
func (nac *NetworkAssetsCollector) collectConnections() []protocol.NetworkConnection {
	var connections []protocol.NetworkConnection

	conns, err := gopsutilNet.Connections("all")
	if err != nil {
		globalLogger.Warn("获取网络连接失败: %v", err)
		return connections
	}

	// 限制连接数量,避免数据过大
	maxConnections := 200
	establishedCount := 0

	for _, conn := range conns {
		// 只收集 ESTABLISHED 连接
		if conn.Status != "ESTABLISHED" {
			continue
		}

		if establishedCount >= maxConnections {
			break
		}

		// 确定协议类型
		protocolType := "tcp"
		if conn.Type == 2 { // SOCK_DGRAM
			protocolType = "udp"
		}

		connection := protocol.NetworkConnection{
			Protocol:   protocolType,
			LocalAddr:  conn.Laddr.IP,
			LocalPort:  conn.Laddr.Port,
			RemoteAddr: conn.Raddr.IP,
			RemotePort: conn.Raddr.Port,
			State:      conn.Status,
			ProcessPID: conn.Pid,
		}

		// 获取进程信息
		if conn.Pid > 0 {
			if proc, err := process.NewProcess(conn.Pid); err == nil {
				connection.ProcessName, _ = proc.Name()
			}
		}

		connections = append(connections, connection)
		establishedCount++
	}

	return connections
}

// collectInterfaces 收集网卡接口
func (nac *NetworkAssetsCollector) collectInterfaces() []protocol.NetworkInterface {
	var interfaces []protocol.NetworkInterface

	ifaces, err := gopsutilNet.Interfaces()
	if err != nil {
		globalLogger.Warn("获取网卡接口失败: %v", err)
		return interfaces
	}

	for _, iface := range ifaces {
		netInterface := protocol.NetworkInterface{
			Name:       iface.Name,
			MacAddress: iface.HardwareAddr,
			MTU:        iface.MTU,
		}

		// 提取IP地址
		for _, addr := range iface.Addrs {
			netInterface.Addresses = append(netInterface.Addresses, addr.Addr)
		}

		// 解析标志
		for _, flag := range iface.Flags {
			netInterface.Flags = append(netInterface.Flags, flag)
			if flag == "up" {
				netInterface.IsUp = true
			}
		}

		interfaces = append(interfaces, netInterface)
	}

	return interfaces
}

// collectRoutingTable 收集路由表
func (nac *NetworkAssetsCollector) collectRoutingTable() []protocol.RouteEntry {
	var routes []protocol.RouteEntry

	// 使用 route -n 命令
	output, err := nac.executor.Execute("route", "-n")
	if err != nil {
		globalLogger.Debug("获取路由表失败: %v", err)
		return routes
	}

	lines := strings.Split(output, "\n")
	for i, line := range lines {
		// 跳过表头
		if i < 2 {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 8 {
			continue
		}

		route := protocol.RouteEntry{
			Destination: fields[0],
			Gateway:     fields[1],
			Genmask:     fields[2],
			Interface:   fields[7],
		}

		// 提取 Metric (可能在不同位置,取决于有无Flags)
		if len(fields) > 4 {
			fmt.Sscanf(fields[4], "%d", &route.Metric)
		}

		routes = append(routes, route)
	}

	return routes
}

// collectFirewallRules 收集防火墙规则
func (nac *NetworkAssetsCollector) collectFirewallRules() *protocol.FirewallInfo {
	fwInfo := &protocol.FirewallInfo{}

	// 尝试检测 iptables
	if _, err := exec.LookPath("iptables"); err == nil {
		fwInfo.Type = "iptables"
		fwInfo.Rules = nac.collectIptablesRules()
		fwInfo.Status = "active"
		return fwInfo
	}

	// 尝试检测 ufw
	if _, err := exec.LookPath("ufw"); err == nil {
		fwInfo.Type = "ufw"
		output, _ := nac.executor.Execute("ufw", "status")
		if strings.Contains(output, "Status: active") {
			fwInfo.Status = "active"
		} else {
			fwInfo.Status = "inactive"
		}
		return fwInfo
	}

	// 尝试检测 firewalld
	if _, err := exec.LookPath("firewall-cmd"); err == nil {
		fwInfo.Type = "firewalld"
		output, _ := nac.executor.Execute("firewall-cmd", "--state")
		if strings.Contains(output, "running") {
			fwInfo.Status = "active"
		} else {
			fwInfo.Status = "inactive"
		}
		return fwInfo
	}

	fwInfo.Type = "none"
	fwInfo.Status = "inactive"
	return fwInfo
}

// collectIptablesRules 收集 iptables 规则
func (nac *NetworkAssetsCollector) collectIptablesRules() []protocol.FirewallRule {
	var rules []protocol.FirewallRule

	// 限制规则数量,只收集前100条
	maxRules := 100

	output, err := nac.executor.Execute("iptables", "-L", "-n")
	if err != nil {
		return rules
	}

	lines := strings.Split(output, "\n")
	currentChain := ""

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// 解析链名
		if strings.HasPrefix(line, "Chain") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				currentChain = fields[1]
			}
			continue
		}

		// 跳过表头
		if strings.HasPrefix(line, "target") || line == "" {
			continue
		}

		if len(rules) >= maxRules {
			break
		}

		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		rule := protocol.FirewallRule{
			Chain:  currentChain,
			Target: fields[0],
		}

		if len(fields) > 1 {
			rule.Protocol = fields[1]
		}
		if len(fields) > 3 {
			rule.Source = fields[3]
		}
		if len(fields) > 4 {
			rule.Dest = fields[4]
		}

		rules = append(rules, rule)
	}

	return rules
}

// collectDNSServers 收集DNS服务器
func (nac *NetworkAssetsCollector) collectDNSServers() []string {
	var dnsServers []string

	file, err := os.Open("/etc/resolv.conf")
	if err != nil {
		return dnsServers
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "nameserver") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				dnsServers = append(dnsServers, fields[1])
			}
		}
	}

	return dnsServers
}

// collectARPTable 收集ARP表
func (nac *NetworkAssetsCollector) collectARPTable() []protocol.ARPEntry {
	var arpTable []protocol.ARPEntry

	// 限制ARP表数量
	maxEntries := 50

	output, err := nac.executor.Execute("arp", "-n")
	if err != nil {
		globalLogger.Debug("获取ARP表失败: %v", err)
		return arpTable
	}

	lines := strings.Split(output, "\n")
	for i, line := range lines {
		// 跳过表头
		if i == 0 {
			continue
		}

		if len(arpTable) >= maxEntries {
			break
		}

		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}

		entry := protocol.ARPEntry{
			IPAddress:  fields[0],
			MacAddress: fields[2],
			Interface:  fields[4],
		}

		arpTable = append(arpTable, entry)
	}

	return arpTable
}

// calculateStatistics 计算统计信息
func (nac *NetworkAssetsCollector) calculateStatistics(assets *protocol.NetworkAssets) *protocol.NetworkStatistics {
	stats := &protocol.NetworkStatistics{
		InterfaceCount:     len(assets.Interfaces),
		ConnectionsByState: make(map[string]int),
	}

	// 统计监听端口
	stats.TotalListeningPorts = len(assets.ListeningPorts)
	for _, port := range assets.ListeningPorts {
		if port.IsPublic {
			stats.PublicListeningPorts++
		}
	}

	// 统计连接
	stats.ActiveConnections = len(assets.Connections)
	for _, conn := range assets.Connections {
		stats.ConnectionsByState[conn.State]++
	}

	return stats
}

// isLocalIP 判断是否本地IP
func isLocalIP(ip string) bool {
	return ip == "127.0.0.1" || ip == "::1" || ip == "localhost"
}
