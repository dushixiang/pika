//go:build wireinject
// +build wireinject

package internal

import (
	"time"

	"github.com/dushixiang/pika/internal/config"
	"github.com/dushixiang/pika/internal/handler"
	"github.com/dushixiang/pika/internal/service"
	"github.com/dushixiang/pika/internal/vmclient"
	"github.com/dushixiang/pika/internal/websocket"
	"github.com/google/wire"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// InitializeApp 初始化应用
func InitializeApp(logger *zap.Logger, db *gorm.DB, cfg *config.AppConfig) (*AppComponents, error) {
	wire.Build(
		// VictoriaMetrics Client
		provideVMClient,

		service.NewAccountService,
		service.NewAgentService,
		service.NewUserService,
		service.NewOIDCService,
		service.NewGitHubOAuthService,
		service.NewApiKeyService,
		service.NewAlertService,
		service.NewPropertyService,
		service.NewNotificationService,
		service.NewMonitorService,
		service.NewTamperService,
		service.NewTrafficService,
		service.NewMetricService,
		service.NewGeoIPService,
		service.NewDDNSService,
		service.NewSSHLoginService,
		service.NewPublicIPService,
		service.NewHostLookupService,

		service.NewNotifier,
		// WebSocket Manager
		websocket.NewManager,

		// Handlers
		handler.NewAgentHandler,
		handler.NewAlertHandler,
		handler.NewPropertyHandler,
		handler.NewMonitorHandler,
		handler.NewApiKeyHandler,
		handler.NewAccountHandler,
		handler.NewTamperHandler,
		handler.NewDNSProviderHandler,
		handler.NewDDNSHandler,
		handler.NewSSHLoginHandler,

		// App Components
		wire.Struct(new(AppComponents), "*"),
	)
	return nil, nil
}

// AppComponents 应用组件
type AppComponents struct {
	AccountHandler     *handler.AccountHandler
	AgentHandler       *handler.AgentHandler
	ApiKeyHandler      *handler.ApiKeyHandler
	AlertHandler       *handler.AlertHandler
	PropertyHandler    *handler.PropertyHandler
	MonitorHandler     *handler.MonitorHandler
	TamperHandler      *handler.TamperHandler
	DNSProviderHandler *handler.DNSProviderHandler
	DDNSHandler        *handler.DDNSHandler
	SSHLoginHandler    *handler.SSHLoginHandler

	AgentService    *service.AgentService
	TrafficService  *service.TrafficService
	MetricService   *service.MetricService
	AlertService    *service.AlertService
	PropertyService *service.PropertyService
	MonitorService  *service.MonitorService
	ApiKeyService   *service.ApiKeyService
	TamperService   *service.TamperService
	DDNSService     *service.DDNSService
	SSHLoginService *service.SSHLoginService
	PublicIPService *service.PublicIPService

	WSManager *websocket.Manager
	VMClient  *vmclient.VMClient
}

// provideVMClient 提供 VictoriaMetrics 客户端
func provideVMClient(cfg *config.AppConfig, logger *zap.Logger) *vmclient.VMClient {
	// 检查配置
	if cfg.VictoriaMetrics == nil || !cfg.VictoriaMetrics.Enabled {
		logger.Info("VictoriaMetrics is not enabled, using default configuration")
		// 返回一个默认配置的客户端（用于本地开发）
		return vmclient.NewVMClient("http://localhost:8428", 30*time.Second, 60*time.Second)
	}

	// 使用配置创建客户端
	writeTimeout := time.Duration(cfg.VictoriaMetrics.WriteTimeout) * time.Second
	if writeTimeout == 0 {
		writeTimeout = 30 * time.Second
	}

	queryTimeout := time.Duration(cfg.VictoriaMetrics.QueryTimeout) * time.Second
	if queryTimeout == 0 {
		queryTimeout = 60 * time.Second
	}

	logger.Info("VictoriaMetrics client initialized",
		zap.String("url", cfg.VictoriaMetrics.URL),
		zap.Duration("writeTimeout", writeTimeout),
		zap.Duration("queryTimeout", queryTimeout))

	return vmclient.NewVMClient(cfg.VictoriaMetrics.URL, writeTimeout, queryTimeout)
}
