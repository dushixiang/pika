package handler

import (
	"net/http"
	"strconv"

	"github.com/dushixiang/pika/internal/service"
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
	if agentID == "" {
		return c.JSON(http.StatusBadRequest, map[string]interface{}{
			"success": false,
			"message": "探针ID不能为空",
		})
	}

	var req struct {
		Enabled bool     `json:"enabled"`
		Paths   []string `json:"paths"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]interface{}{
			"success": false,
			"message": "请求参数错误",
		})
	}

	config, err := h.tamperService.UpdateConfig(agentID, req.Enabled, req.Paths)
	if err != nil {
		h.logger.Error("更新防篡改配置失败", zap.Error(err), zap.String("agentId", agentID))
		return c.JSON(http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": "更新配置失败",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "配置更新成功",
		"data":    config,
	})
}

// GetTamperConfig 获取探针的防篡改配置
// GET /api/agents/:id/tamper/config
func (h *TamperHandler) GetTamperConfig(c echo.Context) error {
	agentID := c.Param("id")
	if agentID == "" {
		return c.JSON(http.StatusBadRequest, map[string]interface{}{
			"success": false,
			"message": "探针ID不能为空",
		})
	}

	config, err := h.tamperService.GetConfigByAgentID(agentID)
	if err != nil {
		h.logger.Error("获取防篡改配置失败", zap.Error(err), zap.String("agentId", agentID))
		return c.JSON(http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": "获取配置失败",
		})
	}

	if config == nil {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"paths": []string{},
			},
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    config,
	})
}

// GetTamperEvents 获取探针的防篡改事件
// GET /api/agents/:id/tamper/events
func (h *TamperHandler) GetTamperEvents(c echo.Context) error {
	agentID := c.Param("id")
	if agentID == "" {
		return c.JSON(http.StatusBadRequest, map[string]interface{}{
			"success": false,
			"message": "探针ID不能为空",
		})
	}

	// 获取分页参数
	pageNum, _ := strconv.Atoi(c.QueryParam("pageNum"))
	pageSize, _ := strconv.Atoi(c.QueryParam("pageSize"))

	events, total, err := h.tamperService.GetEventsByAgentID(agentID, pageNum, pageSize)
	if err != nil {
		h.logger.Error("获取防篡改事件失败", zap.Error(err), zap.String("agentId", agentID))
		return c.JSON(http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"message": "获取事件失败",
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"items": events,
			"total": total,
		},
	})
}
