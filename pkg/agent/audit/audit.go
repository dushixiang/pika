package audit

import (
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/dushixiang/pika/internal/protocol"
)

// 状态常量
const (
	StatusPass = "pass"
	StatusFail = "fail"
	StatusWarn = "warn"
	StatusSkip = "skip"
)

// Auditor VPS 资产收集器(Agent端只负责信息收集)
type Auditor struct {
	config   *Config
	cache    *ProcessCache
	executor *CommandExecutor

	// 资产收集器
	networkAssetsCollector *NetworkAssetsCollector
	processAssetsCollector *ProcessAssetsCollector
	userAssetsCollector    *UserAssetsCollector
	fileAssetsCollector    *FileAssetsCollector
	kernelAssetsCollector  *KernelAssetsCollector
}

// NewAuditor 创建审计器
func NewAuditor(config *Config) *Auditor {
	if config == nil {
		config = DefaultConfig()
	}

	// 初始化共享组件
	cache := NewProcessCache(config.PerformanceConfig.ProcessCacheDuration)
	executor := NewCommandExecutor(config.PerformanceConfig.CommandTimeout)

	// 初始化资产收集器
	return &Auditor{
		config:   config,
		cache:    cache,
		executor: executor,

		networkAssetsCollector: NewNetworkAssetsCollector(config, cache, executor),
		processAssetsCollector: NewProcessAssetsCollector(config, cache),
		userAssetsCollector:    NewUserAssetsCollector(config, executor),
		fileAssetsCollector:    NewFileAssetsCollector(config, executor),
		kernelAssetsCollector:  NewKernelAssetsCollector(config, executor),
	}
}

// RunAudit 执行 VPS 资产收集(Agent端只收集信息,不做安全判断)
func (a *Auditor) RunAudit() (*protocol.VPSAuditResult, error) {
	startTime := time.Now().UnixMilli()

	// 检查操作系统
	if runtime.GOOS != "linux" {
		return nil, fmt.Errorf("只支持 Linux 系统")
	}

	// 检查运行权限
	if os.Geteuid() != 0 {
		return nil, fmt.Errorf("需要root权限运行完整收集")
	}

	globalLogger.Info("开始资产收集...")

	// 获取系统信息
	sysInfoCollector := NewSystemInfoCollector(a.executor)
	systemInfo, err := sysInfoCollector.Collect()
	if err != nil {
		return nil, fmt.Errorf("获取系统信息失败: %w", err)
	}

	// 收集警告(仅收集过程中的错误或异常)
	warningCollector := NewWarningCollector()

	// 收集资产清单
	globalLogger.Info("开始收集资产清单...")
	assetInventory := a.collectAssets()

	// 计算统计信息
	statistics := a.calculateStatistics(assetInventory)

	endTime := time.Now().UnixMilli()

	globalLogger.Info("资产收集完成，耗时 %dms", endTime-startTime)

	result := &protocol.VPSAuditResult{
		SystemInfo:      *systemInfo,
		StartTime:       startTime,
		EndTime:         endTime,
		CollectWarnings: warningCollector.GetAll(),
	}

	// 设置资产清单和统计信息
	if assetInventory != nil {
		result.AssetInventory = *assetInventory
	}
	if statistics != nil {
		result.Statistics = *statistics
	}

	return result, nil
}

// collectAssets 收集资产清单
func (a *Auditor) collectAssets() *protocol.AssetInventory {
	inventory := &protocol.AssetInventory{}

	// 并发收集各类资产
	type assetTask struct {
		name string
		fn   func()
	}

	tasks := []assetTask{
		{"网络资产", func() {
			inventory.NetworkAssets = a.networkAssetsCollector.Collect()
		}},
		{"进程资产", func() {
			inventory.ProcessAssets = a.processAssetsCollector.Collect()
		}},
		{"用户资产", func() {
			inventory.UserAssets = a.userAssetsCollector.Collect()
		}},
		{"文件资产", func() {
			inventory.FileAssets = a.fileAssetsCollector.Collect()
		}},
		{"内核资产", func() {
			inventory.KernelAssets = a.kernelAssetsCollector.Collect()
		}},
	}

	// 串行执行(避免资源竞争,实际可以优化为并发)
	for _, task := range tasks {
		globalLogger.Debug("收集%s...", task.name)
		task.fn()
	}

	return inventory
}

// calculateStatistics 计算统计信息
func (a *Auditor) calculateStatistics(inventory *protocol.AssetInventory) *protocol.AuditStatistics {
	stats := &protocol.AuditStatistics{}

	if inventory.NetworkAssets != nil {
		stats.NetworkStats = inventory.NetworkAssets.Statistics
	}

	if inventory.ProcessAssets != nil {
		stats.ProcessStats = inventory.ProcessAssets.Statistics
	}

	if inventory.UserAssets != nil {
		stats.UserStats = inventory.UserAssets.Statistics
	}

	if inventory.FileAssets != nil {
		stats.FileStats = inventory.FileAssets.Statistics
	}

	return stats
}

// RunAuditWithConfig 使用自定义配置执行资产收集
func RunAuditWithConfig(config *Config) (*protocol.VPSAuditResult, error) {
	auditor := NewAuditor(config)
	return auditor.RunAudit()
}

// RunAudit 使用默认配置执行资产收集（保持向后兼容）
func RunAudit() (*protocol.VPSAuditResult, error) {
	return RunAuditWithConfig(nil)
}
