package collector

import (
	"context"
	"runtime"
	"strings"
	"unicode/utf8"

	"github.com/dushixiang/pika/internal/protocol"
	"github.com/shirou/gopsutil/v4/sensors"
)

// TemperatureCollector 温度监控采集器
type TemperatureCollector struct{}

// NewTemperatureCollector 创建温度采集器
func NewTemperatureCollector() *TemperatureCollector {
	return &TemperatureCollector{}
}

// Collect 采集温度数据（某些系统可能不支持）
func (t *TemperatureCollector) Collect() ([]*protocol.TemperatureData, error) {
	// 使用 gopsutil 的 sensors 包采集温度数据
	temps, err := sensors.TemperaturesWithContext(context.Background())
	if err != nil {
		// 如果获取失败，返回空数组（某些系统可能不支持）
		return []*protocol.TemperatureData{}, nil
	}

	// 按类型聚合温度数据（同类型取最大值）
	typeMaxTemp := make(map[string]*protocol.TemperatureData)

	for _, temp := range temps {
		// 跳过温度值为 0 的传感器（可能是未激活或不支持的传感器）
		if temp.Temperature == 0 {
			continue
		}
		// https://github.com/shirou/gopsutil/issues/1832
		if runtime.GOOS == "darwin" && !utf8.ValidString(temp.SensorKey) {
			continue
		}

		// 识别传感器类型
		sensorType := guessSensorType(temp.SensorKey)
		if sensorType == "OTHER" {
			continue
		}

		// 对于同一类型的传感器，取温度最大值
		if existing, ok := typeMaxTemp[sensorType]; !ok || temp.Temperature > existing.Temperature {
			typeMaxTemp[sensorType] = &protocol.TemperatureData{
				SensorKey:   temp.SensorKey,
				Temperature: temp.Temperature,
				Type:        sensorType,
			}
		}
	}

	// 将聚合后的数据转换为列表
	var tempDataList []*protocol.TemperatureData
	for _, tempData := range typeMaxTemp {
		tempDataList = append(tempDataList, tempData)
	}

	return tempDataList, nil
}

// guessSensorType 根据操作系统和传感器名称推断类型
func guessSensorType(key string) string {
	keyLower := strings.ToLower(key)

	// ---------------- Linux 常见规则 ----------------
	if runtime.GOOS == "linux" {
		// CPU 温度传感器
		if strings.Contains(keyLower, "coretemp") || // Intel Core 系列
			strings.Contains(keyLower, "k10temp") || // AMD Ryzen/EPYC
			strings.Contains(keyLower, "zenpower") || // AMD Zen 架构
			strings.Contains(keyLower, "cpu_thermal") || // 通用 CPU 热传感器
			strings.Contains(keyLower, "soc_thermal") || // ARM SoC
			strings.Contains(keyLower, "tctl") || // AMD Tctl (控制温度)
			strings.Contains(keyLower, "tdie") || // AMD Tdie (芯片温度)
			strings.Contains(keyLower, "package id") || // Intel 封装温度
			strings.Contains(keyLower, "core ") || // CPU 核心温度
			strings.Contains(keyLower, "scpi_sensors") || // ARM SCPI 温度传感器
			strings.Contains(keyLower, "aml_thermal") { // Amlogic SoC 温度
			return "CPU"
		}

		// GPU 温度传感器
		if strings.Contains(keyLower, "amdgpu") || // AMD GPU
			strings.Contains(keyLower, "radeon") || // AMD Radeon
			strings.Contains(keyLower, "nvidia") || // NVIDIA GPU
			strings.Contains(keyLower, "nouveau") || // NVIDIA 开源驱动
			strings.Contains(keyLower, "gpu") { // 通用 GPU
			return "GPU"
		}

		// 硬盘/SSD 温度传感器
		if strings.Contains(keyLower, "nvme") || // NVMe SSD
			strings.Contains(keyLower, "drivetemp") || // 硬盘温度
			strings.Contains(keyLower, "sata") || // SATA 设备
			strings.Contains(keyLower, "scsi") || // SCSI 设备
			strings.Contains(keyLower, "composite") { // NVMe Composite 温度
			return "DISK"
		}

		// 主板芯片组温度
		if strings.Contains(keyLower, "pch") || // Platform Controller Hub
			strings.Contains(keyLower, "chipset") {
			return "CHIPSET"
		}

		// ACPI 温度区域 (通常是主板/系统温度)
		if strings.Contains(keyLower, "acpitz") || // ACPI Thermal Zone
			strings.Contains(keyLower, "thermal_zone") {
			return "SYSTEM"
		}

		// 电源温度
		if strings.Contains(keyLower, "psu") ||
			strings.Contains(keyLower, "power supply") {
			return "PSU"
		}
	}

	// ---------------- macOS 常见规则 ----------------
	if runtime.GOOS == "darwin" {
		// 电池温度传感器
		if strings.Contains(keyLower, "battery") || strings.Contains(keyLower, "gas gauge") {
			return "BATTERY"
		}

		// 存储设备温度传感器
		if strings.Contains(keyLower, "nand") || strings.Contains(keyLower, "disk") {
			return "DISK"
		}

		// GPU 温度传感器
		if strings.Contains(keyLower, "gpu") {
			return "GPU"
		}

		// PMU tdie* 系列是 CPU 核心温度 (die temperature)
		// PMU tdev* 系列是设备/外围温度 (device temperature)
		// PMU tcal 是校准温度
		if strings.HasPrefix(keyLower, "pmu") {
			if strings.Contains(keyLower, "tdie") {
				return "CPU"
			}
			// tdev 和 tcal 等其他 PMU 传感器归类为 OTHER
			return "OTHER"
		}

		// 其他包含 die 的可能是 CPU
		if strings.Contains(keyLower, "die") || strings.Contains(keyLower, "cpu") {
			return "CPU"
		}
	}

	return "OTHER"
}
