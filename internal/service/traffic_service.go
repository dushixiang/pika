package service

import (
	"context"
	"fmt"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/repo"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type TrafficService struct {
	logger          *zap.Logger
	agentRepo       *repo.AgentRepo
	alertRecordRepo *repo.AlertRecordRepo
}

func NewTrafficService(logger *zap.Logger, db *gorm.DB) *TrafficService {
	return &TrafficService{
		logger:          logger,
		agentRepo:       repo.NewAgentRepo(db),
		alertRecordRepo: repo.NewAlertRecordRepo(db),
	}
}

// UpdateAgentTraffic 更新探针流量统计(每次上报网络指标时调用)
func (s *TrafficService) UpdateAgentTraffic(ctx context.Context, agentID string, currentRecvTotal uint64) error {
	agent, err := s.agentRepo.FindById(ctx, agentID)
	if err != nil {
		return err
	}

	// 获取流量统计数据
	stats := agent.TrafficStats.Data()

	// 如果未配置流量限制,跳过更新
	if stats.Limit == 0 && stats.ResetDay == 0 {
		return nil
	}

	// 初始化基线(首次统计)
	if stats.BaselineRecv == 0 {
		stats.BaselineRecv = currentRecvTotal
		stats.Used = 0
		if stats.PeriodStart == 0 {
			stats.PeriodStart = time.Now().UnixMilli()
		}
		agent.TrafficStats = datatypes.NewJSONType(stats)
		return s.agentRepo.UpdateById(ctx, &agent)
	}

	// 检测计数器重置(探针重启)
	if currentRecvTotal < stats.BaselineRecv {
		s.logger.Warn("检测到流量计数器重置",
			zap.String("agentId", agentID),
			zap.Uint64("baseline", stats.BaselineRecv),
			zap.Uint64("current", currentRecvTotal))
		stats.BaselineRecv = currentRecvTotal
		// 保持 Used 不变,避免丢失已统计的流量
	} else {
		// 计算使用量
		stats.Used = currentRecvTotal - stats.BaselineRecv
	}

	// 检查告警(如果配置了限额)
	if stats.Limit > 0 {
		s.checkTrafficAlerts(ctx, &agent, &stats)
	}

	// 保存更新后的统计数据
	agent.TrafficStats = datatypes.NewJSONType(stats)

	// 更新数据库
	return s.agentRepo.UpdateById(ctx, &agent)
}

// checkTrafficAlerts 检查并发送流量告警
func (s *TrafficService) checkTrafficAlerts(ctx context.Context, agent *models.Agent, stats *models.TrafficStatsData) {
	usagePercent := float64(stats.Used) / float64(stats.Limit) * 100

	// 100% 告警
	if usagePercent >= 100 && !stats.AlertSent100 {
		s.sendTrafficAlert(ctx, agent, stats, 100, usagePercent)
		stats.AlertSent100 = true
	}
	// 90% 告警
	if usagePercent >= 90 && !stats.AlertSent90 {
		s.sendTrafficAlert(ctx, agent, stats, 90, usagePercent)
		stats.AlertSent90 = true
	}
	// 80% 告警
	if usagePercent >= 80 && !stats.AlertSent80 {
		s.sendTrafficAlert(ctx, agent, stats, 80, usagePercent)
		stats.AlertSent80 = true
	}
}

// sendTrafficAlert 发送流量告警
func (s *TrafficService) sendTrafficAlert(ctx context.Context, agent *models.Agent, stats *models.TrafficStatsData, threshold int, actualPercent float64) {
	level := "info"
	if threshold == 100 {
		level = "critical"
	} else if threshold == 90 {
		level = "warning"
	}

	now := time.Now().UnixMilli()
	record := &models.AlertRecord{
		AgentID:   agent.ID,
		AgentName: agent.Name,
		AlertType: "traffic",
		Message: fmt.Sprintf("流量使用已达到%d%%，当前使用%.2f%%（%s/%s）",
			threshold, actualPercent,
			formatBytes(stats.Used),
			formatBytes(stats.Limit)),
		Threshold:   float64(threshold),
		ActualValue: actualPercent,
		Level:       level,
		Status:      "firing",
		FiredAt:     now,
		CreatedAt:   now,
	}

	// 创建告警记录
	if err := s.alertRecordRepo.CreateAlertRecord(ctx, record); err != nil {
		s.logger.Error("创建流量告警记录失败", zap.Error(err))
		return
	}

	s.logger.Info("流量告警记录已创建",
		zap.String("agentId", agent.ID),
		zap.String("agentName", agent.Name),
		zap.Int("threshold", threshold),
		zap.Float64("actualPercent", actualPercent))

	// 注意: 告警通知需要通过告警系统的统一通知机制发送,
	// 这里只创建记录,通知由其他机制处理
}

// formatBytes 格式化字节数为人类可读的格式
func formatBytes(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %ciB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
