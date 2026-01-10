package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/dushixiang/pika/internal/models"
	"github.com/dushixiang/pika/internal/repo"
	"github.com/dushixiang/pika/pkg/version"
	"github.com/dushixiang/pika/web"
	"github.com/go-orz/cache"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	// PropertyIDSystemVersion 系统版本的固定 ID
	PropertyIDSystemVersion = "version"
	// PropertyIDNotificationChannels 通知渠道配置的固定 ID
	PropertyIDNotificationChannels = "notification_channels"
	// PropertyIDSystemConfig 系统配置的固定 ID
	PropertyIDSystemConfig = "system_config"
	// PropertyIDMetricsConfig 指标配置的固定 ID
	PropertyIDMetricsConfig = "metrics_config"
	// PropertyIDAlertConfig 告警配置的固定 ID
	PropertyIDAlertConfig = "alert_config"
	// PropertyIDDNSProviders DNS 服务商配置的固定 ID
	PropertyIDDNSProviders = "dns_providers"
)

type PropertyService struct {
	repo   *repo.PropertyRepo
	logger *zap.Logger
	// 内存缓存，使用 go-orz/cache，永不过期
	cache cache.Cache[string, *models.Property]
}

func NewPropertyService(logger *zap.Logger, db *gorm.DB) *PropertyService {
	return &PropertyService{
		repo:   repo.NewPropertyRepo(db),
		logger: logger,
		cache:  cache.New[string, *models.Property](time.Minute), // 0 表示永不过期
	}
}

// Get 获取属性（返回原始 JSON 字符串）
func (s *PropertyService) Get(ctx context.Context, id string) (*models.Property, error) {
	// 先尝试从缓存读取
	if property, ok := s.cache.Get(id); ok {
		return property, nil
	}

	// 缓存未命中，从数据库读取
	property, err := s.repo.FindById(ctx, id)
	if err != nil {
		return nil, err
	}

	// 更新缓存
	s.cache.Set(id, &property, time.Hour)

	return &property, nil
}

// GetValue 获取属性值并反序列化
func (s *PropertyService) GetValue(ctx context.Context, id string, target interface{}) error {
	// 使用 Get 方法，内部已经支持缓存
	property, err := s.Get(ctx, id)
	if err != nil {
		return err
	}

	if property.Value == "" {
		return nil
	}

	return json.Unmarshal([]byte(property.Value), target)
}

// Set 设置属性（接收对象，自动序列化）
func (s *PropertyService) Set(ctx context.Context, id string, name string, value interface{}) error {
	jsonValue, err := json.Marshal(value)
	if err != nil {
		return err
	}

	property := &models.Property{
		ID:        id,
		Name:      name,
		Value:     string(jsonValue),
		CreatedAt: time.Now().UnixMilli(),
		UpdatedAt: time.Now().UnixMilli(),
	}

	err = s.repo.Save(ctx, property)
	if err != nil {
		return err
	}

	// 清空缓存中的该项，下次读取时会重新从数据库加载
	s.cache.Delete(id)

	return nil
}

func (s *PropertyService) GetNotificationChannelConfigs(ctx context.Context) ([]models.NotificationChannelConfig, error) {
	var allChannels []models.NotificationChannelConfig
	err := s.GetValue(ctx, PropertyIDNotificationChannels, &allChannels)
	if err != nil {
		return nil, fmt.Errorf("获取通知渠道配置失败: %w", err)
	}
	return allChannels, nil
}

func (s *PropertyService) GetSystemConfig(ctx context.Context) (*models.SystemConfig, error) {
	var systemConfig models.SystemConfig
	err := s.GetValue(ctx, PropertyIDSystemConfig, &systemConfig)
	if err != nil {
		return nil, fmt.Errorf("获取系统配置失败: %w", err)
	}
	// 设置系统版本
	systemConfig.Version = version.Version
	return &systemConfig, nil
}

// GetAlertConfig 获取告警配置
func (s *PropertyService) GetAlertConfig(ctx context.Context) (*models.AlertConfig, error) {
	var config models.AlertConfig
	err := s.GetValue(ctx, PropertyIDAlertConfig, &config)
	if err != nil {
		return nil, fmt.Errorf("获取告警配置失败: %w", err)
	}
	return &config, nil
}

// SetAlertConfig 设置告警配置
func (s *PropertyService) SetAlertConfig(ctx context.Context, config models.AlertConfig) error {
	return s.Set(ctx, PropertyIDAlertConfig, "告警配置", config)
}

// GetDNSProviderConfigs 获取 DNS 服务商配置列表
func (s *PropertyService) GetDNSProviderConfigs(ctx context.Context) ([]models.DNSProviderConfig, error) {
	var providers []models.DNSProviderConfig
	err := s.GetValue(ctx, PropertyIDDNSProviders, &providers)
	if err != nil {
		return nil, fmt.Errorf("获取 DNS 服务商配置失败: %w", err)
	}
	return providers, nil
}

// GetDNSProviderByType 根据 Provider 类型获取单个配置
func (s *PropertyService) GetDNSProviderByType(ctx context.Context, providerType string) (*models.DNSProviderConfig, error) {
	providers, err := s.GetDNSProviderConfigs(ctx)
	if err != nil {
		return nil, err
	}

	for _, provider := range providers {
		if provider.Provider == providerType {
			return &provider, nil
		}
	}
	return nil, fmt.Errorf("未找到 DNS 服务商配置: %s", providerType)
}

// SetDNSProviderConfigs 设置 DNS 服务商配置列表
func (s *PropertyService) SetDNSProviderConfigs(ctx context.Context, providers []models.DNSProviderConfig) error {
	return s.Set(ctx, PropertyIDDNSProviders, "DNS 服务商配置", providers)
}

// UpsertDNSProvider 创建或更新单个 DNS 服务商配置（每种类型只允许一个）
func (s *PropertyService) UpsertDNSProvider(ctx context.Context, newProvider models.DNSProviderConfig) error {
	providers, err := s.GetDNSProviderConfigs(ctx)
	if err != nil && err.Error() != "获取 DNS 服务商配置失败: record not found" {
		return err
	}

	// 查找是否已存在该类型的配置
	found := false
	for i, provider := range providers {
		if provider.Provider == newProvider.Provider {
			// 更新现有配置
			providers[i] = newProvider
			found = true
			break
		}
	}

	// 如果不存在，添加新配置
	if !found {
		providers = append(providers, newProvider)
	}

	return s.SetDNSProviderConfigs(ctx, providers)
}

// DeleteDNSProvider 删除指定类型的 DNS 服务商配置
func (s *PropertyService) DeleteDNSProvider(ctx context.Context, providerType string) error {
	providers, err := s.GetDNSProviderConfigs(ctx)
	if err != nil {
		return err
	}

	// 过滤掉指定类型的配置
	var newProviders []models.DNSProviderConfig
	for _, provider := range providers {
		if provider.Provider != providerType {
			newProviders = append(newProviders, provider)
		}
	}

	return s.SetDNSProviderConfigs(ctx, newProviders)
}

// defaultPropertyConfig 默认配置项定义
type defaultPropertyConfig struct {
	ID    string
	Name  string
	Value interface{}
}

// InitializeDefaultConfigs 初始化默认配置（如果数据库中不存在）
func (s *PropertyService) InitializeDefaultConfigs(ctx context.Context) error {
	// 定义所有需要初始化的默认配置
	defaultConfigs := []defaultPropertyConfig{
		{
			ID:   PropertyIDSystemConfig,
			Name: "系统配置",
			Value: models.SystemConfig{
				SystemNameZh: "皮卡监控",
				SystemNameEn: "Pika Monitor",
				LogoBase64:   web.DefaultLogoBase64(),
				ICPCode:      "",
				DefaultView:  "grid",
			},
		},
		{
			ID:    PropertyIDNotificationChannels,
			Name:  "通知渠道配置",
			Value: []models.NotificationChannelConfig{},
		},
		{
			ID:   PropertyIDAlertConfig,
			Name: "告警配置",
			Value: models.AlertConfig{
				Enabled: true, // 默认启用告警
				Rules: models.AlertRules{
					CPUEnabled:           true,
					CPUThreshold:         80,
					CPUDuration:          300, // 5分钟
					MemoryEnabled:        true,
					MemoryThreshold:      80,
					MemoryDuration:       300, // 5分钟
					DiskEnabled:          true,
					DiskThreshold:        85,
					DiskDuration:         300, // 5分钟
					NetworkEnabled:       false,
					NetworkThreshold:     100,
					NetworkDuration:      300, // 5分钟
					CertEnabled:          true,
					CertThreshold:        30, // 30天
					ServiceEnabled:       true,
					ServiceDuration:      300, // 5分钟
					AgentOfflineEnabled:  true,
					AgentOfflineDuration: 300, // 5分钟
				},
			},
		},
		{
			ID:    PropertyIDDNSProviders,
			Name:  "DNS 服务商配置",
			Value: []models.DNSProviderConfig{}, // 默认为空数组
		},
	}

	// 遍历并初始化每个配置
	for _, config := range defaultConfigs {
		if err := s.initializeProperty(ctx, config); err != nil {
			return fmt.Errorf("初始化 %s 失败: %w", config.Name, err)
		}
	}

	s.logger.Info("默认配置初始化完成")
	return nil
}

// initializeProperty 初始化单个配置项
func (s *PropertyService) initializeProperty(ctx context.Context, config defaultPropertyConfig) error {
	// 检查配置是否已存在
	exists, err := s.repo.ExistsById(ctx, config.ID)
	if err != nil {
		return err
	}

	if exists {
		// 配置已存在，无需初始化
		s.logger.Info("配置已存在，跳过初始化", zap.String("name", config.Name))
		return nil
	}

	// 配置不存在，创建默认配置
	if err := s.Set(ctx, config.ID, config.Name, config.Value); err != nil {
		return err
	}
	s.logger.Info("配置默认值已初始化", zap.String("name", config.Name))
	return nil
}

func (s *PropertyService) GetSystemVersion(ctx context.Context) (string, error) {
	var systemVersion string
	err := s.GetValue(ctx, PropertyIDSystemVersion, &systemVersion)
	if err != nil {
		return "", err
	}
	return systemVersion, nil
}

func (s *PropertyService) SetSystemVersion(ctx context.Context, systemVersion string) error {
	return s.Set(ctx, PropertyIDSystemVersion, "系统版本", systemVersion)
}
