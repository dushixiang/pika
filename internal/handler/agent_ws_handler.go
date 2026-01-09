package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/dushixiang/pika/internal/protocol"
	ws "github.com/dushixiang/pika/internal/websocket"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
)

// HandleWebSocket 处理WebSocket连接
func (h *AgentHandler) HandleWebSocket(c echo.Context) error {
	conn, err := h.upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		h.logger.Error("failed to upgrade websocket", zap.Error(err))
		return err
	}

	registerReq, err := h.readRegisterRequest(conn)
	if err != nil {
		conn.Close()
		return err
	}

	// 注册探针 - 使用独立的context,不依赖HTTP请求的context
	agent, err := h.agentService.RegisterAgent(context.Background(), c.RealIP(), &registerReq.AgentInfo, registerReq.ApiKey)
	if err != nil {
		// 发送注册失败响应
		h.sendRegisterError(conn, err.Error())
		conn.Close()
		return err
	}

	defer func() {
		h.markAgentOffline(agent.ID)
	}()

	// 发送注册成功响应
	if err := h.sendRegisterSuccess(conn, agent.ID); err != nil {
		h.logger.Error("failed to send register ack", zap.Error(err))
		conn.Close()
		return err
	}

	// 下发防篡改配置
	if err := h.sendTamperConfig(conn, agent.ID); err != nil {
		h.logger.Error("failed to send tamper config", zap.Error(err))
		// 配置下发失败不中断连接，只记录日志
	}

	// 创建客户端并注册到管理器
	client := h.newClient(agent.ID, conn)

	h.wsManager.Register(client)

	// 启动读写协程
	go client.WritePump()
	client.ReadPump(context.Background())
	return nil
}

// handleWebSocketMessage 处理WebSocket消息
func (h *AgentHandler) handleWebSocketMessage(ctx context.Context, agentID string, messageType string, data json.RawMessage) error {
	switch protocol.MessageType(messageType) {
	case protocol.MessageTypeHeartbeat:
		return h.handleHeartbeatMessage(ctx, agentID)

	case protocol.MessageTypeMetrics:
		return h.handleMetricsMessage(ctx, agentID, data)

	case protocol.MessageTypeCommandResp:
		return h.handleCommandResponseMessage(ctx, agentID, data)

	case protocol.MessageTypeTamperEvent:
		return h.handleTamperEventMessage(ctx, agentID, data)

	case protocol.MessageTypeDDNSIPReport:
		return h.handleDDNSIPReportMessage(ctx, agentID, data)

	case protocol.MessageTypeSSHLoginEvent:
		return h.handleSSHLoginEventMessage(agentID, data)

	case protocol.MessageTypeSSHLoginConfigResult:
		return h.handleSSHLoginConfigResultMessage(agentID, data)

	case protocol.MessageTypeTamperProtect:
		return h.handleTamperProtectMessage(agentID, data)

	default:
		h.logger.Warn("unknown message type", zap.String("type", messageType))
		return nil
	}
}

func (h *AgentHandler) readRegisterRequest(conn *websocket.Conn) (*protocol.RegisterRequest, error) {
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, message, err := conn.ReadMessage()
	if err != nil {
		h.logger.Error("failed to read register message", zap.Error(err))
		return nil, err
	}

	conn.SetReadDeadline(time.Time{})

	var msg protocol.InputMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		h.logger.Error("failed to parse register message", zap.Error(err))
		return nil, err
	}

	if msg.Type != protocol.MessageTypeRegister {
		h.logger.Error("first message must be register", zap.String("type", string(msg.Type)))
		return nil, echo.NewHTTPError(http.StatusBadRequest, "首条消息必须是注册消息")
	}

	var registerReq protocol.RegisterRequest
	if err := json.Unmarshal(msg.Data, &registerReq); err != nil {
		h.logger.Error("failed to parse register request", zap.Error(err))
		return nil, err
	}

	return &registerReq, nil
}

func (h *AgentHandler) markAgentOffline(agentID string) {
	_ = h.agentService.UpdateAgentStatus(context.Background(), agentID, 0)
}

func (h *AgentHandler) newClient(agentID string, conn *websocket.Conn) *ws.Client {
	return &ws.Client{
		ID:         agentID,
		Conn:       conn,
		Send:       make(chan []byte, 256),
		Manager:    h.wsManager,
		LastActive: time.Now(),
	}
}

func (h *AgentHandler) handleHeartbeatMessage(ctx context.Context, agentID string) error {
	return h.agentService.UpdateAgentStatus(ctx, agentID, 1)
}

func (h *AgentHandler) handleMetricsMessage(ctx context.Context, agentID string, data json.RawMessage) error {
	var metricsWrapper protocol.MetricsPayload
	if err := json.Unmarshal(data, &metricsWrapper); err != nil {
		return err
	}
	metricsData, err := json.Marshal(metricsWrapper.Data)
	if err != nil {
		return err
	}
	return h.metricService.HandleMetricData(ctx, agentID, string(metricsWrapper.Type), json.RawMessage(metricsData))
}

func (h *AgentHandler) handleCommandResponseMessage(ctx context.Context, agentID string, data json.RawMessage) error {
	var cmdResp protocol.CommandResponse
	if err := json.Unmarshal(data, &cmdResp); err != nil {
		return err
	}
	return h.agentService.HandleCommandResponse(ctx, agentID, &cmdResp)
}

func (h *AgentHandler) handleTamperEventMessage(ctx context.Context, agentID string, data json.RawMessage) error {
	var eventData protocol.TamperEventData
	if err := json.Unmarshal(data, &eventData); err != nil {
		h.logger.Error("failed to unmarshal tamper event", zap.Error(err))
		return err
	}
	return h.tamperService.CreateEvent(ctx, agentID, &eventData)
}

func (h *AgentHandler) handleDDNSIPReportMessage(ctx context.Context, agentID string, data json.RawMessage) error {
	var ipReport protocol.DDNSIPReportData
	if err := json.Unmarshal(data, &ipReport); err != nil {
		h.logger.Error("failed to unmarshal ddns ip report", zap.Error(err))
		return err
	}
	return h.ddnsService.HandleIPReport(ctx, agentID, &ipReport)
}

func (h *AgentHandler) handleSSHLoginEventMessage(agentID string, data json.RawMessage) error {
	var eventData protocol.SSHLoginEvent
	if err := json.Unmarshal(data, &eventData); err != nil {
		h.logger.Error("failed to unmarshal ssh login event", zap.Error(err))
		return err
	}
	return h.sshLoginService.HandleEvent(agentID, eventData)
}

func (h *AgentHandler) handleSSHLoginConfigResultMessage(agentID string, data json.RawMessage) error {
	var resultData protocol.SSHLoginConfigResult
	if err := json.Unmarshal(data, &resultData); err != nil {
		h.logger.Error("failed to unmarshal ssh login config result", zap.Error(err))
		return err
	}
	return h.sshLoginService.HandleConfigResult(agentID, resultData)
}

func (h *AgentHandler) handleTamperProtectMessage(agentID string, data json.RawMessage) error {
	var protectResp protocol.TamperProtectResponse
	if err := json.Unmarshal(data, &protectResp); err != nil {
		h.logger.Error("failed to unmarshal tamper protect response", zap.Error(err))
		return err
	}
	if protectResp.Success {
		h.logger.Info("tamper protect config applied successfully",
			zap.String("agentID", agentID),
			zap.String("message", protectResp.Message),
			zap.Int("current_paths", len(protectResp.Paths)),
			zap.Int("added", len(protectResp.Added)),
			zap.Int("removed", len(protectResp.Removed)))
	} else {
		h.logger.Error("tamper protect config apply failed",
			zap.String("agentID", agentID),
			zap.String("message", protectResp.Message))
	}
	return nil
}

// sendRegisterSuccess 发送注册成功响应
func (h *AgentHandler) sendRegisterSuccess(conn *websocket.Conn, agentID string) error {
	resp := protocol.RegisterResponse{
		AgentID: agentID,
		Status:  "success",
	}
	return conn.WriteJSON(protocol.OutboundMessage{
		Type: protocol.MessageTypeRegisterAck,
		Data: resp,
	})
}

// sendRegisterError 发送注册失败响应
func (h *AgentHandler) sendRegisterError(conn *websocket.Conn, errMsg string) error {
	resp := protocol.RegisterResponse{
		Status:  "error",
		Message: errMsg,
	}

	return conn.WriteJSON(protocol.OutboundMessage{
		Type: protocol.MessageTypeRegisterErr,
		Data: resp,
	})
}

// sendTamperConfig 发送防篡改配置（探针初始化时发送完整配置作为新增）
func (h *AgentHandler) sendTamperConfig(conn *websocket.Conn, agentID string) error {
	// 获取探针的防篡改配置
	config, err := h.tamperService.GetConfigByAgentID(agentID)
	if err != nil {
		return err
	}

	// 构建配置数据 - 将完整配置作为新增发送（探针刚连接，所有路径都是新增）
	var paths []string
	if config != nil && len(config.Paths) > 0 {
		paths = config.Paths
	} else {
		paths = []string{} // 空列表
	}

	// 使用增量配置格式，将所有路径作为新增
	configData := protocol.TamperProtectConfig{
		Added:   paths,
		Removed: []string{}, // 初始化时没有需要移除的
	}

	msgData, err := json.Marshal(protocol.OutboundMessage{
		Type: protocol.MessageTypeTamperProtect,
		Data: configData,
	})
	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.TextMessage, msgData)
}
