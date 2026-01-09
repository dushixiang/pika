package repo

import (
	"context"

	"github.com/dushixiang/pika/internal/models"
	"github.com/go-orz/orz"
	"gorm.io/gorm"
)

type TamperEventRepo struct {
	orz.Repository[models.TamperEvent, string]
}

func NewTamperEventRepo(db *gorm.DB) *TamperEventRepo {
	return &TamperEventRepo{
		Repository: orz.NewRepository[models.TamperEvent, string](db),
	}
}

// DeleteOldEvents 删除旧的事件记录（保留最近N天）
func (r *TamperEventRepo) DeleteOldEvents(ctx context.Context, beforeTimestamp int64) error {
	return r.GetDB(ctx).Where("timestamp < ?", beforeTimestamp).Delete(&models.TamperEvent{}).Error
}
