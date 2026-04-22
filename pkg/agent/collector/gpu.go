package collector

import (
	"context"
	"encoding/csv"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/dushixiang/pika/internal/protocol"
)

const nvidiaSmiTimeout = 15 * time.Second

// gpuStaticInfo GPU 静态信息
type gpuStaticInfo struct {
	Index       int
	Name        string
	UUID        string
	MemoryTotal uint64
}

// GPUCollector GPU 监控采集器
type GPUCollector struct {
	staticData     map[int]*gpuStaticInfo // key: gpu index
	staticInitOnce sync.Once
	mu             sync.RWMutex
}

// NewGPUCollector 创建 GPU 采集器
func NewGPUCollector() *GPUCollector {
	return &GPUCollector{
		staticData: make(map[int]*gpuStaticInfo),
	}
}

// initStatic 初始化静态数据(只执行一次)
func (g *GPUCollector) initStatic() {
	g.staticInitOnce.Do(func() {
		// 检查 nvidia-smi 是否可用
		_, err := exec.LookPath("nvidia-smi")
		if err != nil {
			return
		}

		// 查询静态信息: index, name, uuid, memory.total
		ctx, cancel := context.WithTimeout(context.Background(), nvidiaSmiTimeout)
		defer cancel()
		cmd := exec.CommandContext(ctx, "nvidia-smi",
			"--query-gpu=index,name,uuid,memory.total",
			"--format=csv,noheader,nounits")

		output, err := cmd.Output()
		if err != nil {
			return
		}

		// 解析 CSV 输出
		reader := csv.NewReader(strings.NewReader(string(output)))
		reader.TrimLeadingSpace = true
		records, err := reader.ReadAll()
		if err != nil {
			return
		}

		g.mu.Lock()
		defer g.mu.Unlock()

		for _, record := range records {
			if len(record) < 4 {
				continue
			}

			index, _ := strconv.Atoi(record[0])
			memoryTotal, _ := strconv.ParseUint(record[3], 10, 64)

			g.staticData[index] = &gpuStaticInfo{
				Index:       index,
				Name:        strings.TrimSpace(record[1]),
				UUID:        strings.TrimSpace(record[2]),
				MemoryTotal: memoryTotal * 1024 * 1024, // 转换为字节
			}
		}
	})
}

// Collect 采集 GPU 数据(合并静态和动态数据)
func (g *GPUCollector) Collect() ([]*protocol.GPUData, error) {
	g.initStatic()

	// 如果没有检测到 GPU,返回空数组
	g.mu.RLock()
	if len(g.staticData) == 0 {
		g.mu.RUnlock()
		return []*protocol.GPUData{}, nil
	}
	g.mu.RUnlock()

	// 采集动态数据
	dynamicData, err := g.collectDynamic()
	if err != nil {
		return []*protocol.GPUData{}, nil
	}

	return dynamicData, nil
}

// collectDynamic 采集 GPU 动态数据
func (g *GPUCollector) collectDynamic() ([]*protocol.GPUData, error) {
	// 使用 nvidia-smi 查询动态数据
	// 输出格式: index, temperature.gpu, utilization.gpu, memory.used, memory.free, power.draw, fan.speed
	ctx, cancel := context.WithTimeout(context.Background(), nvidiaSmiTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "nvidia-smi",
		"--query-gpu=index,temperature.gpu,utilization.gpu,memory.used,memory.free,power.draw,fan.speed",
		"--format=csv,noheader,nounits")

	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	// 解析 CSV 输出
	reader := csv.NewReader(strings.NewReader(string(output)))
	reader.TrimLeadingSpace = true
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}

	g.mu.RLock()
	defer g.mu.RUnlock()

	var gpuDataList []*protocol.GPUData
	for _, record := range records {
		if len(record) < 7 {
			continue
		}

		index, _ := strconv.Atoi(record[0])
		temperature, _ := strconv.ParseFloat(record[1], 64)
		utilization, _ := strconv.ParseFloat(record[2], 64)
		memoryUsed, _ := strconv.ParseUint(record[3], 10, 64)
		memoryFree, _ := strconv.ParseUint(record[4], 10, 64)
		powerUsage, _ := strconv.ParseFloat(record[5], 64)
		fanSpeed, _ := strconv.ParseFloat(record[6], 64)

		// 获取静态信息
		staticInfo := g.staticData[index]
		if staticInfo == nil {
			continue
		}

		gpuData := &protocol.GPUData{
			Index:       staticInfo.Index,
			Name:        staticInfo.Name,
			UUID:        staticInfo.UUID,
			MemoryTotal: staticInfo.MemoryTotal,
			Temperature: temperature,
			Utilization: utilization,
			MemoryUsed:  memoryUsed * 1024 * 1024, // 转换为字节
			MemoryFree:  memoryFree * 1024 * 1024, // 转换为字节
			PowerUsage:  powerUsage,
			FanSpeed:    fanSpeed,
		}

		gpuDataList = append(gpuDataList, gpuData)
	}

	return gpuDataList, nil
}
