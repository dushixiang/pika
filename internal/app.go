package internal

import (
	"bytes"
	"context"
	"html/template"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/dushixiang/pika/internal/config"
	"github.com/dushixiang/pika/internal/handler"
	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/scheduler"
	"github.com/dushixiang/pika/pkg/replace"
	"github.com/dushixiang/pika/web"
	"github.com/google/uuid"
	"github.com/spf13/afero/mem"

	"github.com/go-errors/errors"
	"github.com/go-orz/orz"
	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

func Run(configPath string) {
	err := orz.Quick(configPath, setup)
	if err != nil {
		log.Fatal(err)
	}
}

func setup(app *orz.App) error {
	// 数据库迁移
	if err := autoMigrate(app.GetDatabase()); err != nil {
		return err
	}

	// 读取应用配置
	var appConfig config.AppConfig
	_config := app.GetConfig()
	if _config != nil {
		if err := _config.App.Unmarshal(&appConfig); err != nil {
			app.Logger().Error("读取配置失败", zap.Error(err))
			return err
		}
	}

	// 设置默认值
	if appConfig.JWT.Secret == "" {
		appConfig.JWT.Secret = uuid.NewString()
		app.Logger().Warn("未配置JWT密钥，使用随机UUID")
	}
	if appConfig.JWT.ExpiresHours == 0 {
		appConfig.JWT.ExpiresHours = 168 // 7天
	}

	// 初始化应用组件
	components, err := InitializeApp(app.Logger(), app.GetDatabase(), &appConfig)
	if err != nil {
		return err
	}

	// 初始化默认属性配置
	ctx := context.Background()
	if err := initDefaultProperties(ctx, components, app.Logger()); err != nil {
		app.Logger().Error("初始化默认属性配置失败", zap.Error(err))
		// 不返回错误，继续启动
	}

	// 启动WebSocket管理器
	go components.WSManager.Run(ctx)

	// 启动数据清理任务
	go components.AgentService.StartCleanupTask(ctx)

	// 启动指标监控任务（用于告警检测）
	go startMetricsMonitoring(ctx, components, app.Logger())

	// 启动服务监控任务调度器
	monitorScheduler := scheduler.NewMonitorScheduler(components.MonitorService, app.Logger(), 10)
	monitorScheduler.Start(ctx)

	// 启动监控统计计算任务
	go startMonitorStatsCalculation(ctx, components, app.Logger())

	// 设置API
	setupApi(app, components)

	return nil
}

func setupApi(app *orz.App, components *AppComponents) {
	logger := app.Logger()
	e := app.GetEcho()

	e.Use(middleware.Recover())
	e.Use(ErrorHandler(logger))

	indexTemplate, err := template.New("index").Parse(web.IndexHtml())
	if err != nil {
		logger.Fatal("failed to parse index.html", zap.Error(err))
	}
	// 静态文件服务
	e.Use(middleware.StaticWithConfig(middleware.StaticConfig{
		Skipper: func(c echo.Context) bool {
			// 不处理接口
			if strings.HasPrefix(c.Request().RequestURI, "/api") {
				return true
			}
			// 不处理WebSocket
			if strings.HasPrefix(c.Request().RequestURI, "/ws") {
				return true
			}
			return false
		},
		Index:      "index.html",
		HTML5:      true,
		Browse:     false,
		IgnoreBase: false,
		Filesystem: replace.FS(http.FS(web.Assets()), func(name string, file http.File) (http.File, error) {
			if name == "index.html" {
				fileData := mem.CreateFile(name)
				fileHandle := mem.NewFileHandle(fileData)

				systemConfig, err := components.PropertyService.GetSystemConfig(context.Background())
				if err != nil {
					return file, nil
				}

				var buf bytes.Buffer
				err = indexTemplate.Execute(&buf, systemConfig)
				if err != nil {
					return file, err
				}
				if _, err := fileHandle.Write(buf.Bytes()); err != nil {
					return nil, err
				}
				return fileHandle, nil
			}
			return file, nil
		}),
	}))

	customValidator := CustomValidator{Validator: validator.New()}
	if err := customValidator.TransInit(); err != nil {
		logger.Fatal("failed to init custom validator", zap.Error(err))
	}
	e.Validator = &customValidator

	// 公开接口（无需认证）
	publicApi := e.Group("/api")
	{
		// 认证相关
		publicApi.POST("/login", components.AccountHandler.Login)
		publicApi.GET("/auth/config", components.AccountHandler.GetAuthConfig)
		publicApi.GET("/auth/oidc/url", components.AccountHandler.GetOIDCAuthURL)
		publicApi.GET("/auth/github/url", components.AccountHandler.GetGitHubAuthURL)

		// Agent 版本和下载（完全公开，无需任何认证）
		publicApi.GET("/agent/version", components.AgentHandler.GetAgentVersion)
		publicApi.GET("/agent/downloads/:filename", components.AgentHandler.DownloadAgent)
		publicApi.GET("/agent/install.sh", components.AgentHandler.GetInstallScript)
	}

	// 公开接口（支持可选认证）- 已登录返回全部数据，未登录只返回公开数据
	publicApiWithOptionalAuth := e.Group("/api")
	publicApiWithOptionalAuth.Use(OptionalJWTAuthMiddleware(components.AccountHandler))
	{
		// 探针信息（公开访问，支持可选认证）- 用于公共展示页面
		publicApiWithOptionalAuth.GET("/agents", components.AgentHandler.GetAgents)
		publicApiWithOptionalAuth.GET("/agents/:id", components.AgentHandler.Get)
		publicApiWithOptionalAuth.GET("/agents/:id/metrics", components.AgentHandler.GetMetrics)
		publicApiWithOptionalAuth.GET("/agents/:id/metrics/latest", components.AgentHandler.GetLatestMetrics)
		publicApiWithOptionalAuth.GET("/agents/:id/metrics/network-by-interface", components.AgentHandler.GetNetworkMetricsByInterface)

		// 监控统计数据（公开访问，支持可选认证）- 用于公共展示页面
		publicApiWithOptionalAuth.GET("/monitors", components.MonitorHandler.GetMonitors)
		publicApiWithOptionalAuth.GET("/monitors/:id/stats", components.MonitorHandler.GetStatsByID)
		publicApiWithOptionalAuth.GET("/monitors/:id/history", components.MonitorHandler.GetHistoryByID)

		// Logo（公开访问）- 用于公共页面只获取 Logo
		publicApiWithOptionalAuth.GET("/logo", components.PropertyHandler.GetLogo)
	}

	// WebSocket 路由（探针连接）
	e.GET("/ws/agent", components.AgentHandler.HandleWebSocket)

	// 管理员 API 路由（需要认证）
	adminApi := e.Group("/api/admin")
	adminApi.Use(JWTAuthMiddleware(components.AccountHandler))
	{
		// 账户相关
		adminApi.GET("/account/info", components.AccountHandler.GetCurrentUser)
		adminApi.POST("/logout", components.AccountHandler.Logout)

		// API密钥管理
		adminApi.GET("/api-keys", components.ApiKeyHandler.Paging)
		adminApi.POST("/api-keys", components.ApiKeyHandler.Create)
		adminApi.GET("/api-keys/:id", components.ApiKeyHandler.Get)
		adminApi.PUT("/api-keys/:id", components.ApiKeyHandler.Update)
		adminApi.DELETE("/api-keys/:id", components.ApiKeyHandler.Delete)
		adminApi.POST("/api-keys/:id/enable", components.ApiKeyHandler.Enable)
		adminApi.POST("/api-keys/:id/disable", components.ApiKeyHandler.Disable)

		// 探针管理（管理员功能）
		adminApi.GET("/agents", components.AgentHandler.Paging)
		adminApi.GET("/agents/statistics", components.AgentHandler.GetStatistics)
		adminApi.GET("/agents/tags", components.AgentHandler.GetTags)
		adminApi.GET("/agents/:id", components.AgentHandler.GetForAdmin)
		adminApi.PUT("/agents/:id", components.AgentHandler.UpdateInfo)
		adminApi.DELETE("/agents/:id", components.AgentHandler.Delete)
		adminApi.POST("/agents/:id/command", components.AgentHandler.SendCommand)

		// VPS审计结果（管理员访问）
		adminApi.GET("/agents/:id/audit/result", components.AgentHandler.GetAuditResult)
		adminApi.GET("/agents/:id/audit/results", components.AgentHandler.ListAuditResults)

		// 防篡改管理（管理员功能）
		adminApi.GET("/agents/:id/tamper/config", components.TamperHandler.GetTamperConfig)
		adminApi.PUT("/agents/:id/tamper/config", components.TamperHandler.UpdateTamperConfig)
		adminApi.GET("/agents/:id/tamper/events", components.TamperHandler.GetTamperEvents)
		adminApi.GET("/agents/:id/tamper/alerts", components.TamperHandler.GetTamperAlerts)

		// 通用属性管理
		adminApi.GET("/properties/:id", components.PropertyHandler.GetProperty)
		adminApi.PUT("/properties/:id", components.PropertyHandler.SetProperty)
		adminApi.DELETE("/properties/:id", components.PropertyHandler.DeleteProperty)

		// 通知渠道测试（从数据库读取配置测试）
		adminApi.POST("/notification-channels/:type/test", components.PropertyHandler.TestNotificationChannel)

		// 告警配置管理
		adminApi.GET("/agents/:agentId/alert-configs", components.AlertHandler.ListAlertConfigsByAgent)
		adminApi.POST("/alert-configs", components.AlertHandler.CreateAlertConfig)
		adminApi.GET("/alert-configs/:id", components.AlertHandler.GetAlertConfig)
		adminApi.PUT("/alert-configs/:id", components.AlertHandler.UpdateAlertConfig)
		adminApi.DELETE("/alert-configs/:id", components.AlertHandler.DeleteAlertConfig)

		// 告警记录查询
		adminApi.GET("/alert-records", components.AlertHandler.ListAlertRecords)

		// 服务监控配置
		adminApi.GET("/monitors", components.MonitorHandler.List)
		adminApi.POST("/monitors", components.MonitorHandler.Create)
		adminApi.GET("/monitors/:id", components.MonitorHandler.Get)
		adminApi.PUT("/monitors/:id", components.MonitorHandler.Update)
		adminApi.DELETE("/monitors/:id", components.MonitorHandler.Delete)
	}

	// OIDC 认证路由（如果启用）
	publicApi.POST("/auth/oidc/callback", components.AccountHandler.OIDCLogin)

	// GitHub 认证路由（如果启用）
	publicApi.POST("/auth/github/callback", components.AccountHandler.GitHubLogin)
}

func autoMigrate(database *gorm.DB) error {
	// 自动迁移数据库表
	return database.AutoMigrate(
		&models.Agent{},
		&models.ApiKey{},
		&models.CPUMetric{},
		&models.MemoryMetric{},
		&models.DiskMetric{},
		&models.NetworkMetric{},
		&models.LoadMetric{},
		&models.DiskIOMetric{},
		&models.GPUMetric{},
		&models.TemperatureMetric{},
		&models.HostMetric{},
		&models.AuditResult{},
		&models.Property{},
		&models.AlertConfig{},
		&models.AlertRecord{},
		&models.MonitorMetric{},
		&models.MonitorTask{},
		&models.MonitorStats{},
		&models.TamperProtectConfig{},
		&models.TamperEvent{},
		&models.TamperAlert{},
	)
}

// initDefaultProperties 初始化默认属性配置
func initDefaultProperties(ctx context.Context, components *AppComponents, logger *zap.Logger) error {
	// 使用 PropertyService 的初始化方法
	return components.PropertyService.InitializeDefaultConfigs(ctx)
}

func ErrorHandler(logger *zap.Logger) func(next echo.HandlerFunc) echo.HandlerFunc {
	var a = func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if err := next(c); err != nil {
				var he *echo.HTTPError
				if errors.As(err, &he) {
					return c.JSON(he.Code, orz.Map{
						"code":    he.Code,
						"message": err.Error(),
					})
				}

				var oe *orz.Error
				if errors.As(err, &oe) {
					return c.JSON(400, orz.Map{
						"code":    oe.Code,
						"message": err.Error(),
					})
				}

				logger.Sugar().Errorf("[ERROR] %s", err.Error())

				return c.JSON(500, orz.Map{
					"code":    500,
					"message": "Internal Server Error",
				})
			}
			return nil
		}
	}
	return a
}

// startMetricsMonitoring 启动指标监控任务（用于告警检测）
func startMetricsMonitoring(ctx context.Context, components *AppComponents, logger *zap.Logger) {
	logger.Info("启动指标监控任务")

	ticker := time.NewTicker(30 * time.Second) // 每30秒检查一次
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Info("指标监控任务已停止")
			return
		case <-ticker.C:
			// 检查所有在线探针的最新指标
			agents, err := components.AgentService.ListOnlineAgents(ctx)
			if err != nil {
				logger.Error("获取在线探针失败", zap.Error(err))
				continue
			}

			for _, agent := range agents {
				// 获取最新指标
				latest, err := components.AgentService.GetLatestMetrics(ctx, agent.ID)
				if err != nil {
					logger.Debug("获取探针最新指标失败", zap.String("agentId", agent.ID), zap.Error(err))
					continue
				}

				// 提取 CPU、内存、磁盘使用率
				var cpuUsage, memoryUsage, diskUsage float64

				if latest.CPU != nil {
					cpuUsage = latest.CPU.UsagePercent
				}

				if latest.Memory != nil {
					memoryUsage = latest.Memory.UsagePercent
				}

				if latest.Disk != nil {
					diskUsage = latest.Disk.AvgUsagePercent
				}

				// 检查告警规则
				if err := components.AlertService.CheckMetrics(ctx, agent.ID, cpuUsage, memoryUsage, diskUsage); err != nil {
					logger.Error("检查告警规则失败", zap.String("agentId", agent.ID), zap.Error(err))
				}
			}

			// 检查监控相关告警（证书和服务下线）
			if err := components.AlertService.CheckMonitorAlerts(ctx); err != nil {
				logger.Error("检查监控告警失败", zap.Error(err))
			}
		}
	}
}

// startMonitorStatsCalculation 启动监控统计计算任务
func startMonitorStatsCalculation(ctx context.Context, components *AppComponents, logger *zap.Logger) {
	logger.Info("启动监控统计计算任务")

	ticker := time.NewTicker(5 * time.Minute) // 每5分钟计算一次统计数据
	defer ticker.Stop()

	// 首次启动时立即计算一次
	if err := components.MonitorService.CalculateMonitorStats(ctx); err != nil {
		logger.Error("计算监控统计数据失败", zap.Error(err))
	} else {
		logger.Info("监控统计数据计算完成")
	}

	for {
		select {
		case <-ctx.Done():
			logger.Info("监控统计计算任务已停止")
			return
		case <-ticker.C:
			if err := components.MonitorService.CalculateMonitorStats(ctx); err != nil {
				logger.Error("计算监控统计数据失败", zap.Error(err))
			} else {
				logger.Debug("监控统计数据计算完成")
			}
		}
	}
}

// JWTAuthMiddleware JWT 认证中间件（必须登录）
func JWTAuthMiddleware(accountHandler *handler.AccountHandler) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// 从 Authorization header 获取 token
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "未提供认证令牌")
			}

			// 检查 Bearer 前缀
			const bearerPrefix = "Bearer "
			if len(authHeader) < len(bearerPrefix) || authHeader[:len(bearerPrefix)] != bearerPrefix {
				return echo.NewHTTPError(http.StatusUnauthorized, "认证令牌格式错误")
			}

			tokenString := authHeader[len(bearerPrefix):]

			// 验证 token
			claims, err := accountHandler.ValidateToken(tokenString)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "认证令牌无效: "+err.Error())
			}

			// 将用户信息存入 context
			c.Set("userID", claims.UserID)
			c.Set("username", claims.Username)
			c.Set("authenticated", true)

			return next(c)
		}
	}
}

// OptionalJWTAuthMiddleware 可选 JWT 认证中间件（尝试解析 token，但不强制要求）
func OptionalJWTAuthMiddleware(accountHandler *handler.AccountHandler) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// 从 Authorization header 获取 token
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader != "" {
				// 检查 Bearer 前缀
				const bearerPrefix = "Bearer "
				if len(authHeader) >= len(bearerPrefix) && authHeader[:len(bearerPrefix)] == bearerPrefix {
					tokenString := authHeader[len(bearerPrefix):]

					// 尝试验证 token
					claims, err := accountHandler.ValidateToken(tokenString)
					if err == nil {
						// token 有效，将用户信息存入 context
						c.Set("userID", claims.UserID)
						c.Set("username", claims.Username)
						c.Set("authenticated", true)
					}
				}
			}

			// 无论 token 是否有效，都继续处理请求
			return next(c)
		}
	}
}

// APIKeyAuthMiddleware 使用 API Key 进行认证
