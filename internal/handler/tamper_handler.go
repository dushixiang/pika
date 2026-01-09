package handler

import (
	"context"
	"net/http"

	"github.com/dushixiang/pika/internal/service"
	"github.com/go-orz/orz"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
)

type TamperHandler struct {
	logger        *zap.Logger
	tamperService *service.TamperService
}

func NewTamperHandler(logger *zap.Logger, tamperService *service.TamperService) *TamperHandler {
	return &TamperHandler{
		logger:        logger,
		tamperService: tamperService,
	}
}

// UpdateTamperConfig 更新探针的防篡改配置
// POST /api/agents/:id/tamper/config
func (h *TamperHandler) UpdateTamperConfig(c echo.Context) error {
	agentID := c.Param("id")

	var req struct {
		Enabled bool     `json:"enabled"`
		Paths   []string `json:"paths"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]interface{}{
			"message": "请求参数错误",
		})
	}

	config, err := h.tamperService.UpdateConfig(agentID, req.Enabled, req.Paths)
	if err != nil {
		h.logger.Error("更新防篡改配置失败", zap.Error(err), zap.String("agentId", agentID))
		return c.JSON(http.StatusInternalServerError, map[string]interface{}{
			"message": "更新配置失败",
		})
	}

	return c.JSON(http.StatusOK, config)
}

// GetTamperConfig 获取探针的防篡改配置
// GET /api/agents/:id/tamper/config
func (h *TamperHandler) GetTamperConfig(c echo.Context) error {
	agentID := c.Param("id")

	config, err := h.tamperService.GetConfigByAgentID(agentID)
	if err != nil {
		h.logger.Error("获取防篡改配置失败", zap.Error(err), zap.String("agentId", agentID))
		return c.JSON(http.StatusInternalServerError, map[string]interface{}{
			"message": "获取配置失败",
		})
	}

	return c.JSON(http.StatusOK, config)
}

// GetTamperEvents 获取探针的防篡改事件
// GET /api/agents/:id/tamper/events
func (h *TamperHandler) GetTamperEvents(c echo.Context) error {
	agentID := c.Param("id")

	// 获取分页参数
	pageReq := orz.GetPageRequest(c)
	builder := orz.NewPageBuilder(h.tamperService.TamperEventRepo.Repository).
		PageRequest(pageReq).
		Equal("agentId", agentID).
		Equal("path", c.QueryParam("path")).
		Equal("operation", c.QueryParam("operation")).
		Contains("details", c.QueryParam("details"))

	ctx := context.Background()
	page, err := builder.Execute(ctx)
	if err != nil {
		return err
	}

	return orz.Ok(c, page)
}
