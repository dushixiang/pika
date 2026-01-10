package v0_1_1

import (
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type oldAgent struct {
	ID string `gorm:"primaryKey" json:"id"` // 探针ID (UUID)
	// 其他字段省略
	TrafficLimit        uint64 `json:"trafficLimit"`        // 流量限额(字节), 0表示不限制
	TrafficUsed         uint64 `json:"trafficUsed"`         // 当前周期已使用流量(字节)
	TrafficResetDay     int    `json:"trafficResetDay"`     // 流量重置日期(1-31), 0表示不自动重置
	TrafficPeriodStart  int64  `json:"trafficPeriodStart"`  // 当前周期开始时间(时间戳毫秒)
	TrafficBaselineRecv uint64 `json:"trafficBaselineRecv"` // 当前周期流量基线(BytesRecvTotal)
	TrafficAlertSent80  bool   `json:"trafficAlertSent80"`  // 是否已发送80%告警
	TrafficAlertSent90  bool   `json:"trafficAlertSent90"`  // 是否已发送90%告警
	TrafficAlertSent100 bool   `json:"trafficAlertSent100"` // 是否已发送100%告警
}

type newAgent struct {
	ID string `gorm:"primaryKey" json:"id"` // 探针ID (UUID)
	// 其他字段省略
	// 流量统计相关字段
	TrafficStats datatypes.JSONType[trafficStatsData] `json:"trafficStats,omitempty"` // 流量统计
}

type trafficStatsData struct {
	Enabled      bool   `json:"enabled"`      // 是否启用
	Limit        uint64 `json:"limit"`        // 流量限额(字节), 0表示不限制
	Used         uint64 `json:"used"`         // 当前周期已使用流量(字节)
	ResetDay     int    `json:"resetDay"`     // 流量重置日期(1-31), 0表示不自动重置
	PeriodStart  int64  `json:"periodStart"`  // 当前周期开始时间(时间戳毫秒)
	BaselineRecv uint64 `json:"baselineRecv"` // 当前周期流量基线(BytesRecvTotal)
	AlertSent80  bool   `json:"alertSent80"`  // 是否已发送80%告警
	AlertSent90  bool   `json:"alertSent90"`  // 是否已发送90%告警
	AlertSent100 bool   `json:"alertSent100"` // 是否已发送100%告警
}

func Migrate(logger *zap.Logger, db *gorm.DB) error {
	logger.Info("开始执行 v0.1.1 版本数据迁移")

	migrator := db.Migrator()
	if migrator == nil {
		logger.Warn("无法获取数据库 migrator，跳过迁移")
		return nil
	}

	var dropTables = []string{
		"host_metrics",
		"tamper_alerts",
		"tamper_protect_configs",
	}
	// 移除废弃表
	for _, table := range dropTables {
		if migrator.HasTable(table) {
			logger.Info("删除废弃表 " + table)
			if err := migrator.DropTable(table); err != nil {
				logger.Error("删除 "+table+" 表失败", zap.Error(err))
				return err
			}
			logger.Info("成功删除 " + table + " 表")
		}
	}

	// 修改 agent 表结构
	logger.Info("开始迁移 agent 表结构")
	if err := migrateAgentTable(logger, db, migrator); err != nil {
		logger.Error("迁移 agent 表失败", zap.Error(err))
		return err
	}

	logger.Info("v0.1.1 版本数据迁移完成")
	return nil
}

// migrateAgentTable 迁移 agent 表的流量统计字段
func migrateAgentTable(logger *zap.Logger, db *gorm.DB, migrator gorm.Migrator) error {
	// 检查是否存在旧的流量统计字段
	hasOldFields := migrator.HasColumn(&oldAgent{}, "traffic_limit")
	if !hasOldFields {
		// 如果旧字段不存在，说明已经迁移过了或者是新安装，直接返回
		logger.Info("未检测到旧的流量统计字段，跳过 agent 表迁移")
		return nil
	}

	logger.Info("检测到旧的流量统计字段，开始迁移")

	// 1. 添加新的 traffic_stats 字段（如果不存在）
	if !migrator.HasColumn(&newAgent{}, "traffic_stats") {
		logger.Info("添加新字段 traffic_stats")
		if err := migrator.AddColumn(&newAgent{}, "traffic_stats"); err != nil {
			logger.Error("添加 traffic_stats 字段失败", zap.Error(err))
			return err
		}
		logger.Info("成功添加 traffic_stats 字段")
	} else {
		logger.Info("traffic_stats 字段已存在，跳过添加")
	}

	// 2. 读取所有 agent 记录的旧字段数据
	var oldAgents []oldAgent
	if err := db.Table("agents").Find(&oldAgents).Error; err != nil {
		logger.Error("读取 agent 数据失败", zap.Error(err))
		return err
	}
	logger.Info("读取到 agent 数据", zap.Int("count", len(oldAgents)))

	// 3. 迁移数据：将旧字段的值转换为 JSON 格式并保存到新字段
	migratedCount := 0
	for _, old := range oldAgents {
		// 检查是否有任何流量配置（只要限额或重置日期不为0就认为启用了流量统计）
		enabled := old.TrafficLimit > 0 || old.TrafficResetDay > 0

		trafficStats := trafficStatsData{
			Enabled:      enabled,
			Limit:        old.TrafficLimit,
			Used:         old.TrafficUsed,
			ResetDay:     old.TrafficResetDay,
			PeriodStart:  old.TrafficPeriodStart,
			BaselineRecv: old.TrafficBaselineRecv,
			AlertSent80:  old.TrafficAlertSent80,
			AlertSent90:  old.TrafficAlertSent90,
			AlertSent100: old.TrafficAlertSent100,
		}

		// 更新新字段
		if err := db.Table("agents").
			Where("id = ?", old.ID).
			Update("traffic_stats", datatypes.NewJSONType(trafficStats)).Error; err != nil {
			logger.Error("迁移 agent 流量统计数据失败",
				zap.String("agentId", old.ID),
				zap.Error(err))
			return err
		}
		migratedCount++
	}
	logger.Info("成功迁移流量统计数据", zap.Int("migratedCount", migratedCount))

	// 4. 删除旧的流量统计字段
	oldColumns := []string{
		"traffic_limit",
		"traffic_used",
		"traffic_reset_day",
		"traffic_period_start",
		"traffic_baseline_recv",
		"traffic_alert_sent80",
		"traffic_alert_sent90",
		"traffic_alert_sent100",
	}

	logger.Info("开始删除旧的流量统计字段", zap.Int("columnCount", len(oldColumns)))
	deletedCount := 0
	for _, column := range oldColumns {
		if migrator.HasColumn(&oldAgent{}, column) {
			logger.Debug("删除字段", zap.String("column", column))
			if err := migrator.DropColumn(&oldAgent{}, column); err != nil {
				logger.Error("删除字段失败",
					zap.String("column", column),
					zap.Error(err))
				return err
			}
			deletedCount++
		}
	}
	logger.Info("成功删除旧字段", zap.Int("deletedCount", deletedCount))
	logger.Info("agent 表结构迁移完成")

	return nil
}
