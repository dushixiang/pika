package audit

import (
	"sort"

	"github.com/dushixiang/pika/internal/protocol"
	"github.com/shirou/gopsutil/v4/process"
)

// ProcessAssetsCollector 进程资产收集器
type ProcessAssetsCollector struct {
	config *Config
	cache  *ProcessCache
}

// NewProcessAssetsCollector 创建进程资产收集器
func NewProcessAssetsCollector(config *Config, cache *ProcessCache) *ProcessAssetsCollector {
	return &ProcessAssetsCollector{
		config: config,
		cache:  cache,
	}
}

// Collect 收集进程资产
func (pac *ProcessAssetsCollector) Collect() *protocol.ProcessAssets {
	assets := &protocol.ProcessAssets{}

	procs, err := pac.cache.Get()
	if err != nil {
		globalLogger.Warn("获取进程列表失败: %v", err)
		return assets
	}

	// 收集所有进程信息
	var allProcesses []protocol.ProcessInfo
	for _, p := range procs {
		procInfo := pac.convertToProcessInfo(p)
		if procInfo != nil {
			allProcesses = append(allProcesses, *procInfo)
		}
	}

	// TOP CPU进程
	assets.TopCPUProcesses = pac.getTopProcesses(allProcesses, "cpu", 15)

	// TOP 内存进程
	assets.TopMemoryProcesses = pac.getTopProcesses(allProcesses, "memory", 15)

	// 可选:完整进程列表 (配置控制)
	// 暂时不包含完整列表,避免数据过大
	// assets.RunningProcesses = allProcesses

	// 统计信息
	assets.Statistics = pac.calculateStatistics(procs)

	return assets
}

// convertToProcessInfo 转换为进程信息
func (pac *ProcessAssetsCollector) convertToProcessInfo(p *process.Process) *protocol.ProcessInfo {
	name, err := p.Name()
	if err != nil {
		return nil
	}

	cmdline, _ := p.Cmdline()
	exe, _ := p.Exe()
	ppid, _ := p.Ppid()
	username, _ := p.Username()
	cpuPercent, _ := p.CPUPercent()
	memPercent, _ := p.MemoryPercent()
	status, _ := p.Status()
	createTime, _ := p.CreateTime()

	// 获取内存占用(MB)
	memInfo, err := p.MemoryInfo()
	var memoryMB uint64
	if err == nil && memInfo != nil {
		memoryMB = memInfo.RSS / 1024 / 1024
	}

	return &protocol.ProcessInfo{
		PID:        p.Pid,
		Name:       name,
		Cmdline:    cmdline,
		Exe:        exe,
		PPID:       ppid,
		Username:   username,
		CPUPercent: cpuPercent,
		MemPercent: memPercent,
		MemoryMB:   memoryMB,
		Status:     status[0], // 取第一个状态
		CreateTime: createTime,
	}
}

// getTopProcesses 获取TOP进程
func (pac *ProcessAssetsCollector) getTopProcesses(processes []protocol.ProcessInfo, sortBy string, limit int) []protocol.ProcessInfo {
	// 复制切片避免修改原始数据
	sorted := make([]protocol.ProcessInfo, len(processes))
	copy(sorted, processes)

	// 排序
	if sortBy == "cpu" {
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].CPUPercent > sorted[j].CPUPercent
		})
	} else if sortBy == "memory" {
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].MemoryMB > sorted[j].MemoryMB
		})
	}

	// 限制数量
	if len(sorted) > limit {
		sorted = sorted[:limit]
	}

	return sorted
}

// calculateStatistics 计算统计信息
func (pac *ProcessAssetsCollector) calculateStatistics(procs []*process.Process) *protocol.ProcessStatistics {
	stats := &protocol.ProcessStatistics{
		TotalProcesses: len(procs),
	}

	for _, p := range procs {
		status, err := p.Status()
		if err != nil {
			continue
		}

		if len(status) == 0 {
			continue
		}

		switch status[0] {
		case "R":
			stats.RunningProcesses++
		case "S", "D", "I":
			stats.SleepingProcesses++
		case "Z":
			stats.ZombieProcesses++
		}

		// 统计线程数
		numThreads, err := p.NumThreads()
		if err == nil {
			stats.ThreadCount += int(numThreads)
		}
	}

	return stats
}
