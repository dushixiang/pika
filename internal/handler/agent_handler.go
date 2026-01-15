package handler

import (
	"github.com/dushixiang/pika/internal/service"
	ws "github.com/dushixiang/pika/internal/websocket"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

type AgentHandler struct {
	logger          *zap.Logger
	agentService    *service.AgentService
	trafficService  *service.TrafficService
	metricService   *service.MetricService
	monitorSvc      *service.MonitorService
	tamperService   *service.TamperService
	ddnsService     *service.DDNSService
	sshLoginService *service.SSHLoginService
	apiKeyService   *service.ApiKeyService
	wsManager       *ws.Manager
	upgrader        websocket.Upgrader
}

func NewAgentHandler(logger *zap.Logger, agentService *service.AgentService, trafficService *service.TrafficService,
	metricService *service.MetricService, monitorService *service.MonitorService, tamperService *service.TamperService,
	ddnsService *service.DDNSService, sshLoginService *service.SSHLoginService, apiKeyService *service.ApiKeyService, wsManager *ws.Manager) *AgentHandler {

	h := &AgentHandler{
		logger:          logger,
		agentService:    agentService,
		trafficService:  trafficService,
		metricService:   metricService,
		monitorSvc:      monitorService,
		tamperService:   tamperService,
		ddnsService:     ddnsService,
		sshLoginService: sshLoginService,
		apiKeyService:   apiKeyService,
		wsManager:       wsManager,
	}

	// 初始化upgrader，需要在创建handler之后因为需要引用h.checkOrigin
	h.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024 * 32,
		WriteBufferSize: 1024 * 32,
	}

	// 设置WebSocket消息处理器
	wsManager.SetMessageHandler(h.handleWebSocketMessage)

	return h
}
