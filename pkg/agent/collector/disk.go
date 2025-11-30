package collector

import (
	"runtime"
	"strings"

	"github.com/dushixiang/pika/internal/protocol"
	"github.com/shirou/gopsutil/v4/disk"
)

// DiskCollector 磁盘监控采集器
type DiskCollector struct {
}

// NewDiskCollector 创建磁盘采集器
func NewDiskCollector() *DiskCollector {
	return &DiskCollector{}
}

// shouldIgnorePartition 判断是否应该忽略该分区
func shouldIgnorePartition(partition disk.PartitionStat) bool {
	// 在 macOS 上过滤掉特殊文件系统
	if runtime.GOOS == "darwin" {
		// 忽略 devfs、com.apple.TimeMachine 等虚拟文件系统
		ignoredFsTypes := []string{
			"devfs",             // 设备文件系统
			"autofs",            // 自动挂载文件系统
			"mtmfs",             // Mobile Time Machine
			"com.apple.osxfuse", // FUSE 文件系统
		}

		for _, ignoredType := range ignoredFsTypes {
			if partition.Fstype == ignoredType {
				return true
			}
		}

		// 忽略特定的挂载点
		ignoredMountPoints := []string{
			"/dev",
			"/System/Volumes/VM",         // 虚拟内存
			"/System/Volumes/Preboot",    // Preboot 分区
			"/System/Volumes/Update",     // 更新分区
			"/System/Volumes/Hardware",   // 硬件分区
			"/System/Volumes/xarts",      // xART 分区
			"/System/Volumes/iSCPreboot", // iSC Preboot
			"/System/Volumes/Data",       // 这是系统数据卷，通常会和主卷重复计数
			"/private/var/vm",            // 虚拟内存
		}

		for _, ignoredMount := range ignoredMountPoints {
			if strings.HasPrefix(partition.Mountpoint, ignoredMount) {
				return true
			}
		}
	}

	// 在 Linux 上过滤掉特殊文件系统
	if runtime.GOOS == "linux" {
		ignoredFsTypes := []string{
			"tmpfs",
			"devtmpfs",
			"devfs",
			"proc",
			"sysfs",
			"cgroup",
			"cgroup2",
			"nsfs",
			"overlay",
			"squashfs",
			"iso9660",
		}

		for _, ignoredType := range ignoredFsTypes {
			if partition.Fstype == ignoredType {
				return true
			}
		}
	}

	// 在 Windows 上过滤掉 CD-ROM 和特殊文件系统
	if runtime.GOOS == "windows" {
		// 过滤 CD-ROM 文件系统类型
		ignoredFsTypes := []string{
			"",        // 空驱动器(如未插入光盘的光驱)
			"UDF",     // 通用光盘格式
			"CDFS",    // CD-ROM 文件系统
			"iso9660", // ISO 9660 光盘格式
		}

		for _, ignoredType := range ignoredFsTypes {
			if strings.EqualFold(partition.Fstype, ignoredType) {
				return true
			}
		}

		// 检查是否为 CD-ROM 驱动器(通过挂载选项)
		for _, opt := range partition.Opts {
			optLower := strings.ToLower(opt)
			if strings.Contains(optLower, "cdrom") || strings.Contains(optLower, "readonly") {
				// CD-ROM 通常是只读的,但也要排除其他只读设备的误判
				if partition.Fstype == "" || partition.Fstype == "CDFS" || partition.Fstype == "UDF" {
					return true
				}
			}
		}
	}

	// 其他系统:过滤掉只读的 CD-ROM 等
	for _, opt := range partition.Opts {
		if strings.Contains(strings.ToLower(opt), "cdrom") {
			return true
		}
	}

	return false
}

// Collect 采集磁盘数据(合并静态和动态数据)
func (d *DiskCollector) Collect() ([]protocol.DiskData, error) {
	partitions, err := disk.Partitions(false)
	if err != nil {
		return nil, err
	}
	var diskDataList []protocol.DiskData
	for _, partition := range partitions {
		// 跳过应该忽略的分区
		if shouldIgnorePartition(partition) {
			continue
		}

		// 获取动态使用情况
		usage, err := disk.Usage(partition.Mountpoint)
		if err != nil {
			continue // 跳过无法访问的分区
		}

		// 跳过容量为 0 的分区（可能是虚拟文件系统）
		if usage.Total == 0 {
			continue
		}

		diskData := protocol.DiskData{
			MountPoint:   partition.Mountpoint,
			Device:       partition.Device,
			Fstype:       partition.Fstype,
			Total:        usage.Total,
			Used:         usage.Used,
			Free:         usage.Free,
			UsagePercent: usage.UsedPercent,
		}

		diskDataList = append(diskDataList, diskData)
	}

	return diskDataList, nil
}
