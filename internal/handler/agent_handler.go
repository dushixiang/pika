package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/dushixiang/pika"
	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/service"
	"github.com/dushixiang/pika/internal/utils"
	ws "github.com/dushixiang/pika/internal/websocket"
	"github.com/dushixiang/pika/pkg/version"
	"github.com/go-orz/orz"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
)

type AgentHandler struct {
	logger          *zap.Logger
	agentService    *service.AgentService
	metricService   *service.MetricService
	monitorSvc      *service.MonitorService
	tamperService   *service.TamperService
	ddnsService     *service.DDNSService
	sshLoginService *service.SSHLoginService
	wsManager       *ws.Manager
	upgrader        websocket.Upgrader
}

func NewAgentHandler(logger *zap.Logger, agentService *service.AgentService, metricService *service.MetricService,
	monitorService *service.MonitorService, tamperService *service.TamperService, ddnsService *service.DDNSService,
	sshLoginService *service.SSHLoginService, wsManager *ws.Manager) *AgentHandler {

	h := &AgentHandler{
		logger:          logger,
		agentService:    agentService,
		metricService:   metricService,
		monitorSvc:      monitorService,
		tamperService:   tamperService,
		ddnsService:     ddnsService,
		sshLoginService: sshLoginService,
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

// HandleWebSocket 处理WebSocket连接
func (h *AgentHandler) HandleWebSocket(c echo.Context) error {
	conn, err := h.upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		h.logger.Error("failed to upgrade websocket", zap.Error(err))
		return err
	}

	// 等待探针发送注册信息
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, message, err := conn.ReadMessage()
	if err != nil {
		h.logger.Error("failed to read register message", zap.Error(err))
		conn.Close()
		return err
	}

	// 清除读取超时，后续由心跳机制控制
	conn.SetReadDeadline(time.Time{})

	// 解析注册消息
	var msg protocol.InputMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		h.logger.Error("failed to parse register message", zap.Error(err))
		conn.Close()
		return err
	}

	if msg.Type != protocol.MessageTypeRegister {
		h.logger.Error("first message must be register", zap.String("type", string(msg.Type)))
		conn.Close()
		return echo.NewHTTPError(http.StatusBadRequest, "首条消息必须是注册消息")
	}

	// 解析探针注册信息
	var registerReq protocol.RegisterRequest
	if err := json.Unmarshal(msg.Data, &registerReq); err != nil {
		h.logger.Error("failed to parse register request", zap.Error(err))
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
		// 设置探针状态为离线
		_ = h.agentService.UpdateAgentStatus(context.Background(), agent.ID, 0)
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
	client := &ws.Client{
		ID:         agent.ID,
		Conn:       conn,
		Send:       make(chan []byte, 256),
		Manager:    h.wsManager,
		LastActive: time.Now(),
	}

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
		// 心跳消息，更新探针状态
		return h.agentService.UpdateAgentStatus(ctx, agentID, 1)

	case protocol.MessageTypeMetrics:
		// 指标数据
		var metricsWrapper protocol.MetricsPayload
		if err := json.Unmarshal(data, &metricsWrapper); err != nil {
			return err
		}
		metricsData, err := json.Marshal(metricsWrapper.Data)
		if err != nil {
			return err
		}
		return h.metricService.HandleMetricData(ctx, agentID, string(metricsWrapper.Type), json.RawMessage(metricsData))

	case protocol.MessageTypeCommandResp:
		// 指令响应
		var cmdResp protocol.CommandResponse
		if err := json.Unmarshal(data, &cmdResp); err != nil {
			return err
		}
		return h.agentService.HandleCommandResponse(ctx, agentID, &cmdResp)

	case protocol.MessageTypeTamperEvent:
		// 防篡改事件
		var eventData protocol.TamperEventData
		if err := json.Unmarshal(data, &eventData); err != nil {
			h.logger.Error("failed to unmarshal tamper event", zap.Error(err))
			return err
		}
		return h.tamperService.CreateEvent(agentID, eventData.Path, eventData.Operation, eventData.Details, eventData.Timestamp)

	case protocol.MessageTypeDDNSIPReport:
		// DDNS IP 上报 - 异步处理，避免阻塞 WebSocket 消息循环
		var ipReport protocol.DDNSIPReportData
		if err := json.Unmarshal(data, &ipReport); err != nil {
			h.logger.Error("failed to unmarshal ddns ip report", zap.Error(err))
			return err
		}
		return h.ddnsService.HandleIPReport(ctx, agentID, &ipReport)

	case protocol.MessageTypeSSHLoginEvent:
		// SSH 登录事件
		var eventData protocol.SSHLoginEvent
		if err := json.Unmarshal(data, &eventData); err != nil {
			h.logger.Error("failed to unmarshal ssh login event", zap.Error(err))
			return err
		}
		return h.sshLoginService.HandleEvent(agentID, eventData)

	case protocol.MessageTypeSSHLoginConfigResult:
		// SSH 登录监控配置应用结果
		var resultData protocol.SSHLoginConfigResult
		if err := json.Unmarshal(data, &resultData); err != nil {
			h.logger.Error("failed to unmarshal ssh login config result", zap.Error(err))
			return err
		}
		return h.sshLoginService.HandleConfigResult(agentID, resultData)

	case protocol.MessageTypeTamperProtect:
		// 防篡改配置响应
		var protectResp protocol.TamperProtectResponse
		if err := json.Unmarshal(data, &protectResp); err != nil {
			h.logger.Error("failed to unmarshal tamper protect response", zap.Error(err))
			return err
		}
		// 记录探针的配置应用结果
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

	default:
		h.logger.Warn("unknown message type", zap.String("type", messageType))
		return nil
	}
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

// Paging 探针分页查询
func (h *AgentHandler) Paging(c echo.Context) error {
	status := c.QueryParam("status")

	pr := orz.GetPageRequest(c, "name")

	builder := orz.NewPageBuilder(h.agentService.AgentRepo.Repository).
		PageRequest(pr).
		Contains("name", c.QueryParam("name")).
		Contains("hostname", c.QueryParam("hostname")).
		Contains("ip", c.QueryParam("ip"))

	// 处理状态筛选
	if status == "online" {
		builder.Equal("status", "1")
	} else if status == "offline" {
		builder.Equal("status", "0")
	}

	ctx := c.Request().Context()
	page, err := builder.Execute(ctx)
	if err != nil {
		return err
	}
	return orz.Ok(c, page)
}

// Get 获取探针详情（公开接口，已登录返回全部，未登录返回公开可见）
func (h *AgentHandler) Get(c echo.Context) error {
	id := c.Param("id")
	ctx := c.Request().Context()

	// 根据认证状态返回相应的探针
	isAuthenticated := utils.IsAuthenticated(c)
	agent, err := h.agentService.GetAgentByAuth(ctx, id, isAuthenticated)
	if err != nil {
		return err
	}

	// 未登录时隐藏敏感信息
	if !isAuthenticated {
		agent.IP = ""
		agent.Hostname = ""
	}

	return orz.Ok(c, agent)
}

// GetForAdmin 获取探针详情（管理员接口，显示完整信息）
func (h *AgentHandler) GetForAdmin(c echo.Context) error {
	id := c.Param("id")
	ctx := c.Request().Context()

	agent, err := h.agentService.GetAgent(ctx, id)
	if err != nil {
		return err
	}

	return orz.Ok(c, agent)
}

// parseTimeRange 解析时间范围参数，返回起始和结束时间（毫秒）
func parseTimeRange(rangeParam string) (start, end int64, err error) {
	end = time.Now().UnixMilli()

	if rangeParam == "" {
		rangeParam = "1h" // 默认1小时
	}

	switch rangeParam {
	case "1m":
		start = end - 1*60*1000
	case "5m":
		start = end - 5*60*1000
	case "15m":
		start = end - 15*60*1000
	case "30m":
		start = end - 30*60*1000
	case "1h":
		start = end - 60*60*1000
	case "3h":
		start = end - 3*60*60*1000
	case "6h":
		start = end - 6*60*60*1000
	case "12h":
		start = end - 12*60*60*1000
	case "1d", "24h":
		start = end - 24*60*60*1000
	case "3d":
		start = end - 3*24*60*60*1000
	case "7d":
		start = end - 7*24*60*60*1000
	case "30d":
		start = end - 30*24*60*60*1000
	default:
		return 0, 0, fmt.Errorf("无效的时间范围，支持: 1m, 5m, 15m, 30m, 1h, 3h, 6h, 12h, 1d/24h, 3d, 7d, 30d")
	}

	return start, end, nil
}

func parseTimeRangeOrStartEnd(rangeParam, startParam, endParam string) (start, end int64, err error) {
	if startParam != "" || endParam != "" {
		if startParam == "" || endParam == "" {
			return 0, 0, fmt.Errorf("start 和 end 必须同时提供")
		}

		start, err = strconv.ParseInt(startParam, 10, 64)
		if err != nil {
			return 0, 0, fmt.Errorf("无效的 start 时间戳")
		}

		end, err = strconv.ParseInt(endParam, 10, 64)
		if err != nil {
			return 0, 0, fmt.Errorf("无效的 end 时间戳")
		}

		if start >= end {
			return 0, 0, fmt.Errorf("start 必须小于 end")
		}

		return start, end, nil
	}

	return parseTimeRange(rangeParam)
}

// GetMetrics 获取探针聚合指标（公开接口，已登录返回全部，未登录返回公开可见）
func (h *AgentHandler) GetMetrics(c echo.Context) error {
	agentID := c.Param("id")
	ctx := c.Request().Context()

	// 验证探针访问权限
	if _, err := h.agentService.GetAgentByAuth(ctx, agentID, utils.IsAuthenticated(c)); err != nil {
		return err
	}

	metricType := c.QueryParam("type")
	rangeParam := c.QueryParam("range")
	startParam := c.QueryParam("start")
	endParam := c.QueryParam("end")
	interfaceName := c.QueryParam("interface") // 网卡过滤参数（仅对 network 类型有效）
	if interfaceName == "" {
		interfaceName = "all"
	}
	aggregation := normalizeAggregation(c.QueryParam("aggregation"))

	// 验证指标类型
	validTypes := map[string]bool{
		"cpu": true, "memory": true, "disk": true, "network": true, "network_connection": true,
		"disk_io": true, "gpu": true, "temperature": true, "monitor": true,
	}
	if metricType == "" {
		return orz.NewError(400, "指标类型不能为空")
	}
	if !validTypes[metricType] {
		return orz.NewError(400, "无效的指标类型")
	}

	// 解析时间范围
	start, end, err := parseTimeRangeOrStartEnd(rangeParam, startParam, endParam)
	if err != nil {
		return orz.NewError(400, err.Error())
	}

	// GetMetrics 内部会自动计算最优聚合间隔
	metrics, err := h.metricService.GetMetrics(ctx, agentID, metricType, start, end, interfaceName, aggregation)
	if err != nil {
		return err
	}

	// 直接返回 GetMetricsResponse，避免额外嵌套
	return orz.Ok(c, metrics)
}

// GetLatestMetrics 获取探针最新指标（公开接口，已登录返回全部，未登录返回公开可见）
func (h *AgentHandler) GetLatestMetrics(c echo.Context) error {
	id := c.Param("id")
	ctx := c.Request().Context()

	// 验证探针访问权限
	if _, err := h.agentService.GetAgentByAuth(ctx, id, utils.IsAuthenticated(c)); err != nil {
		return err
	}

	metrics, ok := h.metricService.GetLatestMetrics(id)
	if !ok {
		return orz.NewError(404, "探针最新指标不存在")
	}

	return orz.Ok(c, metrics)
}

// GetAvailableNetworkInterfaces 获取探针的可用网卡列表（公开接口，已登录返回全部，未登录返回公开可见）
func (h *AgentHandler) GetAvailableNetworkInterfaces(c echo.Context) error {
	id := c.Param("id")
	ctx := c.Request().Context()

	// 验证探针访问权限
	if _, err := h.agentService.GetAgentByAuth(ctx, id, utils.IsAuthenticated(c)); err != nil {
		return err
	}

	interfaces, err := h.metricService.GetAvailableNetworkInterfaces(ctx, id)
	if err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"interfaces": interfaces,
	})
}

// GetAgents 获取探针列表（公开接口，已登录返回全部，未登录返回公开可见）
func (h *AgentHandler) GetAgents(c echo.Context) error {
	ctx := c.Request().Context()

	// 根据认证状态返回相应的探针列表
	agents, err := h.agentService.ListByAuth(ctx, utils.IsAuthenticated(c))
	if err != nil {
		return err
	}

	slices.SortFunc(agents, func(a, b models.Agent) int {
		if a.Status == b.Status {
			return strings.Compare(a.Name, b.Name)
		}
		return strings.Compare(strconv.Itoa(b.Status), strconv.Itoa(a.Status))
	})

	// 添加连接状态和最新指标
	result := make([]map[string]interface{}, 0, len(agents))
	for _, agent := range agents {
		item := map[string]interface{}{
			"id":         agent.ID,
			"name":       agent.Name,
			"os":         agent.OS,
			"arch":       agent.Arch,
			"version":    agent.Version,
			"tags":       agent.Tags,
			"expireTime": agent.ExpireTime,
			"status":     agent.Status,
			"lastSeenAt": agent.LastSeenAt,
			"visibility": agent.Visibility,
		}

		// 添加流量统计数据
		trafficStats := agent.TrafficStats.Data()
		item["trafficLimit"] = trafficStats.Limit
		item["trafficUsed"] = trafficStats.Used
		item["trafficResetDay"] = trafficStats.ResetDay
		item["trafficPeriodStart"] = trafficStats.PeriodStart
		item["trafficBaselineRecv"] = trafficStats.BaselineRecv
		item["trafficAlertSent80"] = trafficStats.AlertSent80
		item["trafficAlertSent90"] = trafficStats.AlertSent90
		item["trafficAlertSent100"] = trafficStats.AlertSent100

		// 获取最新指标数据
		metrics, ok := h.metricService.GetLatestMetrics(agent.ID)
		if ok {
			item["metrics"] = metrics
		}

		result = append(result, item)
	}

	return orz.Ok(c, orz.Map{
		"items": result,
		"total": len(result),
	})
}

// GetAgentVersion 获取 Agent 版本信息
func (h *AgentHandler) GetAgentVersion(c echo.Context) error {
	return orz.Ok(c, orz.Map{
		"version": version.GetAgentVersion(),
	})
}

// DownloadAgent 下载 Agent 二进制文件
func (h *AgentHandler) DownloadAgent(c echo.Context) error {
	filename := c.Param("filename")

	// 从嵌入的文件系统读取
	agentFile, err := pika.AgentFS().Open(fmt.Sprintf("pika-%s", filename))
	if err != nil {
		h.logger.Error("agent binary not found", zap.String("filename", filename), zap.Error(err))
		return orz.NewError(404, "未找到对应平台的 Agent 二进制文件")
	}

	// 设置响应头
	c.Response().Header().Set("Content-Type", "application/octet-stream")
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	return c.Stream(http.StatusOK, "application/octet-stream", agentFile)
}

// SendCommand 向探针发送指令
func (h *AgentHandler) SendCommand(c echo.Context) error {
	agentID := c.Param("id")
	cmdType := c.QueryParam("type")

	if cmdType == "" {
		return orz.NewError(400, "指令类型不能为空")
	}

	// 检查agent是否在线
	_, exists := h.wsManager.GetClient(agentID)
	if !exists {
		return orz.NewError(400, "探针未连接")
	}

	// 生成指令ID
	cmdID := fmt.Sprintf("%s_%d", cmdType, time.Now().UnixMilli())

	// 构建指令请求
	cmdReq := protocol.CommandRequest{
		ID:   cmdID,
		Type: cmdType,
	}

	msgData, err := json.Marshal(protocol.OutboundMessage{
		Type: protocol.MessageTypeCommand,
		Data: cmdReq,
	})
	if err != nil {
		return err
	}

	// 发送指令
	if err := h.wsManager.SendToClient(agentID, msgData); err != nil {
		return orz.NewError(500, "发送指令失败")
	}

	h.logger.Info("command sent", zap.String("agentID", agentID), zap.String("cmdID", cmdID), zap.String("type", cmdType))

	return orz.Ok(c, orz.Map{
		"commandId": cmdID,
		"status":    "sent",
	})
}

// GetAuditResult 获取审计结果(原始数据)
func (h *AgentHandler) GetAuditResult(c echo.Context) error {
	agentID := c.Param("id")
	ctx := c.Request().Context()

	result, err := h.agentService.GetAuditResult(ctx, agentID)
	if err != nil {
		return err
	}

	return orz.Ok(c, result)
}

// ListAuditResults 获取审计结果列表
func (h *AgentHandler) ListAuditResults(c echo.Context) error {
	agentID := c.Param("id")
	ctx := c.Request().Context()

	results, err := h.agentService.ListAuditResults(ctx, agentID)
	if err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"items": results,
		"total": len(results),
	})
}

// UpdateInfo 更新探针信息（名称、标签、到期时间、可见性）
func (h *AgentHandler) UpdateInfo(c echo.Context) error {
	agentID := c.Param("id")

	var req struct {
		Name       string   `json:"name"`
		Tags       []string `json:"tags"`
		ExpireTime int64    `json:"expireTime"`
		Visibility string   `json:"visibility"`
	}
	if err := c.Bind(&req); err != nil {
		return orz.NewError(400, "请求参数错误")
	}

	ctx := c.Request().Context()
	agent, err := h.agentService.AgentRepo.FindById(ctx, agentID)
	if err != nil {
		return err
	}
	// 更新字段
	agent.Name = req.Name
	agent.Tags = req.Tags
	agent.ExpireTime = req.ExpireTime
	agent.Visibility = req.Visibility
	agent.UpdatedAt = time.Now().UnixMilli()

	if err := h.agentService.AgentRepo.Save(ctx, &agent); err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"message": "更新成功",
	})
}

// GetStatistics 获取探针统计数据
func (h *AgentHandler) GetStatistics(c echo.Context) error {
	ctx := c.Request().Context()
	stats, err := h.agentService.GetStatistics(ctx)
	if err != nil {
		return err
	}

	return orz.Ok(c, stats)
}

// Delete 删除探针
func (h *AgentHandler) Delete(c echo.Context) error {
	agentID := c.Param("id")
	ctx := c.Request().Context()

	// 检查探针是否存在
	agent, err := h.agentService.GetAgent(ctx, agentID)
	if err != nil {
		return err
	}

	// 如果探针在线，先发送卸载指令，然后断开连接
	if client, exists := h.wsManager.GetClient(agentID); exists {
		// 构建卸载消息
		uninstallMsg, err := json.Marshal(protocol.OutboundMessage{
			Type: protocol.MessageTypeUninstall,
			Data: struct{}{}, // 空数据，卸载指令不需要额外参数
		})
		if err == nil {
			// 发送卸载指令（忽略发送错误，继续删除流程）
			if err := h.wsManager.SendToClient(agentID, uninstallMsg); err != nil {
				h.logger.Warn("发送卸载指令失败",
					zap.String("agentID", agentID),
					zap.Error(err))
			} else {
				h.logger.Info("已向探针发送卸载指令",
					zap.String("agentID", agentID),
					zap.String("name", agent.Name))
				// 等待一小段时间让探针处理卸载消息
				time.Sleep(500 * time.Millisecond)
			}
		}

		// 断开连接
		client.Conn.Close()
	}

	// 删除探针及其所有相关数据
	if err := h.agentService.DeleteAgent(ctx, agentID); err != nil {
		h.logger.Error("删除探针失败",
			zap.String("agentID", agentID),
			zap.String("name", agent.Name),
			zap.Error(err))
		return err
	}

	h.logger.Info("探针已删除",
		zap.String("agentID", agentID),
		zap.String("name", agent.Name))

	return orz.Ok(c, orz.Map{
		"message": "删除成功",
	})
}

// GetTags 获取所有探针的标签
func (h *AgentHandler) GetTags(c echo.Context) error {
	ctx := c.Request().Context()

	tags, err := h.agentService.GetAllTags(ctx)
	if err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"tags": tags,
	})
}

// getServerURL 获取服务器地址（支持反向代理）
func getServerURL(c echo.Context) string {
	// 优先读取 X-Forwarded-Proto 和 X-Forwarded-Host
	scheme := c.Request().Header.Get("X-Forwarded-Proto")
	host := c.Request().Header.Get("X-Forwarded-Host")

	// 如果没有反向代理头部，使用默认值
	if scheme == "" {
		scheme = c.Scheme()
	}
	if host == "" {
		host = c.Request().Host
	}

	return scheme + "://" + host
}

func (h *AgentHandler) GetServerUrl(c echo.Context) error {
	serverUrl := getServerURL(c)
	return orz.Ok(c, orz.Map{
		"serverUrl": serverUrl,
	})
}

// GetInstallScript 生成自动安装脚本
func (h *AgentHandler) GetInstallScript(c echo.Context) error {
	token := c.QueryParam("token")
	if token == "" {
		return orz.NewError(400, "token不能为空")
	}

	// 使用统一的 getServerURL 函数获取服务器地址（支持反向代理）
	serverUrl := getServerURL(c)

	script := `#!/bin/bash
set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 检测操作系统和架构
detect_platform() {
    OS=$(uname -s | awk '{print tolower($0)}')
    ARCH=$(uname -m)

    case "$ARCH" in
        x86_64)
            ARCH="amd64"
            ;;
        aarch64|arm64|armv8*)
            ARCH="arm64"
            ;;
        armv7*|armv7l)
            ARCH="armv7"
            ;;
        loongarch64)
            ARCH="loong64"
            ;;
        *)
            echo_error "不支持的架构: $ARCH"
            exit 1
            ;;
    esac

    case "$OS" in
        linux)
            PLATFORM="linux-$ARCH"
            AGENT_NAME="pika-agent"
            ;;
        darwin)
            PLATFORM="darwin-$ARCH"
            AGENT_NAME="pika-agent"
            ;;
        *)
            echo_error "不支持的操作系统: $OS"
            exit 1
            ;;
    esac

    echo_info "检测到平台: $PLATFORM"
}

# 下载探针
download_agent() {
    local download_url="` + serverUrl + `/api/agent/downloads/agent-$PLATFORM"
    local temp_file="/tmp/pika-agent-download"

    echo_info "正在下载探针..."

    if command -v curl &> /dev/null; then
        curl -# -L "$download_url" -o "$temp_file"
    elif command -v wget &> /dev/null; then
        wget -q "$download_url" -O "$temp_file"
    else
        echo_error "未找到 wget 或 curl 命令，请先安装其中之一"
        exit 1
    fi

    if [ ! -f "$temp_file" ]; then
        echo_error "下载失败"
        exit 1
    fi

    # 移动到目标位置
    mv "$temp_file" "/usr/local/bin/$AGENT_NAME"
    chmod +x "/usr/local/bin/$AGENT_NAME"

    echo_info "探针下载完成: /usr/local/bin/$AGENT_NAME"
}

# 注册并启动服务
register_agent() {
    local endpoint="` + serverUrl + `"
    local token="` + token + `"

    echo_info "正在注册探针..."
    /usr/local/bin/$AGENT_NAME register --endpoint "$endpoint" --token "$token" --yes
}

# 主流程
main() {
    echo_info "开始安装 Pika Agent..."
    echo ""

    detect_platform
    download_agent
    register_agent

    echo ""
    echo_info "=========================================="
    echo_info "安装完成！"
    echo_info "=========================================="
    echo ""
    echo_info "常用命令："
    echo "  查看状态: pika-agent status"
    echo "  启动服务: pika-agent start"
    echo "  停止服务: pika-agent stop"
    echo "  重启服务: pika-agent restart"
    echo "  卸载服务: pika-agent uninstall"
    echo ""
}

main`

	c.Response().Header().Set("Content-Type", "text/plain; charset=utf-8")
	return c.String(http.StatusOK, script)
}

// BatchUpdateTags 批量更新探针标签
func (h *AgentHandler) BatchUpdateTags(c echo.Context) error {
	var req struct {
		AgentIDs  []string `json:"agentIds"`
		Tags      []string `json:"tags"`
		Operation string   `json:"operation"` // "add", "remove", "replace"
	}

	if err := c.Bind(&req); err != nil {
		return orz.NewError(400, "请求参数错误")
	}

	if len(req.AgentIDs) == 0 {
		return orz.NewError(400, "探针ID列表不能为空")
	}

	// 验证操作类型
	validOperations := map[string]bool{"add": true, "remove": true, "replace": true}
	if req.Operation == "" {
		req.Operation = "replace"
	}
	if !validOperations[req.Operation] {
		return orz.NewError(400, "不支持的操作类型")
	}

	ctx := c.Request().Context()
	if err := h.agentService.BatchUpdateTags(ctx, req.AgentIDs, req.Tags, req.Operation); err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"message": "批量更新标签成功",
		"count":   len(req.AgentIDs),
	})
}

// UpdateTrafficConfig 更新流量配置(管理员)
func (h *AgentHandler) UpdateTrafficConfig(c echo.Context) error {
	agentID := c.Param("id")

	var req struct {
		TrafficLimit    uint64 `json:"trafficLimit"`
		TrafficResetDay int    `json:"trafficResetDay"`
	}

	if err := c.Bind(&req); err != nil {
		return orz.NewError(400, "请求参数错误")
	}

	ctx := c.Request().Context()
	if err := h.agentService.UpdateTrafficConfig(ctx, agentID, req.TrafficLimit, req.TrafficResetDay); err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"message": "流量配置更新成功",
	})
}

// GetTrafficStats 查询流量统计(支持可选认证)
func (h *AgentHandler) GetTrafficStats(c echo.Context) error {
	agentID := c.Param("id")
	ctx := c.Request().Context()

	// 检查访问权限
	isAuthenticated := utils.IsAuthenticated(c)
	if _, err := h.agentService.GetAgentByAuth(ctx, agentID, isAuthenticated); err != nil {
		return err
	}

	stats, err := h.agentService.GetTrafficStats(ctx, agentID)
	if err != nil {
		return err
	}

	return orz.Ok(c, stats)
}

// ResetAgentTraffic 手动重置流量(管理员)
func (h *AgentHandler) ResetAgentTraffic(c echo.Context) error {
	agentID := c.Param("id")
	ctx := c.Request().Context()

	if err := h.agentService.ResetAgentTraffic(ctx, agentID); err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"message": "流量已重置",
	})
}
