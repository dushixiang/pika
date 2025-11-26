package audit

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dushixiang/pika/internal/protocol"
)

// FileAssetsCollector 文件资产收集器
type FileAssetsCollector struct {
	config   *Config
	executor *CommandExecutor
}

// NewFileAssetsCollector 创建文件资产收集器
func NewFileAssetsCollector(config *Config, executor *CommandExecutor) *FileAssetsCollector {
	return &FileAssetsCollector{
		config:   config,
		executor: executor,
	}
}

// Collect 收集文件资产
func (fac *FileAssetsCollector) Collect() *protocol.FileAssets {
	assets := &protocol.FileAssets{}

	// 收集Cron任务
	assets.CronJobs = fac.collectCronJobs()

	// 收集Systemd服务
	assets.SystemdServices = fac.collectSystemdServices()

	// 收集启动脚本
	assets.StartupScripts = fac.collectStartupScripts()

	// 收集最近修改文件
	assets.RecentModified = fac.collectRecentModified()

	// 收集大文件
	assets.LargeFiles = fac.collectLargeFiles()

	// 统计信息
	assets.Statistics = fac.calculateStatistics(assets)

	return assets
}

// collectCronJobs 收集Cron任务
func (fac *FileAssetsCollector) collectCronJobs() []protocol.CronJob {
	var jobs []protocol.CronJob

	// 收集 /etc/crontab
	jobs = append(jobs, fac.parseCronFile("/etc/crontab", "root")...)

	// 收集 /etc/cron.d/*
	cronDFiles, _ := filepath.Glob("/etc/cron.d/*")
	for _, file := range cronDFiles {
		jobs = append(jobs, fac.parseCronFile(file, "root")...)
	}

	// 收集用户crontab
	userCronFiles, _ := filepath.Glob("/var/spool/cron/*")
	for _, file := range userCronFiles {
		username := filepath.Base(file)
		jobs = append(jobs, fac.parseCronFile(file, username)...)
	}

	// 限制数量
	if len(jobs) > 100 {
		jobs = jobs[:100]
	}

	return jobs
}

// parseCronFile 解析Cron文件
func (fac *FileAssetsCollector) parseCronFile(filePath string, defaultUser string) []protocol.CronJob {
	var jobs []protocol.CronJob

	file, err := os.Open(filePath)
	if err != nil {
		return jobs
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// 跳过环境变量定义
		if strings.Contains(line, "=") && !strings.Contains(line, " ") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 6 {
			continue
		}

		// 判断是否包含用户字段
		user := defaultUser
		schedule := ""
		command := ""

		// /etc/crontab 格式: min hour day month dow user command
		if filePath == "/etc/crontab" && len(fields) >= 7 {
			schedule = strings.Join(fields[0:5], " ")
			user = fields[5]
			command = strings.Join(fields[6:], " ")
		} else {
			// 用户crontab格式: min hour day month dow command
			schedule = strings.Join(fields[0:5], " ")
			command = strings.Join(fields[5:], " ")
		}

		job := protocol.CronJob{
			User:     user,
			Schedule: schedule,
			Command:  command,
			FilePath: filePath,
		}

		jobs = append(jobs, job)
	}

	return jobs
}

// collectSystemdServices 收集Systemd服务
func (fac *FileAssetsCollector) collectSystemdServices() []protocol.SystemdService {
	var services []protocol.SystemdService

	// 使用 systemctl list-units
	output, err := fac.executor.Execute("systemctl", "list-units", "--type=service", "--all", "--no-pager")
	if err != nil {
		globalLogger.Debug("获取systemd服务失败: %v", err)
		return services
	}

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "UNIT") || strings.HasPrefix(line, "●") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		serviceName := fields[0]
		if !strings.HasSuffix(serviceName, ".service") {
			continue
		}

		state := ""
		if len(fields) > 2 {
			state = fields[2]
		}

		service := protocol.SystemdService{
			Name:    serviceName,
			State:   state,
			Enabled: strings.Contains(line, "enabled"),
		}

		services = append(services, service)

		// 限制数量
		if len(services) >= 100 {
			break
		}
	}

	return services
}

// collectStartupScripts 收集启动脚本
func (fac *FileAssetsCollector) collectStartupScripts() []protocol.StartupScript {
	var scripts []protocol.StartupScript

	// 收集 /etc/init.d/*
	initDFiles, _ := filepath.Glob("/etc/init.d/*")
	for _, file := range initDFiles {
		info, err := os.Stat(file)
		if err != nil || info.IsDir() {
			continue
		}

		// 检查是否可执行
		if info.Mode()&0111 != 0 {
			script := protocol.StartupScript{
				Type:    "init.d",
				Path:    file,
				Name:    filepath.Base(file),
				Enabled: true, // 简化,默认认为启用
			}
			scripts = append(scripts, script)
		}
	}

	// 收集 /etc/rc.local
	if info, err := os.Stat("/etc/rc.local"); err == nil && !info.IsDir() {
		script := protocol.StartupScript{
			Type:    "rc.local",
			Path:    "/etc/rc.local",
			Name:    "rc.local",
			Enabled: info.Mode()&0111 != 0,
		}
		scripts = append(scripts, script)
	}

	return scripts
}

// collectRecentModified 收集最近修改文件
func (fac *FileAssetsCollector) collectRecentModified() []protocol.FileInfo {
	var files []protocol.FileInfo

	// 搜索最近7天修改的文件
	searchDirs := []string{"/etc", "/bin", "/sbin", "/usr/bin", "/usr/sbin"}
	cutoffTime := time.Now().AddDate(0, 0, -7)

	for _, dir := range searchDirs {
		filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}

			// 跳过符号链接
			if info.Mode()&os.ModeSymlink != 0 {
				return nil
			}

			// 检查修改时间
			if info.ModTime().After(cutoffTime) {
				fileInfo := fac.convertToFileInfo(path, info)
				files = append(files, fileInfo)
			}

			// 限制数量
			if len(files) >= 50 {
				return filepath.SkipDir
			}

			return nil
		})

		if len(files) >= 50 {
			break
		}
	}

	return files
}

// collectLargeFiles 收集大文件
func (fac *FileAssetsCollector) collectLargeFiles() []protocol.FileInfo {
	var files []protocol.FileInfo

	// 搜索大于200MB的文件
	searchDirs := []string{"/tmp", "/var/tmp", "/home", "/root"}
	sizeThrreshold := int64(200 * 1024 * 1024) // 200MB

	for _, dir := range searchDirs {
		filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return nil
			}

			// 跳过符号链接
			if info.Mode()&os.ModeSymlink != 0 {
				return nil
			}

			// 检查文件大小
			if info.Size() > sizeThrreshold {
				fileInfo := fac.convertToFileInfo(path, info)
				files = append(files, fileInfo)
			}

			// 限制数量
			if len(files) >= 20 {
				return filepath.SkipDir
			}

			return nil
		})

		if len(files) >= 20 {
			break
		}
	}

	return files
}

// convertToFileInfo 转换为文件信息
func (fac *FileAssetsCollector) convertToFileInfo(path string, info os.FileInfo) protocol.FileInfo {
	fileInfo := protocol.FileInfo{
		Path:         path,
		Size:         info.Size(),
		ModTime:      info.ModTime().UnixMilli(),
		Permissions:  fmt.Sprintf("%o", info.Mode().Perm()),
		IsExecutable: info.Mode()&0111 != 0,
	}

	// 获取所有者和组 (平台特定实现)
	fac.fillFileOwnership(&fileInfo, info)

	return fileInfo
}

// calculateStatistics 计算统计信息
func (fac *FileAssetsCollector) calculateStatistics(assets *protocol.FileAssets) *protocol.FileStatistics {
	stats := &protocol.FileStatistics{
		CronJobsCount:        len(assets.CronJobs),
		SystemdServicesCount: len(assets.SystemdServices),
		RecentFilesCount:     len(assets.RecentModified),
		LargeFilesCount:      len(assets.LargeFiles),
	}

	// 统计活跃服务
	for _, service := range assets.SystemdServices {
		if service.State == "running" || service.State == "active" {
			stats.ActiveServicesCount++
		}
	}

	return stats
}
