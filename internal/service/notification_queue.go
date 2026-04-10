package service

import (
	"context"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/repo"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	maxConcurrentNotifications = 10
	notificationTimeout        = 30 * time.Second
)

type NotificationTask struct {
	RecordID int64
	Agent    *models.Agent
}

type NotificationQueue struct {
	db              *gorm.DB
	alertService    *AlertService
	alertRecordRepo *repo.AlertRecordRepo
	logger          *zap.Logger
	taskChan        chan NotificationTask
	semaphore       chan struct{}
	shutdownChan    chan struct{}
}

func NewNotificationQueue(db *gorm.DB, alertService *AlertService, alertRecordRepo *repo.AlertRecordRepo, logger *zap.Logger) *NotificationQueue {
	return &NotificationQueue{
		db:              db,
		alertService:    alertService,
		alertRecordRepo: alertRecordRepo,
		logger:          logger,
		taskChan:        make(chan NotificationTask, 100),
		semaphore:       make(chan struct{}, maxConcurrentNotifications),
		shutdownChan:    make(chan struct{}),
	}
}

func (q *NotificationQueue) Start() {
	q.logger.Info("启动通知发送队列", zap.Int("maxConcurrent", maxConcurrentNotifications))

	for i := 0; i < maxConcurrentNotifications; i++ {
		go q.worker()
	}
}

func (q *NotificationQueue) worker() {
	for {
		select {
		case <-q.shutdownChan:
			q.logger.Info("通知worker停止")
			return
		case task := <-q.taskChan:
			q.processTask(task)
		}
	}
}

func (q *NotificationQueue) processTask(task NotificationTask) {
	q.semaphore <- struct{}{}
	defer func() { <-q.semaphore }()

	defer func() {
		if r := recover(); r != nil {
			q.logger.Error("处理通知任务时发生panic",
				zap.Any("panic", r),
				zap.Int64("recordId", task.RecordID),
			)
		}
	}()

	record, err := q.alertRecordRepo.GetAlertRecordByID(context.Background(), task.RecordID)
	if err != nil {
		q.logger.Error("获取告警记录失败",
			zap.Int64("recordId", task.RecordID),
			zap.Error(err),
		)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), notificationTimeout)
	defer cancel()

	sendErr := q.alertService.sendAlertNotificationSync(ctx, record, task.Agent)

	now := time.Now().UnixMilli()

	if sendErr != nil {
		q.updateNotificationStatus(record.ID, "failed", 0, sendErr.Error())
		q.logger.Error("通知发送失败",
			zap.Int64("recordId", record.ID),
			zap.Error(sendErr),
		)
	} else {
		q.updateNotificationStatus(record.ID, "sent", now, "")
		q.logger.Info("通知发送成功",
			zap.Int64("recordId", record.ID),
		)
	}
}

func (q *NotificationQueue) updateNotificationStatus(recordID int64, status string, sentAt int64, errMsg string) {
	now := time.Now().UnixMilli()

	updates := map[string]interface{}{
		"notification_status": status,
		"updated_at":          now,
	}

	if sentAt > 0 {
		updates["notification_sent_at"] = sentAt
	}

	if errMsg != "" {
		updates["notification_error"] = errMsg
	} else {
		updates["notification_error"] = ""
	}

	if err := q.db.Model(&models.AlertRecord{}).
		Where("id = ?", recordID).
		Updates(updates).Error; err != nil {
		q.logger.Error("更新通知状态失败",
			zap.Int64("recordId", recordID),
			zap.Error(err),
		)
	}
}

func (q *NotificationQueue) Enqueue(recordID int64, agent *models.Agent) error {
	q.updateNotificationStatus(recordID, "pending", 0, "")

	task := NotificationTask{
		RecordID: recordID,
		Agent:    agent,
	}

	select {
	case q.taskChan <- task:
		q.logger.Info("通知任务已加入队列",
			zap.Int64("recordId", recordID),
			zap.Int("queueLen", len(q.taskChan)),
		)
		return nil
	default:
		errMsg := "通知队列已满，任务被丢弃"
		q.updateNotificationStatus(recordID, "failed", 0, errMsg)
		q.logger.Warn(errMsg,
			zap.Int64("recordId", recordID),
			zap.Int("queueLen", len(q.taskChan)),
		)
		return nil
	}
}

func (q *NotificationQueue) Shutdown() {
	q.logger.Info("关闭通知发送队列")
	close(q.shutdownChan)

	for i := 0; i < maxConcurrentNotifications; i++ {
		q.semaphore <- struct{}{}
	}

	q.logger.Info("通知发送队列已关闭")
}

func (q *NotificationQueue) GetQueueLength() int {
	return len(q.taskChan)
}

func (q *NotificationQueue) GetActiveWorkers() int {
	return maxConcurrentNotifications - len(q.semaphore)
}
