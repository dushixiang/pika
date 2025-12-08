package handler

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/service"
	"github.com/go-orz/orz"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
)

type PropertyHandler struct {
	logger   *zap.Logger
	service  *service.PropertyService
	notifier *service.Notifier
}

func NewPropertyHandler(logger *zap.Logger, service *service.PropertyService, notifier *service.Notifier) *PropertyHandler {
	return &PropertyHandler{
		logger:   logger,
		service:  service,
		notifier: notifier,
	}
}

// GetProperty 获取属性（返回 JSON 值）
func (h *PropertyHandler) GetProperty(c echo.Context) error {
	id := c.Param("id")

	property, err := h.service.Get(c.Request().Context(), id)
	if err != nil {
		h.logger.Error("获取属性失败", zap.String("id", id), zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "获取属性失败",
		})
	}

	// 解析 JSON 值
	var value interface{}
	if property.Value != "" {
		if err := json.Unmarshal([]byte(property.Value), &value); err != nil {
			h.logger.Error("解析属性值失败", zap.String("id", id), zap.Error(err))
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": "解析属性值失败",
			})
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"id":    property.ID,
		"name":  property.Name,
		"value": value,
	})
}

// SetProperty 设置属性
func (h *PropertyHandler) SetProperty(c echo.Context) error {
	id := c.Param("id")

	var req struct {
		Name  string      `json:"name"`
		Value interface{} `json:"value"`
	}

	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "无效的请求参数",
		})
	}

	if err := h.service.Set(c.Request().Context(), id, req.Name, req.Value); err != nil {
		h.logger.Error("设置属性失败", zap.String("id", id), zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "设置属性失败",
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "设置成功",
	})
}

// GetLogo 获取系统 Logo（公开访问，返回图片文件流）
func (h *PropertyHandler) GetLogo(c echo.Context) error {
	sysConfig, err := h.service.GetSystemConfig(c.Request().Context())
	if err != nil {
		// 如果配置不存在，返回 404
		return echo.NewHTTPError(http.StatusNotFound, "Logo 不存在")
	}

	// 提取 logoBase64 字段
	logoBase64 := sysConfig.LogoBase64
	if logoBase64 == "" {
		return echo.NewHTTPError(http.StatusNotFound, "Logo 不存在")
	}

	// 解析 base64 数据
	// 格式: data:image/png;base64,iVBORw0KGgoAAAANS...
	var imageData []byte
	var contentType string

	// 检查是否包含 data URI 前缀
	if len(logoBase64) > 0 && logoBase64[:5] == "data:" {
		// 查找逗号位置
		commaIndex := -1
		for i := 0; i < len(logoBase64) && i < 100; i++ {
			if logoBase64[i] == ',' {
				commaIndex = i
				break
			}
		}

		if commaIndex == -1 {
			return echo.NewHTTPError(http.StatusInternalServerError, "无效的图片数据格式")
		}

		// 提取 MIME 类型
		header := logoBase64[5:commaIndex]
		if len(header) > 7 && header[len(header)-7:] == ";base64" {
			contentType = header[:len(header)-7]
		} else {
			contentType = "image/png" // 默认类型
		}

		// 解码 base64
		base64Data := logoBase64[commaIndex+1:]
		var decodeErr error
		imageData, decodeErr = base64.StdEncoding.DecodeString(base64Data)
		if decodeErr != nil {
			h.logger.Error("解码 base64 失败", zap.Error(decodeErr))
			return echo.NewHTTPError(http.StatusInternalServerError, "解码图片数据失败")
		}
	} else {
		// 直接是 base64 字符串
		var decodeErr error
		imageData, decodeErr = base64.StdEncoding.DecodeString(logoBase64)
		if decodeErr != nil {
			h.logger.Error("解码 base64 失败", zap.Error(decodeErr))
			return echo.NewHTTPError(http.StatusInternalServerError, "解码图片数据失败")
		}
		contentType = "image/png" // 默认类型
	}

	// 设置响应头
	c.Response().Header().Set("Content-Type", contentType)
	c.Response().Header().Set("Cache-Control", "public, max-age=600") // 缓存 10 分钟

	return c.Blob(http.StatusOK, contentType, imageData)
}

// GetMetricsConfig 获取指标配置（公开访问）
func (h *PropertyHandler) GetMetricsConfig(c echo.Context) error {
	return c.JSON(http.StatusOK, orz.Map{
		"options": models.TimeRangeOptions,
	})
}

// TestNotificationChannel 测试通知渠道（从数据库读取配置）
func (h *PropertyHandler) TestNotificationChannel(c echo.Context) error {
	channelType := c.Param("type")
	if channelType == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "缺少渠道类型参数",
		})
	}

	ctx := c.Request().Context()

	channels, err := h.service.GetNotificationChannelConfigs(c.Request().Context())
	if err != nil {
		h.logger.Error("获取通知渠道配置失败", zap.Error(err))
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "获取通知渠道配置失败",
		})
	}

	// 查找指定类型的渠道
	var targetChannel *models.NotificationChannelConfig
	for i := range channels {
		if channels[i].Type == channelType {
			targetChannel = &channels[i]
			break
		}
	}

	if targetChannel == nil {
		return c.JSON(http.StatusNotFound, map[string]string{
			"error": "通知渠道不存在，请先配置",
		})
	}

	if !targetChannel.Enabled {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "通知渠道未启用",
		})
	}

	// 发送测试消息
	message := "这是一条测试通知消息"

	var sendErr error
	switch targetChannel.Type {
	case "dingtalk":
		sendErr = h.notifier.SendDingTalkByConfig(ctx, targetChannel.Config, message)
	case "wecom":
		sendErr = h.notifier.SendWeComByConfig(ctx, targetChannel.Config, message)
	case "feishu":
		sendErr = h.notifier.SendFeishuByConfig(ctx, targetChannel.Config, message)
	case "webhook":
		sendErr = h.notifier.SendWebhookByConfig(ctx, targetChannel.Config, message)
	default:
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "不支持的通知渠道类型",
		})
	}

	if sendErr != nil {
		h.logger.Error("发送测试通知失败", zap.String("type", channelType), zap.Error(sendErr))
		return c.JSON(http.StatusInternalServerError, map[string]string{
			"error": "发送测试通知失败: " + sendErr.Error(),
		})
	}

	return c.JSON(http.StatusOK, map[string]string{
		"message": "测试通知已发送",
	})
}
