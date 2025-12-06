package collector

import (
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/pkg/agent/config"
	"github.com/shirou/gopsutil/v4/disk"
)

// DiskCollector 磁盘监控采集器
type DiskCollector struct {
	config *config.Config
}

// NewDiskCollector 创建磁盘采集器
func NewDiskCollector(cfg *config.Config) *DiskCollector {
	return &DiskCollector{
		config: cfg,
	}
}

// Collect 采集磁盘数据
// 只采集配置的 DiskInclude 白名单中的挂载点
func (d *DiskCollector) Collect() ([]protocol.DiskData, error) {
	partitions, err := disk.Partitions(false)
	if err != nil {
		return nil, err
	}

	var diskDataList []protocol.DiskData
	for _, partition := range partitions {
		// 检查是否在白名单中
		if !d.config.ShouldIncludeDiskMountPoint(partition.Mountpoint) {
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
