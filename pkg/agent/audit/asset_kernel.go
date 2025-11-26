package audit

import (
	"bufio"
	"os"
	"strconv"
	"strings"

	"github.com/dushixiang/pika/internal/protocol"
)

// KernelAssetsCollector 内核资产收集器
type KernelAssetsCollector struct {
	config   *Config
	executor *CommandExecutor
}

// NewKernelAssetsCollector 创建内核资产收集器
func NewKernelAssetsCollector(config *Config, executor *CommandExecutor) *KernelAssetsCollector {
	return &KernelAssetsCollector{
		config:   config,
		executor: executor,
	}
}

// Collect 收集内核资产
func (kac *KernelAssetsCollector) Collect() *protocol.KernelAssets {
	assets := &protocol.KernelAssets{}

	// 收集已加载内核模块
	assets.LoadedModules = kac.collectLoadedModules()

	// 收集内核参数 (选择性收集,避免过多)
	assets.KernelParameters = kac.collectKernelParameters()

	// 收集安全模块信息
	assets.SecurityModules = kac.collectSecurityModules()

	return assets
}

// collectLoadedModules 收集已加载内核模块
func (kac *KernelAssetsCollector) collectLoadedModules() []protocol.KernelModule {
	var modules []protocol.KernelModule

	file, err := os.Open("/proc/modules")
	if err != nil {
		globalLogger.Warn("读取/proc/modules失败: %v", err)
		return modules
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}

		name := fields[0]
		size, _ := strconv.Atoi(fields[1])
		usedBy, _ := strconv.Atoi(fields[2])

		module := protocol.KernelModule{
			Name:   name,
			Size:   size,
			UsedBy: usedBy,
		}

		modules = append(modules, module)

		// 限制数量,避免过多
		if len(modules) >= 100 {
			break
		}
	}

	return modules
}

// collectKernelParameters 收集内核参数
func (kac *KernelAssetsCollector) collectKernelParameters() map[string]string {
	params := make(map[string]string)

	// 只收集关键的安全相关参数
	keyParams := []string{
		"/proc/sys/net/ipv4/ip_forward",
		"/proc/sys/kernel/randomize_va_space",
		"/proc/sys/kernel/dmesg_restrict",
		"/proc/sys/kernel/kptr_restrict",
		"/proc/sys/kernel/yama/ptrace_scope",
	}

	for _, paramPath := range keyParams {
		if content, err := os.ReadFile(paramPath); err == nil {
			// 提取参数名
			paramName := strings.TrimPrefix(paramPath, "/proc/sys/")
			paramName = strings.ReplaceAll(paramName, "/", ".")
			params[paramName] = strings.TrimSpace(string(content))
		}
	}

	return params
}

// collectSecurityModules 收集安全模块信息
func (kac *KernelAssetsCollector) collectSecurityModules() *protocol.SecurityModuleInfo {
	info := &protocol.SecurityModuleInfo{}

	// 检查SELinux
	if content, err := os.ReadFile("/sys/fs/selinux/enforce"); err == nil {
		enforce := strings.TrimSpace(string(content))
		if enforce == "1" {
			info.SELinuxStatus = "enforcing"
		} else if enforce == "0" {
			info.SELinuxStatus = "permissive"
		}
	} else {
		// 检查是否禁用
		if _, err := os.Stat("/sys/fs/selinux"); os.IsNotExist(err) {
			info.SELinuxStatus = "disabled"
		}
	}

	// 检查AppArmor
	_, err := kac.executor.Execute("aa-status", "--enabled")
	if err == nil {
		info.AppArmorStatus = "enabled"
	} else {
		// 检查是否安装
		whichOutput, whichErr := kac.executor.Execute("which", "aa-status")
		if whichErr != nil || whichOutput == "" {
			info.AppArmorStatus = "not_installed"
		} else {
			info.AppArmorStatus = "disabled"
		}
	}

	// 检查Secure Boot (通过 mokutil 或 /sys/firmware/efi)
	if content, err := os.ReadFile("/sys/firmware/efi/efivars/SecureBoot-*"); err == nil {
		// 简化判断
		if len(content) > 0 {
			info.SecureBootState = "enabled"
		} else {
			info.SecureBootState = "disabled"
		}
	} else {
		info.SecureBootState = "unknown"
	}

	return info
}
