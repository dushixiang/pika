package repo

import (
	"context"
	"database/sql"

	"github.com/dushixiang/pika/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type MetricRepo struct {
	db *gorm.DB
}

func NewMetricRepo(db *gorm.DB) *MetricRepo {
	return &MetricRepo{
		db: db,
	}
}

// SaveCPUMetric 保存CPU指标
func (r *MetricRepo) SaveCPUMetric(ctx context.Context, metric *models.CPUMetric) error {
	return r.db.WithContext(ctx).Create(metric).Error
}

// SaveMemoryMetric 保存内存指标
func (r *MetricRepo) SaveMemoryMetric(ctx context.Context, metric *models.MemoryMetric) error {
	return r.db.WithContext(ctx).Create(metric).Error
}

// SaveDiskMetric 保存磁盘指标
func (r *MetricRepo) SaveDiskMetric(ctx context.Context, metric *models.DiskMetric) error {
	return r.db.WithContext(ctx).Create(metric).Error
}

// SaveNetworkMetric 保存网络指标
func (r *MetricRepo) SaveNetworkMetric(ctx context.Context, metric *models.NetworkMetric) error {
	return r.db.WithContext(ctx).Create(metric).Error
}

// SaveDiskIOMetric 保存磁盘IO指标
func (r *MetricRepo) SaveDiskIOMetric(ctx context.Context, metric *models.DiskIOMetric) error {
	return r.db.WithContext(ctx).Create(metric).Error
}

// SaveGPUMetric 保存GPU指标
func (r *MetricRepo) SaveGPUMetric(ctx context.Context, metric *models.GPUMetric) error {
	return r.db.WithContext(ctx).Create(metric).Error
}

// SaveTemperatureMetric 保存温度指标
func (r *MetricRepo) SaveTemperatureMetric(ctx context.Context, metric *models.TemperatureMetric) error {
	return r.db.WithContext(ctx).Create(metric).Error
}

// GetLatestGPUMetrics 获取最新的GPU指标列表
func (r *MetricRepo) GetLatestGPUMetrics(ctx context.Context, agentID string) ([]models.GPUMetric, error) {
	var metrics []models.GPUMetric
	// 获取每个GPU的最新记录
	err := r.db.WithContext(ctx).
		Raw(`
			SELECT g1.* FROM gpu_metrics g1
			INNER JOIN (
				SELECT index, MAX(timestamp) as max_timestamp
				FROM gpu_metrics
				WHERE agent_id = ?
				GROUP BY index
			) g2 ON g1.index = g2.index AND g1.timestamp = g2.max_timestamp
			WHERE g1.agent_id = ?
			ORDER BY g1.index
		`, agentID, agentID).
		Scan(&metrics).Error
	return metrics, err
}

// GetLatestTemperatureMetrics 获取最新的温度指标列表
func (r *MetricRepo) GetLatestTemperatureMetrics(ctx context.Context, agentID string) ([]models.TemperatureMetric, error) {
	var metrics []models.TemperatureMetric
	// 获取每个传感器的最新记录
	err := r.db.WithContext(ctx).
		Raw(`
			SELECT t1.* FROM temperature_metrics t1
			INNER JOIN (
				SELECT sensor_key, MAX(timestamp) as max_timestamp
				FROM temperature_metrics
				WHERE agent_id = ?
				GROUP BY sensor_key
			) t2 ON t1.sensor_key = t2.sensor_key AND t1.timestamp = t2.max_timestamp
			WHERE t1.agent_id = ?
			ORDER BY t1.sensor_key
		`, agentID, agentID).
		Scan(&metrics).Error
	return metrics, err
}

// SaveHostMetric 保存主机信息指标（按 agent 覆盖，避免先删后插的空窗）
func (r *MetricRepo) SaveHostMetric(ctx context.Context, metric *models.HostMetric) error {
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "agent_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"os", "platform", "platform_version", "kernel_version", "kernel_arch", "uptime", "boot_time", "procs", "timestamp"}),
		}).
		Create(metric).Error
}

// GetLatestHostMetric 获取最新的主机信息
func (r *MetricRepo) GetLatestHostMetric(ctx context.Context, agentID string) (*models.HostMetric, error) {
	var metric models.HostMetric
	err := r.db.WithContext(ctx).
		Where("agent_id = ?", agentID).
		Order("timestamp DESC").
		First(&metric).Error
	if err != nil {
		return nil, err
	}
	return &metric, nil
}

// SaveNetworkConnectionMetric 保存网络连接统计指标
func (r *MetricRepo) SaveNetworkConnectionMetric(ctx context.Context, metric *models.NetworkConnectionMetric) error {
	return r.db.WithContext(ctx).Create(metric).Error
}

// GetLatestNetworkConnectionMetric 获取最新的网络连接统计
func (r *MetricRepo) GetLatestNetworkConnectionMetric(ctx context.Context, agentID string) (*models.NetworkConnectionMetric, error) {
	var metric models.NetworkConnectionMetric
	err := r.db.WithContext(ctx).
		Where("agent_id = ?", agentID).
		Order("timestamp DESC").
		First(&metric).Error
	if err != nil {
		return nil, err
	}
	return &metric, nil
}

// AggregatedNetworkConnectionMetric 网络连接统计聚合指标
type AggregatedNetworkConnectionMetric struct {
	Timestamp      int64  `json:"timestamp"`
	MaxEstablished uint32 `json:"maxEstablished"` // 最大已建立连接数
	MaxSynSent     uint32 `json:"maxSynSent"`     // 最大 SYN_SENT 连接数
	MaxSynRecv     uint32 `json:"maxSynRecv"`     // 最大 SYN_RECV 连接数
	MaxFinWait1    uint32 `json:"maxFinWait1"`    // 最大 FIN_WAIT1 连接数
	MaxFinWait2    uint32 `json:"maxFinWait2"`    // 最大 FIN_WAIT2 连接数
	MaxTimeWait    uint32 `json:"maxTimeWait"`    // 最大 TIME_WAIT 连接数
	MaxClose       uint32 `json:"maxClose"`       // 最大 CLOSE 连接数
	MaxCloseWait   uint32 `json:"maxCloseWait"`   // 最大 CLOSE_WAIT 连接数
	MaxLastAck     uint32 `json:"maxLastAck"`     // 最大 LAST_ACK 连接数
	MaxListen      uint32 `json:"maxListen"`      // 最大 LISTEN 连接数
	MaxClosing     uint32 `json:"maxClosing"`     // 最大 CLOSING 连接数
	MaxTotal       uint32 `json:"maxTotal"`       // 最大总连接数
}

// GetNetworkConnectionMetrics 获取聚合后的网络连接统计指标
func (r *MetricRepo) GetNetworkConnectionMetrics(ctx context.Context, agentID string, start, end int64, interval int) ([]AggregatedNetworkConnectionMetric, error) {
	var metrics []AggregatedNetworkConnectionMetric

	query := `
		SELECT
			CAST(FLOOR(timestamp / ?) * ? AS BIGINT) as timestamp,
			MAX(established) as max_established,
			MAX(syn_sent) as max_syn_sent,
			MAX(syn_recv) as max_syn_recv,
			MAX(fin_wait1) as max_fin_wait1,
			MAX(fin_wait2) as max_fin_wait2,
			MAX(time_wait) as max_time_wait,
			MAX(close) as max_close,
			MAX(close_wait) as max_close_wait,
			MAX(last_ack) as max_last_ack,
			MAX(listen) as max_listen,
			MAX(closing) as max_closing,
			MAX(total) as max_total
		FROM network_connection_metrics
		WHERE agent_id = ? AND timestamp >= ? AND timestamp <= ?
		GROUP BY 1
		ORDER BY timestamp ASC
	`

	intervalMs := int64(interval * 1000)
	err := r.db.WithContext(ctx).
		Raw(query, intervalMs, intervalMs, agentID, start, end).
		Scan(&metrics).Error

	return metrics, err
}

// DeleteOldMetrics 删除指定时间之前的所有指标数据
func (r *MetricRepo) DeleteOldMetrics(ctx context.Context, beforeTimestamp int64) error {
	// 批量大小
	batchSize := 1000

	// 定义要清理的表（Host 信息只保留最新的，不需要清理）
	tables := []interface{}{
		&models.CPUMetric{},
		&models.MemoryMetric{},
		&models.DiskMetric{},
		&models.NetworkMetric{},
		&models.NetworkConnectionMetric{},
		&models.DiskIOMetric{},
		&models.GPUMetric{},
		&models.TemperatureMetric{},
		&models.MonitorMetric{},
	}

	// 对每个表进行分批删除
	for _, table := range tables {
		for {
			// 分批删除，避免长事务
			result := r.db.WithContext(ctx).
				Where("timestamp < ?", beforeTimestamp).
				Limit(batchSize).
				Delete(table)

			if result.Error != nil {
				return result.Error
			}

			// 如果删除的行数少于批量大小，说明已经删除完毕
			if result.RowsAffected < int64(batchSize) {
				break
			}
		}
	}

	return nil
}

// AggregatedCPUMetric CPU聚合指标（使用最大值）
type AggregatedCPUMetric struct {
	Timestamp    int64   `json:"timestamp"`
	MaxUsage     float64 `json:"maxUsage"`
	LogicalCores int     `json:"logicalCores"`
}

// GetCPUMetrics 获取聚合后的CPU指标（取最大值）
// interval: 聚合间隔，单位秒（如：60表示1分钟）
func (r *MetricRepo) GetCPUMetrics(ctx context.Context, agentID string, start, end int64, interval int) ([]AggregatedCPUMetric, error) {
	var metrics []AggregatedCPUMetric

	query := `
		SELECT
			CAST(FLOOR(timestamp / ?) * ? AS BIGINT) as timestamp,
			MAX(usage_percent) as max_usage,
			MAX(logical_cores) as logical_cores
		FROM cpu_metrics
		WHERE agent_id = ? AND timestamp >= ? AND timestamp <= ?
		GROUP BY 1
		ORDER BY timestamp ASC
	`

	intervalMs := int64(interval * 1000)
	err := r.db.WithContext(ctx).
		Raw(query, intervalMs, intervalMs, agentID, start, end).
		Scan(&metrics).Error

	return metrics, err
}

// AggregatedMemoryMetric 内存聚合指标（使用最大值）
type AggregatedMemoryMetric struct {
	Timestamp int64   `json:"timestamp"`
	MaxUsage  float64 `json:"maxUsage"`
	Total     uint64  `json:"total"`
}

// GetMemoryMetrics 获取聚合后的内存指标（取最大值）
func (r *MetricRepo) GetMemoryMetrics(ctx context.Context, agentID string, start, end int64, interval int) ([]AggregatedMemoryMetric, error) {
	var metrics []AggregatedMemoryMetric

	query := `
		SELECT
			CAST(FLOOR(timestamp / ?) * ? AS BIGINT) as timestamp,
			MAX(usage_percent) as max_usage,
			MAX(total) as total
		FROM memory_metrics
		WHERE agent_id = ? AND timestamp >= ? AND timestamp <= ?
		GROUP BY 1
		ORDER BY timestamp ASC
	`

	intervalMs := int64(interval * 1000)
	err := r.db.WithContext(ctx).
		Raw(query, intervalMs, intervalMs, agentID, start, end).
		Scan(&metrics).Error

	return metrics, err
}

// AggregatedDiskMetric 磁盘聚合指标（使用最大值）
type AggregatedDiskMetric struct {
	Timestamp  int64   `json:"timestamp"`
	MountPoint string  `json:"mountPoint"`
	MaxUsage   float64 `json:"maxUsage"`
	Total      uint64  `json:"total"`
}

// GetDiskMetrics 获取聚合后的磁盘指标（始终返回聚合数据）
func (r *MetricRepo) GetDiskMetrics(ctx context.Context, agentID string, start, end int64, interval int) ([]AggregatedDiskMetric, error) {
	var metrics []AggregatedDiskMetric

	query := `
		SELECT
			CAST(FLOOR(timestamp / ?) * ? AS BIGINT) as timestamp,
			mount_point,
			MAX(usage_percent) as max_usage,
			MAX(total) as total
		FROM disk_metrics
		WHERE agent_id = ? AND timestamp >= ? AND timestamp <= ?
		GROUP BY 1, mount_point
		ORDER BY timestamp ASC, mount_point
	`

	intervalMs := int64(interval * 1000)
	err := r.db.WithContext(ctx).
		Raw(query, intervalMs, intervalMs, agentID, start, end).
		Scan(&metrics).Error

	return metrics, err
}

// AggregatedNetworkMetric 网络聚合指标（按网卡分组）
type AggregatedNetworkMetric struct {
	Timestamp   int64   `json:"timestamp"`
	Interface   string  `json:"interface"`
	MaxSentRate float64 `json:"maxSentRate"`
	MaxRecvRate float64 `json:"maxRecvRate"`
}

// AggregatedNetworkMetricByInterface 按网卡接口分组的网络聚合指标
type AggregatedNetworkMetricByInterface struct {
	Timestamp   int64   `json:"timestamp"`
	Interface   string  `json:"interface"`
	MaxSentRate float64 `json:"maxSentRate"`
	MaxRecvRate float64 `json:"maxRecvRate"`
}

// GetNetworkMetrics 获取聚合后的网络指标（按网卡接口分组）
func (r *MetricRepo) GetNetworkMetrics(ctx context.Context, agentID string, start, end int64, interval int) ([]AggregatedNetworkMetric, error) {
	var metrics []AggregatedNetworkMetric

	query := `
		SELECT
			CAST(FLOOR(timestamp / ?) * ? AS BIGINT) as timestamp,
			interface,
			MAX(bytes_sent_rate) as max_sent_rate,
			MAX(bytes_recv_rate) as max_recv_rate
		FROM network_metrics
		WHERE agent_id = ? AND timestamp >= ? AND timestamp <= ?
		GROUP BY 1, interface
		ORDER BY timestamp ASC, interface ASC
	`

	intervalMs := int64(interval * 1000)
	err := r.db.WithContext(ctx).
		Raw(query, intervalMs, intervalMs, agentID, start, end).
		Scan(&metrics).Error

	return metrics, err
}

// GetLatestCPUMetric 获取最新的CPU指标
func (r *MetricRepo) GetLatestCPUMetric(ctx context.Context, agentID string) (*models.CPUMetric, error) {
	var metric models.CPUMetric
	err := r.db.WithContext(ctx).
		Where("agent_id = ?", agentID).
		Order("timestamp DESC").
		First(&metric).Error
	if err != nil {
		return nil, err
	}
	return &metric, nil
}

// GetLatestMemoryMetric 获取最新的内存指标
func (r *MetricRepo) GetLatestMemoryMetric(ctx context.Context, agentID string) (*models.MemoryMetric, error) {
	var metric models.MemoryMetric
	err := r.db.WithContext(ctx).
		Where("agent_id = ?", agentID).
		Order("timestamp DESC").
		First(&metric).Error
	if err != nil {
		return nil, err
	}
	return &metric, nil
}

// GetLatestDiskMetrics 获取最新的磁盘指标（所有挂载点）
func (r *MetricRepo) GetLatestDiskMetrics(ctx context.Context, agentID string) ([]models.DiskMetric, error) {
	// 先获取最新时间戳
	var latestTimestamp sql.NullInt64
	err := r.db.WithContext(ctx).
		Model(&models.DiskMetric{}).
		Where("agent_id = ?", agentID).
		Select("MAX(timestamp)").
		Scan(&latestTimestamp).Error

	if err != nil {
		return nil, err
	}

	if !latestTimestamp.Valid {
		return []models.DiskMetric{}, nil
	}

	// 获取该时间戳的所有磁盘数据
	var metrics []models.DiskMetric
	err = r.db.WithContext(ctx).
		Where("agent_id = ? AND timestamp = ?", agentID, latestTimestamp.Int64).
		Find(&metrics).Error

	return metrics, err
}

// GetLatestNetworkMetrics 获取最新的网络指标（所有网卡）
func (r *MetricRepo) GetLatestNetworkMetrics(ctx context.Context, agentID string) ([]models.NetworkMetric, error) {
	// 先获取最新时间戳
	var latestTimestamp sql.NullInt64
	err := r.db.WithContext(ctx).
		Model(&models.NetworkMetric{}).
		Where("agent_id = ?", agentID).
		Select("MAX(timestamp)").
		Scan(&latestTimestamp).Error

	if err != nil {
		return nil, err
	}

	if !latestTimestamp.Valid {
		return []models.NetworkMetric{}, nil
	}

	// 获取该时间戳的所有网络数据
	var metrics []models.NetworkMetric
	err = r.db.WithContext(ctx).
		Where("agent_id = ? AND timestamp = ?", agentID, latestTimestamp.Int64).
		Find(&metrics).Error

	return metrics, err
}

// SaveMonitorMetric 保存监控指标
func (r *MetricRepo) SaveMonitorMetric(ctx context.Context, metric *models.MonitorMetric) error {
	return r.db.WithContext(ctx).Create(metric).Error
}

// GetMonitorMetrics 获取监控指标列表
func (r *MetricRepo) GetMonitorMetrics(ctx context.Context, agentID, monitorID string, start, end int64) ([]models.MonitorMetric, error) {
	var metrics []models.MonitorMetric
	query := r.db.WithContext(ctx).
		Where("agent_id = ? AND timestamp >= ? AND timestamp <= ?", agentID, start, end)

	// 如果指定了监控项ID，则只查询该监控项
	if monitorID != "" {
		query = query.Where("monitor_id = ?", monitorID)
	}

	err := query.Order("timestamp ASC").Find(&metrics).Error
	return metrics, err
}

// GetLatestMonitorMetrics 获取最新的监控指标（每个监控项的最新一条）
func (r *MetricRepo) GetLatestMonitorMetrics(ctx context.Context, agentID string) ([]models.MonitorMetric, error) {
	var metrics []models.MonitorMetric
	err := r.db.WithContext(ctx).Raw(`
		SELECT m.*
		FROM monitor_metrics m
		INNER JOIN (
			SELECT monitor_id, MAX(timestamp) AS ts
			FROM monitor_metrics
			WHERE agent_id = ?
			GROUP BY monitor_id
		) latest ON m.monitor_id = latest.monitor_id AND m.timestamp = latest.ts
		WHERE m.agent_id = ?
		ORDER BY m.monitor_id
	`, agentID, agentID).Scan(&metrics).Error
	return metrics, err
}

// GetMonitorMetricsByName 获取指定监控项的历史数据
func (r *MetricRepo) GetMonitorMetricsByName(ctx context.Context, agentID, monitorID string, start, end int64, limit int) ([]models.MonitorMetric, error) {
	var metrics []models.MonitorMetric
	query := r.db.WithContext(ctx).
		Where("agent_id = ? AND monitor_id = ? AND timestamp >= ? AND timestamp <= ?", agentID, monitorID, start, end).
		Order("timestamp DESC")

	if limit > 0 {
		query = query.Limit(limit)
	}

	err := query.Find(&metrics).Error
	return metrics, err
}

// AggregatedMonitorMetric 聚合的监控指标
type AggregatedMonitorMetric struct {
	Timestamp    int64   `json:"timestamp"`
	AgentID      string  `json:"agentId"`
	AvgResponse  float64 `json:"avgResponse"`  // 平均响应时间
	MaxResponse  int64   `json:"maxResponse"`  // 最大响应时间
	MinResponse  int64   `json:"minResponse"`  // 最小响应时间
	SuccessCount int64   `json:"successCount"` // 成功次数
	TotalCount   int64   `json:"totalCount"`   // 总次数
	SuccessRate  float64 `json:"successRate"`  // 成功率
	LastStatus   string  `json:"lastStatus"`   // 最后状态
	LastErrorMsg string  `json:"lastErrorMsg"` // 最后错误信息
}

// GetAggregatedMonitorMetrics 获取聚合后的监控指标（按探针和时间间隔聚合）
func (r *MetricRepo) GetAggregatedMonitorMetrics(ctx context.Context, monitorID string, start, end int64, interval int) ([]AggregatedMonitorMetric, error) {
	var metrics []AggregatedMonitorMetric

	query := `
		WITH ranked_metrics AS (
			SELECT
				agent_id,
				CAST(FLOOR(timestamp / ?) * ? AS BIGINT) as time_bucket,
				response_time,
				status,
				error,
				timestamp,
				ROW_NUMBER() OVER (PARTITION BY agent_id, CAST(FLOOR(timestamp / ?) * ? AS BIGINT) ORDER BY timestamp DESC) as rn
			FROM monitor_metrics
			WHERE monitor_id = ? AND timestamp >= ? AND timestamp <= ?
		)
		SELECT
			time_bucket as timestamp,
			agent_id,
			AVG(response_time) as avg_response,
			MAX(response_time) as max_response,
			MIN(response_time) as min_response,
			SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) as success_count,
			COUNT(*) as total_count,
			CAST(SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS REAL) / CAST(COUNT(*) AS REAL) * 100 as success_rate,
			MAX(CASE WHEN rn = 1 THEN status END) as last_status,
			MAX(CASE WHEN rn = 1 THEN error END) as last_error_msg
		FROM ranked_metrics
		GROUP BY time_bucket, agent_id
		ORDER BY timestamp ASC, agent_id
	`

	intervalMs := int64(interval * 1000)
	err := r.db.WithContext(ctx).
		Raw(query, intervalMs, intervalMs, intervalMs, intervalMs, monitorID, start, end).
		Scan(&metrics).Error

	return metrics, err
}

// AggregatedDiskIOMetric 磁盘IO聚合指标
type AggregatedDiskIOMetric struct {
	Timestamp         int64   `json:"timestamp"`
	Device            string  `json:"device"`
	MaxReadRate       float64 `json:"maxReadRate"`       // 最大读取速率(字节/秒)
	MaxWriteRate      float64 `json:"maxWriteRate"`      // 最大写入速率(字节/秒)
	TotalReadBytes    uint64  `json:"totalReadBytes"`    // 总读取字节数
	TotalWriteBytes   uint64  `json:"totalWriteBytes"`   // 总写入字节数
	MaxIopsInProgress uint64  `json:"maxIopsInProgress"` // 最大进行中的IO操作数
}

// GetDiskIOMetrics 获取聚合后的磁盘IO指标
func (r *MetricRepo) GetDiskIOMetrics(ctx context.Context, agentID string, start, end int64, interval int) ([]AggregatedDiskIOMetric, error) {
	var metrics []AggregatedDiskIOMetric

	// 计算速率需要根据时间差来计算，这里简化处理，直接计算平均值
	query := `
		SELECT
			CAST(FLOOR(timestamp / ?) * ? AS BIGINT) as timestamp,
			device,
			MAX(read_bytes_rate) as max_read_rate,
			MAX(write_bytes_rate) as max_write_rate,
			CASE
				WHEN MAX(read_bytes) >= MIN(read_bytes) THEN MAX(read_bytes) - MIN(read_bytes)
				ELSE MAX(read_bytes)
			END as total_read_bytes,
			CASE
				WHEN MAX(write_bytes) >= MIN(write_bytes) THEN MAX(write_bytes) - MIN(write_bytes)
				ELSE MAX(write_bytes)
			END as total_write_bytes
		FROM disk_io_metrics
		WHERE agent_id = ? AND timestamp >= ? AND timestamp <= ?
		GROUP BY 1, device
		ORDER BY timestamp ASC, device
	`

	intervalMs := int64(interval * 1000)
	err := r.db.WithContext(ctx).
		Raw(query, intervalMs, intervalMs, agentID, start, end).
		Scan(&metrics).Error

	return metrics, err
}

// AggregatedGPUMetric GPU聚合指标（使用最大值）
type AggregatedGPUMetric struct {
	Timestamp      int64   `json:"timestamp"`
	Index          int     `json:"index"`
	Name           string  `json:"name"`
	MaxUtilization float64 `json:"maxUtilization"`
	MaxMemoryUsed  uint64  `json:"maxMemoryUsed"`
	MaxTemperature float64 `json:"maxTemperature"`
	MaxPowerDraw   float64 `json:"maxPowerDraw"`
	MemoryTotal    uint64  `json:"memoryTotal"`
}

// GetGPUMetrics 获取聚合后的GPU指标
func (r *MetricRepo) GetGPUMetrics(ctx context.Context, agentID string, start, end int64, interval int) ([]AggregatedGPUMetric, error) {
	var metrics []AggregatedGPUMetric

	query := `
		SELECT
			CAST(FLOOR(timestamp / ?) * ? AS BIGINT) as timestamp,
			MAX(utilization) as max_utilization,
			MAX(memory_used) as max_memory_used,
			MAX(temperature) as max_temperature,
			MAX(power_draw) as max_power_draw
		FROM gpu_metrics
		WHERE agent_id = ? AND timestamp >= ? AND timestamp <= ?
		GROUP BY 1
		ORDER BY timestamp ASC
	`

	intervalMs := int64(interval * 1000)
	err := r.db.WithContext(ctx).
		Raw(query, intervalMs, intervalMs, agentID, start, end).
		Scan(&metrics).Error

	return metrics, err
}

// AggregatedTemperatureMetric 温度聚合指标（使用最大值）
type AggregatedTemperatureMetric struct {
	Timestamp      int64   `json:"timestamp"`
	SensorKey      string  `json:"sensorKey"`
	SensorLabel    string  `json:"sensorLabel"`
	MaxTemperature float64 `json:"maxTemperature"`
}

// GetTemperatureMetrics 获取聚合后的温度指标
func (r *MetricRepo) GetTemperatureMetrics(ctx context.Context, agentID string, start, end int64, interval int) ([]AggregatedTemperatureMetric, error) {
	var metrics []AggregatedTemperatureMetric

	query := `
		SELECT
			CAST(FLOOR(timestamp / ?) * ? AS BIGINT) as timestamp,
			sensor_key,
			sensor_label,
			MAX(temperature) as max_temperature
		FROM temperature_metrics
		WHERE agent_id = ? AND timestamp >= ? AND timestamp <= ?
		GROUP BY 1, sensor_key, sensor_label
		ORDER BY timestamp ASC, sensor_key
	`

	intervalMs := int64(interval * 1000)
	err := r.db.WithContext(ctx).
		Raw(query, intervalMs, intervalMs, agentID, start, end).
		Scan(&metrics).Error

	return metrics, err
}

// DeleteMonitorMetrics 删除指定监控任务的所有指标数据
func (r *MetricRepo) DeleteMonitorMetrics(ctx context.Context, monitorID string) error {
	return r.db.WithContext(ctx).
		Where("monitor_id = ?", monitorID).
		Delete(&models.MonitorMetric{}).Error
}

// DeleteAgentMetrics 删除指定探针的所有指标数据
func (r *MetricRepo) DeleteAgentMetrics(ctx context.Context, agentID string) error {
	tables := []interface{}{
		&models.CPUMetric{},
		&models.MemoryMetric{},
		&models.DiskMetric{},
		&models.DiskIOMetric{},
		&models.NetworkMetric{},
		&models.HostMetric{},
		&models.GPUMetric{},
		&models.TemperatureMetric{},
		&models.MonitorMetric{},
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, table := range tables {
			if err := tx.Where("agent_id = ?", agentID).Delete(table).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// GetLatestMonitorMetricsByType 获取指定类型的最新监控指标（所有探针）
func (r *MetricRepo) GetLatestMonitorMetricsByType(ctx context.Context, monitorType string) ([]*models.MonitorMetric, error) {
	var metrics []*models.MonitorMetric

	err := r.db.WithContext(ctx).Raw(`
		SELECT m.*
		FROM monitor_metrics m
		INNER JOIN (
			SELECT monitor_id, MAX(timestamp) AS ts
			FROM monitor_metrics
			WHERE type = ?
			GROUP BY monitor_id
		) latest ON m.monitor_id = latest.monitor_id AND m.timestamp = latest.ts
		WHERE m.type = ?
		ORDER BY m.monitor_id
	`, monitorType, monitorType).Scan(&metrics).Error

	return metrics, err
}

// GetAllLatestMonitorMetrics 获取所有最新的监控指标（所有探针的所有监控项，每个监控项的最新一条）
func (r *MetricRepo) GetAllLatestMonitorMetrics(ctx context.Context) ([]*models.MonitorMetric, error) {
	var metrics []*models.MonitorMetric

	err := r.db.WithContext(ctx).Raw(`
		SELECT m.*
		FROM monitor_metrics m
		INNER JOIN (
			SELECT monitor_id, MAX(timestamp) AS ts
			FROM monitor_metrics
			GROUP BY monitor_id
		) latest ON m.monitor_id = latest.monitor_id AND m.timestamp = latest.ts
		ORDER BY m.monitor_id
	`).Scan(&metrics).Error

	return metrics, err
}

// ----------- 聚合表操作 -----------

// AggregateCPUToAgg 将原始CPU数据聚合到聚合表
func (r *MetricRepo) AggregateCPUToAgg(ctx context.Context, bucketSeconds int, start, end int64) error {
	bucketMs := int64(bucketSeconds * 1000)
	return r.db.WithContext(ctx).Exec(`
		INSERT INTO cpu_metrics_aggs (agent_id, bucket_seconds, bucket_start, max_usage, logical_cores)
		SELECT
			agent_id,
			? as bucket_seconds,
			(timestamp / ?) * ? as bucket_start,
			MAX(usage_percent) as max_usage,
			MAX(logical_cores) as logical_cores
		FROM cpu_metrics
		WHERE timestamp >= ? AND timestamp < ?
		GROUP BY agent_id, bucket_start
		ON CONFLICT (agent_id, bucket_seconds, bucket_start) DO UPDATE SET
			max_usage = EXCLUDED.max_usage,
			logical_cores = EXCLUDED.logical_cores
	`, bucketSeconds, bucketMs, bucketMs, start, end).Error
}

// AggregateMemoryToAgg 将原始内存数据聚合到聚合表
func (r *MetricRepo) AggregateMemoryToAgg(ctx context.Context, bucketSeconds int, start, end int64) error {
	bucketMs := int64(bucketSeconds * 1000)
	return r.db.WithContext(ctx).Exec(`
		INSERT INTO memory_metrics_aggs (agent_id, bucket_seconds, bucket_start, max_usage, total)
		SELECT
			agent_id,
			? as bucket_seconds,
			(timestamp / ?) * ? as bucket_start,
			MAX(usage_percent) as max_usage,
			MAX(total) as total
		FROM memory_metrics
		WHERE timestamp >= ? AND timestamp < ?
		GROUP BY agent_id, bucket_start
		ON CONFLICT (agent_id, bucket_seconds, bucket_start) DO UPDATE SET
			max_usage = EXCLUDED.max_usage,
			total = EXCLUDED.total
	`, bucketSeconds, bucketMs, bucketMs, start, end).Error
}

// AggregateDiskToAgg 将原始磁盘数据聚合到聚合表
func (r *MetricRepo) AggregateDiskToAgg(ctx context.Context, bucketSeconds int, start, end int64) error {
	bucketMs := int64(bucketSeconds * 1000)
	return r.db.WithContext(ctx).Exec(`
		INSERT INTO disk_metrics_aggs (agent_id, bucket_seconds, bucket_start, mount_point, max_usage, total)
		SELECT
			agent_id,
			? as bucket_seconds,
			(timestamp / ?) * ? as bucket_start,
			mount_point,
			MAX(usage_percent) as max_usage,
			MAX(total) as total
		FROM disk_metrics
		WHERE timestamp >= ? AND timestamp < ?
		GROUP BY agent_id, bucket_start, mount_point
		ON CONFLICT (agent_id, bucket_seconds, bucket_start, mount_point) DO UPDATE SET
			max_usage = EXCLUDED.max_usage,
			total = EXCLUDED.total
	`, bucketSeconds, bucketMs, bucketMs, start, end).Error
}

// AggregateNetworkToAgg 将原始网络数据聚合到聚合表（按网卡分组）
func (r *MetricRepo) AggregateNetworkToAgg(ctx context.Context, bucketSeconds int, start, end int64) error {
	bucketMs := int64(bucketSeconds * 1000)
	return r.db.WithContext(ctx).Exec(`
		INSERT INTO network_metrics_aggs (agent_id, bucket_seconds, bucket_start, interface, max_sent_rate, max_recv_rate)
		SELECT
			agent_id,
			? as bucket_seconds,
			(timestamp / ?) * ? as bucket_start,
			interface,
			MAX(bytes_sent_rate) as max_sent_rate,
			MAX(bytes_recv_rate) as max_recv_rate
		FROM network_metrics
		WHERE timestamp >= ? AND timestamp < ?
		GROUP BY agent_id, bucket_start, interface
		ON CONFLICT (agent_id, bucket_seconds, bucket_start, interface) DO UPDATE SET
			max_sent_rate = EXCLUDED.max_sent_rate,
			max_recv_rate = EXCLUDED.max_recv_rate
	`, bucketSeconds, bucketMs, bucketMs, start, end).Error
}

// AggregateNetworkConnectionToAgg 将原始网络连接数据聚合到聚合表
func (r *MetricRepo) AggregateNetworkConnectionToAgg(ctx context.Context, bucketSeconds int, start, end int64) error {
	bucketMs := int64(bucketSeconds * 1000)
	return r.db.WithContext(ctx).Exec(`
		INSERT INTO network_connection_metrics_aggs (
			agent_id, bucket_seconds, bucket_start,
			max_established, max_syn_sent, max_syn_recv, max_fin_wait1, max_fin_wait2,
			max_time_wait, max_close, max_close_wait, max_last_ack, max_listen,
			max_closing, max_total
		)
		SELECT
			agent_id,
			? as bucket_seconds,
			(timestamp / ?) * ? as bucket_start,
			MAX(established) as max_established,
			MAX(syn_sent) as max_syn_sent,
			MAX(syn_recv) as max_syn_recv,
			MAX(fin_wait1) as max_fin_wait1,
			MAX(fin_wait2) as max_fin_wait2,
			MAX(time_wait) as max_time_wait,
			MAX(close) as max_close,
			MAX(close_wait) as max_close_wait,
			MAX(last_ack) as max_last_ack,
			MAX(listen) as max_listen,
			MAX(closing) as max_closing,
			MAX(total) as max_total
		FROM network_connection_metrics
		WHERE timestamp >= ? AND timestamp < ?
		GROUP BY agent_id, bucket_start
		ON CONFLICT (agent_id, bucket_seconds, bucket_start) DO UPDATE SET
			max_established = EXCLUDED.max_established,
			max_syn_sent = EXCLUDED.max_syn_sent,
			max_syn_recv = EXCLUDED.max_syn_recv,
			max_fin_wait1 = EXCLUDED.max_fin_wait1,
			max_fin_wait2 = EXCLUDED.max_fin_wait2,
			max_time_wait = EXCLUDED.max_time_wait,
			max_close = EXCLUDED.max_close,
			max_close_wait = EXCLUDED.max_close_wait,
			max_last_ack = EXCLUDED.max_last_ack,
			max_listen = EXCLUDED.max_listen,
			max_closing = EXCLUDED.max_closing,
			max_total = EXCLUDED.max_total
	`, bucketSeconds, bucketMs, bucketMs, start, end).Error
}

// AggregateDiskIOToAgg 将原始磁盘IO数据聚合到聚合表
func (r *MetricRepo) AggregateDiskIOToAgg(ctx context.Context, bucketSeconds int, start, end int64) error {
	bucketMs := int64(bucketSeconds * 1000)
	return r.db.WithContext(ctx).Exec(`
		INSERT INTO disk_io_metrics_aggs (
			agent_id, bucket_seconds, bucket_start, device,
			max_read_bytes_rate, max_write_bytes_rate, max_iops_in_progress
		)
		SELECT
			agent_id,
			? as bucket_seconds,
			(timestamp / ?) * ? as bucket_start,
			device,
			MAX(read_bytes_rate) as max_read_bytes_rate,
			MAX(write_bytes_rate) as max_write_bytes_rate,
			MAX(iops_in_progress) as max_iops_in_progress
		FROM disk_io_metrics
		WHERE timestamp >= ? AND timestamp < ?
		GROUP BY agent_id, bucket_start, device
		ON CONFLICT (agent_id, bucket_seconds, bucket_start, device) DO UPDATE SET
			max_read_bytes_rate = EXCLUDED.max_read_bytes_rate,
			max_write_bytes_rate = EXCLUDED.max_write_bytes_rate,
			max_iops_in_progress = EXCLUDED.max_iops_in_progress
	`, bucketSeconds, bucketMs, bucketMs, start, end).Error
}

// AggregateGPUToAgg 将原始GPU数据聚合到聚合表
func (r *MetricRepo) AggregateGPUToAgg(ctx context.Context, bucketSeconds int, start, end int64) error {
	bucketMs := int64(bucketSeconds * 1000)
	return r.db.WithContext(ctx).Exec(`
		INSERT INTO gpu_metrics_aggs (
			agent_id, bucket_seconds, bucket_start, index, name,
			max_utilization, max_memory_used, max_temperature, max_power_draw, memory_total
		)
		SELECT
			agent_id,
			? as bucket_seconds,
			(timestamp / ?) * ? as bucket_start,
			index,
			MAX(name) as name,
			MAX(utilization) as max_utilization,
			MAX(memory_used) as max_memory_used,
			MAX(temperature) as max_temperature,
			MAX(power_draw) as max_power_draw,
			MAX(memory_total) as memory_total
		FROM gpu_metrics
		WHERE timestamp >= ? AND timestamp < ?
		GROUP BY agent_id, bucket_start, index
		ON CONFLICT (agent_id, bucket_seconds, bucket_start, index) DO UPDATE SET
			name = EXCLUDED.name,
			max_utilization = EXCLUDED.max_utilization,
			max_memory_used = EXCLUDED.max_memory_used,
			max_temperature = EXCLUDED.max_temperature,
			max_power_draw = EXCLUDED.max_power_draw,
			memory_total = EXCLUDED.memory_total
	`, bucketSeconds, bucketMs, bucketMs, start, end).Error
}

// AggregateTemperatureToAgg 将原始温度数据聚合到聚合表
func (r *MetricRepo) AggregateTemperatureToAgg(ctx context.Context, bucketSeconds int, start, end int64) error {
	bucketMs := int64(bucketSeconds * 1000)
	return r.db.WithContext(ctx).Exec(`
		INSERT INTO temperature_metrics_aggs (
			agent_id, bucket_seconds, bucket_start, sensor_key, sensor_label, max_temperature
		)
		SELECT
			agent_id,
			? as bucket_seconds,
			(timestamp / ?) * ? as bucket_start,
			sensor_key,
			MAX(sensor_label) as sensor_label,
			MAX(temperature) as max_temperature
		FROM temperature_metrics
		WHERE timestamp >= ? AND timestamp < ?
		GROUP BY agent_id, bucket_start, sensor_key
		ON CONFLICT (agent_id, bucket_seconds, bucket_start, sensor_key) DO UPDATE SET
			sensor_label = EXCLUDED.sensor_label,
			max_temperature = EXCLUDED.max_temperature
	`, bucketSeconds, bucketMs, bucketMs, start, end).Error
}

// GetCPUMetricsAgg 从聚合表获取CPU指标
func (r *MetricRepo) GetCPUMetricsAgg(ctx context.Context, agentID string, start, end int64, bucketSeconds int) ([]AggregatedCPUMetric, error) {
	var metrics []AggregatedCPUMetric
	err := r.db.WithContext(ctx).
		Table("cpu_metrics_aggs").
		Select("bucket_start as timestamp, max_usage, logical_cores").
		Where("agent_id = ? AND bucket_seconds = ? AND bucket_start >= ? AND bucket_start < ?", agentID, bucketSeconds, start, end).
		Order("bucket_start").
		Scan(&metrics).Error
	return metrics, err
}

// GetMemoryMetricsAgg 从聚合表获取内存指标
func (r *MetricRepo) GetMemoryMetricsAgg(ctx context.Context, agentID string, start, end int64, bucketSeconds int) ([]AggregatedMemoryMetric, error) {
	var metrics []AggregatedMemoryMetric
	err := r.db.WithContext(ctx).
		Table("memory_metrics_aggs").
		Select("bucket_start as timestamp, max_usage, total").
		Where("agent_id = ? AND bucket_seconds = ? AND bucket_start >= ? AND bucket_start < ?", agentID, bucketSeconds, start, end).
		Order("bucket_start").
		Scan(&metrics).Error
	return metrics, err
}

// GetDiskMetricsAgg 从聚合表获取磁盘指标
func (r *MetricRepo) GetDiskMetricsAgg(ctx context.Context, agentID string, start, end int64, bucketSeconds int) ([]AggregatedDiskMetric, error) {
	var metrics []AggregatedDiskMetric
	err := r.db.WithContext(ctx).
		Table("disk_metrics_aggs").
		Select("bucket_start as timestamp, mount_point, max_usage, total").
		Where("agent_id = ? AND bucket_seconds = ? AND bucket_start >= ? AND bucket_start < ?", agentID, bucketSeconds, start, end).
		Order("bucket_start, mount_point").
		Scan(&metrics).Error
	return metrics, err
}

// GetNetworkMetricsAgg 从聚合表获取网络指标
func (r *MetricRepo) GetNetworkMetricsAgg(ctx context.Context, agentID string, start, end int64, bucketSeconds int) ([]AggregatedNetworkMetric, error) {
	var metrics []AggregatedNetworkMetric
	err := r.db.WithContext(ctx).
		Table("network_metrics_aggs").
		Select("bucket_start as timestamp, interface, max_sent_rate, max_recv_rate").
		Where("agent_id = ? AND bucket_seconds = ? AND bucket_start >= ? AND bucket_start < ?", agentID, bucketSeconds, start, end).
		Order("bucket_start, interface").
		Scan(&metrics).Error
	return metrics, err
}

// GetNetworkConnectionMetricsAgg 从聚合表获取网络连接指标
func (r *MetricRepo) GetNetworkConnectionMetricsAgg(ctx context.Context, agentID string, start, end int64, bucketSeconds int) ([]AggregatedNetworkConnectionMetric, error) {
	var metrics []AggregatedNetworkConnectionMetric
	err := r.db.WithContext(ctx).
		Table("network_connection_metrics_aggs").
		Select(`bucket_start as timestamp,
			max_established, max_syn_sent, max_syn_recv,
			max_fin_wait1, max_fin_wait2, max_time_wait,
			max_close, max_close_wait, max_last_ack,
			max_listen, max_closing, max_total`).
		Where("agent_id = ? AND bucket_seconds = ? AND bucket_start >= ? AND bucket_start < ?", agentID, bucketSeconds, start, end).
		Order("bucket_start").
		Scan(&metrics).Error
	return metrics, err
}

// GetDiskIOMetricsAgg 从聚合表获取磁盘IO指标
func (r *MetricRepo) GetDiskIOMetricsAgg(ctx context.Context, agentID string, start, end int64, bucketSeconds int) ([]AggregatedDiskIOMetric, error) {
	var metrics []AggregatedDiskIOMetric
	err := r.db.WithContext(ctx).
		Table("disk_io_metrics_aggs").
		Select(`bucket_start as timestamp, device,
			max_read_bytes_rate as max_read_rate,
			max_write_bytes_rate as max_write_rate,
			max_iops_in_progress`).
		Where("agent_id = ? AND bucket_seconds = ? AND bucket_start >= ? AND bucket_start < ?", agentID, bucketSeconds, start, end).
		Order("bucket_start, device").
		Scan(&metrics).Error
	return metrics, err
}

// GetGPUMetricsAgg 从聚合表获取GPU指标
func (r *MetricRepo) GetGPUMetricsAgg(ctx context.Context, agentID string, start, end int64, bucketSeconds int) ([]AggregatedGPUMetric, error) {
	var metrics []AggregatedGPUMetric
	err := r.db.WithContext(ctx).
		Table("gpu_metrics_aggs").
		Select(`bucket_start as timestamp, index, name,
			max_utilization,
			max_memory_used,
			max_temperature,
			max_power_draw,
			memory_total`).
		Where("agent_id = ? AND bucket_seconds = ? AND bucket_start >= ? AND bucket_start < ?", agentID, bucketSeconds, start, end).
		Order("bucket_start, index").
		Scan(&metrics).Error
	return metrics, err
}

// GetTemperatureMetricsAgg 从聚合表获取温度指标
func (r *MetricRepo) GetTemperatureMetricsAgg(ctx context.Context, agentID string, start, end int64, bucketSeconds int) ([]AggregatedTemperatureMetric, error) {
	var metrics []AggregatedTemperatureMetric
	err := r.db.WithContext(ctx).
		Table("temperature_metrics_aggs").
		Select(`bucket_start as timestamp, sensor_key, sensor_label,
			max_temperature`).
		Where("agent_id = ? AND bucket_seconds = ? AND bucket_start >= ? AND bucket_start < ?", agentID, bucketSeconds, start, end).
		Order("bucket_start, sensor_key").
		Scan(&metrics).Error
	return metrics, err
}

// UpsertAggregationProgress 更新或插入聚合进度
func (r *MetricRepo) UpsertAggregationProgress(ctx context.Context, metricType string, bucketSeconds int, lastBucket int64) error {
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "metric_type"}, {Name: "bucket_seconds"}},
			DoUpdates: clause.AssignmentColumns([]string{"last_bucket"}),
		}).
		Create(&models.AggregationProgress{
			MetricType:    metricType,
			BucketSeconds: bucketSeconds,
			LastBucket:    lastBucket,
		}).Error
}

// GetAggregationProgress 获取聚合进度
func (r *MetricRepo) GetAggregationProgress(ctx context.Context, metricType string, bucketSeconds int) (*models.AggregationProgress, error) {
	var progress models.AggregationProgress
	err := r.db.WithContext(ctx).
		Where("metric_type = ? AND bucket_seconds = ?", metricType, bucketSeconds).
		First(&progress).Error
	if err != nil {
		return nil, err
	}
	return &progress, nil
}
