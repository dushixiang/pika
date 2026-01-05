package handler

import (
	"net/http"
	"strconv"

	"github.com/dushixiang/pika/internal/service"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
)

// SSHLoginHandler SSH登录处理器
type SSHLoginHandler struct {
	logger  *zap.Logger
	service *service.SSHLoginService
}

// NewSSHLoginHandler 创建处理器
func NewSSHLoginHandler(logger *zap.Logger, service *service.SSHLoginService) *SSHLoginHandler {
	return &SSHLoginHandler{
		logger:  logger,
		service: service,
	}
}

// GetConfig 获取SSH登录监控配置
// GET /api/agents/:id/ssh-login/config
func (h *SSHLoginHandler) GetConfig(c echo.Context) error {
	agentID := c.Param("id")
	if agentID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "探针ID不能为空",
		})
	}

	config, err := h.service.GetConfig(agentID)
	if err != nil {
		h.logger.Error("获取SSH登录监控配置失败", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "获取配置失败",
		})
	}

	if config == nil {
		// 返回默认配置
		return c.JSON(http.StatusOK, map[string]interface{}{
			"enabled":      false,
			"recordFailed": true,
		})
	}

	return c.JSON(http.StatusOK, config)
}

// UpdateConfig 更新SSH登录监控配置
// POST /api/agents/:id/ssh-login/config
func (h *SSHLoginHandler) UpdateConfig(c echo.Context) error {
	agentID := c.Param("id")
	if agentID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "探针ID不能为空",
		})
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "请求参数错误",
		})
	}

	config, configSent, err := h.service.UpdateConfig(c.Request().Context(), agentID, req.Enabled)
	if err != nil {
		h.logger.Error("更新SSH登录监控配置失败", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "更新配置失败",
		})
	}

	// 根据下发状态返回不同的消息
	message := "配置已保存"
	if configSent {
		message = "配置已保存并成功下发到探针"
	} else {
		message = "配置已保存，将在探针下次连接时生效"
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message":    message,
		"config":     config,
		"configSent": configSent, // 告知前端配置是否成功下发
	})
}

// ListEvents 查询SSH登录事件
// GET /api/agents/:id/ssh-login/events
func (h *SSHLoginHandler) ListEvents(c echo.Context) error {
	agentID := c.Param("id")
	if agentID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "探针ID不能为空",
		})
	}

	// 解析分页参数
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}

	pageSize, _ := strconv.Atoi(c.QueryParam("pageSize"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// 解析过滤参数
	username := c.QueryParam("username")
	ip := c.QueryParam("ip")
	status := c.QueryParam("status")

	startTime, _ := strconv.ParseInt(c.QueryParam("startTime"), 10, 64)
	endTime, _ := strconv.ParseInt(c.QueryParam("endTime"), 10, 64)

	// 查询事件
	var events interface{}
	var total int64
	var err error

	if username != "" || ip != "" || status != "" || startTime > 0 || endTime > 0 {
		events, total, err = h.service.ListEventsByFilter(agentID, username, ip, status, startTime, endTime, page, pageSize)
	} else {
		events, total, err = h.service.ListEvents(agentID, page, pageSize)
	}

	if err != nil {
		h.logger.Error("查询SSH登录事件失败", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "查询失败",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"items":    events,
		"total":    total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// GetEvent 获取单个SSH登录事件
// GET /api/ssh-login/events/:id
func (h *SSHLoginHandler) GetEvent(c echo.Context) error {
	eventID := c.Param("id")
	if eventID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "事件ID不能为空",
		})
	}

	event, err := h.service.GetEventByID(eventID)
	if err != nil {
		h.logger.Error("获取SSH登录事件失败", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "获取事件失败",
		})
	}

	if event == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "事件不存在",
		})
	}

	return c.JSON(http.StatusOK, event)
}

// DeleteEvents 删除探针的所有SSH登录事件
// DELETE /api/agents/:id/ssh-login/events
func (h *SSHLoginHandler) DeleteEvents(c echo.Context) error {
	agentID := c.Param("id")
	if agentID == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "探针ID不能为空",
		})
	}

	if err := h.service.DeleteEventsByAgentID(agentID); err != nil {
		h.logger.Error("删除SSH登录事件失败", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "删除失败",
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "删除成功",
	})
}
