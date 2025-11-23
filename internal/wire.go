//go:build wireinject
// +build wireinject

package internal

import (
	"github.com/dushixiang/pika/internal/config"
	"github.com/dushixiang/pika/internal/handler"
	"github.com/dushixiang/pika/internal/repo"
	"github.com/dushixiang/pika/internal/service"
	"github.com/dushixiang/pika/internal/websocket"
	"github.com/google/wire"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// InitializeApp 初始化应用
func InitializeApp(logger *zap.Logger, db *gorm.DB, cfg *config.AppConfig) (*AppComponents, error) {
	wire.Build(
		service.NewAccountService,
		service.NewAgentService,
		service.NewUserService,
		service.NewOIDCService,
		service.NewGitHubOAuthService,
		service.NewApiKeyService,
		service.NewAlertService,
		service.NewPropertyService,
		service.NewMonitorService,
		service.NewTamperService,

		service.NewNotifier,
		// WebSocket Manager
		websocket.NewManager,

		// Repositories
		repo.NewTamperRepo,

		// Handlers
		handler.NewAgentHandler,
		handler.NewAlertHandler,
		handler.NewPropertyHandler,
		handler.NewMonitorHandler,
		handler.NewApiKeyHandler,
		handler.NewAccountHandler,
		handler.NewTamperHandler,

		// App Components
		wire.Struct(new(AppComponents), "*"),
	)
	return nil, nil
}

// AppComponents 应用组件
type AppComponents struct {
	AccountHandler  *handler.AccountHandler
	AgentHandler    *handler.AgentHandler
	ApiKeyHandler   *handler.ApiKeyHandler
	AlertHandler    *handler.AlertHandler
	PropertyHandler *handler.PropertyHandler
	MonitorHandler  *handler.MonitorHandler
	TamperHandler   *handler.TamperHandler

	AgentService    *service.AgentService
	AlertService    *service.AlertService
	PropertyService *service.PropertyService
	MonitorService  *service.MonitorService
	ApiKeyService   *service.ApiKeyService
	TamperService   *service.TamperService

	WSManager *websocket.Manager
}
