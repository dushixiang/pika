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
	logger        *zap.Logger
	agentService  *service.AgentService
	monitorSvc    *service.MonitorService
	tamperService *service.TamperService
	wsManager     *ws.Manager
	upgrader      websocket.Upgrader
}

func NewAgentHandler(logger *zap.Logger, agentService *service.AgentService, monitorService *service.MonitorService, tamperService *service.TamperService, wsManager *ws.Manager) *AgentHandler {

	h := &AgentHandler{
		logger:        logger,
		agentService:  agentService,
		monitorSvc:    monitorService,
		tamperService: tamperService,
		wsManager:     wsManager,
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
	var msg protocol.Message
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
		h.logger.Error("failed to register agent", zap.Error(err))

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
		var metricsWrapper protocol.MetricsWrapper
		if err := json.Unmarshal(data, &metricsWrapper); err != nil {
			return err
		}
		return h.agentService.HandleMetricData(ctx, agentID, string(metricsWrapper.Type), metricsWrapper.Data)

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

	case protocol.MessageTypeTamperAlert:
		// 防篡改告警
		var alertData protocol.TamperAlertData
		if err := json.Unmarshal(data, &alertData); err != nil {
			h.logger.Error("failed to unmarshal tamper alert", zap.Error(err))
			return err
		}
		return h.tamperService.CreateAlert(agentID, alertData.Path, alertData.Details, alertData.Restored, alertData.Timestamp)

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
				zap.String("message", protectResp.Message),
				zap.String("error", protectResp.Error))
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
	respData, err := json.Marshal(resp)
	if err != nil {
		return err
	}

	msg := protocol.Message{
		Type: protocol.MessageTypeRegisterAck,
		Data: respData,
	}
	msgData, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.TextMessage, msgData)
}

// sendRegisterError 发送注册失败响应
func (h *AgentHandler) sendRegisterError(conn *websocket.Conn, errMsg string) error {
	resp := protocol.RegisterResponse{
		Status:  "error",
		Message: errMsg,
	}
	respData, _ := json.Marshal(resp)

	msg := protocol.Message{
		Type: protocol.MessageTypeRegisterErr,
		Data: respData,
	}
	msgData, _ := json.Marshal(msg)

	return conn.WriteMessage(websocket.TextMessage, msgData)
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

	data, err := json.Marshal(configData)
	if err != nil {
		return err
	}

	msg := protocol.Message{
		Type: protocol.MessageTypeTamperProtect,
		Data: data,
	}

	msgData, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.TextMessage, msgData)
}

// Paging 探针分页查询
func (h *AgentHandler) Paging(c echo.Context) error {
	hostname := c.QueryParam("hostname")
	ip := c.QueryParam("ip")
	status := c.QueryParam("status")

	pr := orz.GetPageRequest(c, "name")

	builder := orz.NewPageBuilder(h.agentService.AgentRepo).
		PageRequest(pr).
		Contains("hostname", hostname).
		Contains("ip", ip)

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

	// 验证指标类型
	validTypes := map[string]bool{
		"cpu": true, "memory": true, "disk": true, "network": true, "load": true,
		"disk_io": true, "gpu": true, "temperature": true,
	}
	if metricType == "" {
		return orz.NewError(400, "指标类型不能为空")
	}
	if !validTypes[metricType] {
		return orz.NewError(400, "无效的指标类型")
	}

	// 根据 range 参数自动计算时间范围
	var start, end int64
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
	default:
		return orz.NewError(400, "无效的时间范围，支持: 1m, 5m, 15m, 30m, 1h")
	}

	// 服务端自动计算最优聚合间隔
	interval := service.CalculateInterval(start, end)

	metrics, err := h.agentService.GetMetrics(ctx, agentID, metricType, start, end, interval)
	if err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"agentId":  agentID,
		"type":     metricType,
		"range":    rangeParam,
		"start":    start,
		"end":      end,
		"interval": interval,
		"metrics":  metrics,
	})
}

// GetNetworkMetricsByInterface 获取按网卡接口分组的网络指标（公开接口，已登录返回全部，未登录返回公开可见）
func (h *AgentHandler) GetNetworkMetricsByInterface(c echo.Context) error {
	agentID := c.Param("id")
	ctx := c.Request().Context()

	// 验证探针访问权限
	if _, err := h.agentService.GetAgentByAuth(ctx, agentID, utils.IsAuthenticated(c)); err != nil {
		return err
	}

	rangeParam := c.QueryParam("range")

	// 根据 range 参数自动计算时间范围
	var start, end int64
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
	default:
		return orz.NewError(400, "无效的时间范围，支持: 1m, 5m, 15m, 30m, 1h")
	}

	// 服务端自动计算最优聚合间隔
	interval := service.CalculateInterval(start, end)

	metrics, err := h.agentService.GetNetworkMetricsByInterface(ctx, agentID, start, end, interval)
	if err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"agentId":  agentID,
		"type":     "network_by_interface",
		"range":    rangeParam,
		"start":    start,
		"end":      end,
		"interval": interval,
		"metrics":  metrics,
	})
}

// GetLatestMetrics 获取探针最新指标（公开接口，已登录返回全部，未登录返回公开可见）
func (h *AgentHandler) GetLatestMetrics(c echo.Context) error {
	id := c.Param("id")
	ctx := c.Request().Context()

	// 验证探针访问权限
	if _, err := h.agentService.GetAgentByAuth(ctx, id, utils.IsAuthenticated(c)); err != nil {
		return err
	}

	metrics, err := h.agentService.GetLatestMetrics(ctx, id)
	if err != nil {
		return err
	}

	return orz.Ok(c, metrics)
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
		return strings.Compare(strconv.Itoa(a.Status), strconv.Itoa(b.Status))
	})

	// 添加连接状态和最新指标
	result := make([]map[string]interface{}, 0, len(agents))
	for _, agent := range agents {
		item := map[string]interface{}{
			"id":         agent.ID,
			"name":       agent.Name,
			"hostname":   agent.Hostname,
			"ip":         agent.IP,
			"os":         agent.OS,
			"arch":       agent.Arch,
			"version":    agent.Version,
			"tags":       agent.Tags,
			"expireTime": agent.ExpireTime,
			"status":     agent.Status,
			"lastSeenAt": agent.LastSeenAt,
			"visibility": agent.Visibility,
		}

		// 获取最新指标数据
		metrics, err := h.agentService.GetLatestMetrics(ctx, agent.ID)
		if err == nil && metrics != nil {
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
		"version": version.GetVersion(),
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

	reqData, err := json.Marshal(cmdReq)
	if err != nil {
		return err
	}

	msg := protocol.Message{
		Type: protocol.MessageTypeCommand,
		Data: reqData,
	}

	msgData, err := json.Marshal(msg)
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

	// 构建更新字段
	var updates = models.Agent{
		ID:         agentID,
		Name:       req.Name,
		Tags:       req.Tags,
		ExpireTime: req.ExpireTime,
		Visibility: req.Visibility,
		UpdatedAt:  time.Now().UnixMilli(),
	}

	ctx := c.Request().Context()
	if err := h.agentService.AgentRepo.UpdateById(ctx, &updates); err != nil {
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

// GetMonitorMetrics 获取监控指标数据
func (h *AgentHandler) GetMonitorMetrics(c echo.Context) error {
	agentID := c.Param("id")
	monitorName := c.QueryParam("name")
	rangeParam := c.QueryParam("range")
	ctx := c.Request().Context()

	// 根据 range 参数自动计算时间范围
	var start, end int64
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
	default:
		return orz.NewError(400, "无效的时间范围，支持: 1m, 5m, 15m, 30m, 1h")
	}

	metrics, err := h.agentService.GetMonitorMetrics(ctx, agentID, monitorName, start, end)
	if err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"agentId": agentID,
		"name":    monitorName,
		"range":   rangeParam,
		"start":   start,
		"end":     end,
		"metrics": metrics,
	})
}

// GetLatestMonitorMetrics 获取最新的监控指标
func (h *AgentHandler) GetLatestMonitorMetrics(c echo.Context) error {
	agentID := c.Param("id")
	ctx := c.Request().Context()

	metrics, err := h.agentService.GetLatestMonitorMetrics(ctx, agentID)
	if err != nil {
		return err
	}

	return orz.Ok(c, orz.Map{
		"agentId": agentID,
		"metrics": metrics,
	})
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

	// 如果探针在线，先断开连接
	if client, exists := h.wsManager.GetClient(agentID); exists {
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

// GetInstallScript 生成自动安装脚本
func (h *AgentHandler) GetInstallScript(c echo.Context) error {
	token := c.QueryParam("token")
	if token == "" {
		return orz.NewError(400, "token不能为空")
	}

	serverUrl := c.Scheme() + "://" + c.Request().Host

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

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    echo_error "请使用 root 权限运行此脚本"
    echo_info "使用方式: sudo bash install.sh"
    exit 1
fi

# 检测操作系统和架构
detect_platform() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    case "$ARCH" in
        x86_64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
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

    if command -v wget &> /dev/null; then
        wget -q --show-progress "$download_url" -O "$temp_file"
    elif command -v curl &> /dev/null; then
        curl -# -L "$download_url" -o "$temp_file"
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

    if /usr/local/bin/$AGENT_NAME register --endpoint "$endpoint" --token "$token"; then
        echo_info "探针注册成功"
    else
        echo_error "探针注册失败"
        exit 1
    fi
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
