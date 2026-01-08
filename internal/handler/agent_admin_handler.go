package handler

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/internal/utils"
	"github.com/go-orz/orz"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
)

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
