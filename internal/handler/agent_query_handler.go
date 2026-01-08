package handler

import (
	"slices"
	"strconv"
	"strings"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/utils"
	"github.com/go-orz/orz"
	"github.com/labstack/echo/v4"
)

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

	result := make([]map[string]interface{}, 0, len(agents))
	for _, agent := range agents {
		result = append(result, h.buildAgentListItem(agent))
	}

	return orz.Ok(c, orz.Map{
		"items": result,
		"total": len(result),
	})
}

func (h *AgentHandler) buildAgentListItem(agent models.Agent) map[string]interface{} {
	item := map[string]any{
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

	trafficStats := agent.TrafficStats.Data()
	if trafficStats.Limit > 0 {
		item["traffic"] = map[string]any{
			"limit": trafficStats.Limit,
			"used":  trafficStats.Used,
		}
	} else {
		item["traffic"] = map[string]any{}
	}

	metrics, ok := h.metricService.GetLatestMetrics(agent.ID)
	if ok {
		item["metrics"] = metrics
	}

	return item
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
