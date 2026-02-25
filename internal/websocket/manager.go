package websocket

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/dushixiang/pika/internal/protocol"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

const (
	serverPingInterval = 10 * time.Second
	serverPongWait     = 30 * time.Second
	serverWriteWait    = 10 * time.Second
)

// Client WebSocket客户端
type Client struct {
	ID         string          // 探针ID
	Conn       *websocket.Conn // WebSocket连接
	Send       chan []byte     // 发送消息通道
	Manager    *Manager        // 管理器引用
	LastActive time.Time       // 最后活跃时间
	closed     bool            // 标记channel是否已关闭
	closeMu    sync.Mutex      // 保护closed字段
}

// Manager WebSocket连接管理器
type Manager struct {
	clients    map[string]*Client // 客户端映射 probeID -> Client
	register   chan *Client       // 注册通道
	unregister chan *Client       // 注销通道
	broadcast  chan []byte        // 广播通道
	mu         sync.RWMutex       // 读写锁
	logger     *zap.Logger        // 日志
	onMessage  MessageHandler     // 消息处理器
	onPong     PongHandler        // Pong 处理器
}

// MessageHandler 消息处理器接口
type MessageHandler func(ctx context.Context, probeID string, messageType string, data json.RawMessage) error

// PongHandler Pong 处理器接口
type PongHandler func(probeID string)

// NewManager 创建新的WebSocket管理器
func NewManager(logger *zap.Logger) *Manager {
	return &Manager{
		clients:    make(map[string]*Client),
		register:   make(chan *Client, 10),
		unregister: make(chan *Client, 10),
		broadcast:  make(chan []byte, 256),
		logger:     logger,
	}
}

// SetMessageHandler 设置消息处理器
func (m *Manager) SetMessageHandler(handler MessageHandler) {
	m.onMessage = handler
}

// SetPongHandler 设置 Pong 处理器
func (m *Manager) SetPongHandler(handler PongHandler) {
	m.onPong = handler
}

// Run 启动管理器
func (m *Manager) Run(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			m.logger.Info("websocket manager stopped")
			return
		case client := <-m.register:
			m.registerClient(client)
		case client := <-m.unregister:
			m.unregisterClient(client)
		case message := <-m.broadcast:
			m.broadcastMessage(message)
		case <-ticker.C:
			m.checkInactiveClients()
		}
	}
}

// Register 注册客户端（公开方法）
func (m *Manager) Register(client *Client) {
	m.register <- client
}

// registerClient 注册客户端
func (m *Manager) registerClient(client *Client) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 如果已存在该探针的连接，先关闭旧连接
	if oldClient, exists := m.clients[client.ID]; exists {
		m.logger.Info("agent reconnected, closing old connection", zap.String("agentID", client.ID))
		oldClient.closeChannel()
		oldClient.Conn.Close()
	}

	m.clients[client.ID] = client
	m.logger.Info("agent connected", zap.String("agentID", client.ID), zap.Int("totalClients", len(m.clients)))
}

// unregisterClient 注销客户端
func (m *Manager) unregisterClient(client *Client) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.clients[client.ID]; exists {
		delete(m.clients, client.ID)
		client.closeChannel()
		m.logger.Info("agent disconnected", zap.String("agentID", client.ID), zap.Int("totalClients", len(m.clients)))
	}
}

// broadcastMessage 广播消息
func (m *Manager) broadcastMessage(message []byte) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, client := range m.clients {
		select {
		case client.Send <- message:
		default:
			// 发送失败，客户端可能已断开
			m.logger.Warn("failed to send message, client may be disconnected", zap.String("agentID", client.ID))
		}
	}
}

// checkInactiveClients 检查不活跃的客户端
func (m *Manager) checkInactiveClients() {
	m.mu.RLock()
	inactiveClients := make([]*Client, 0)
	timeout := 2 * time.Minute

	for _, client := range m.clients {
		if time.Since(client.LastActive) > timeout {
			inactiveClients = append(inactiveClients, client)
		}
	}
	m.mu.RUnlock()

	// 断开不活跃的客户端
	for _, client := range inactiveClients {
		// 再次检查客户端是否仍然存在（避免竞态条件）
		m.mu.RLock()
		_, exists := m.clients[client.ID]
		m.mu.RUnlock()

		if exists {
			m.logger.Warn("agent inactive timeout, disconnecting", zap.String("agentID", client.ID))
			client.Conn.Close()
			m.unregister <- client
		}
	}
}

// SendToClient 发送消息给指定客户端
func (m *Manager) SendToClient(probeID string, message []byte) error {
	m.mu.RLock()
	client, exists := m.clients[probeID]
	m.mu.RUnlock()

	if !exists {
		return ErrClientNotFound
	}

	select {
	case client.Send <- message:
		return nil
	default:
		return ErrSendTimeout
	}
}

// GetClient 获取客户端
func (m *Manager) GetClient(probeID string) (*Client, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	client, exists := m.clients[probeID]
	return client, exists
}

// GetAllClients 获取所有客户端ID
func (m *Manager) GetAllClients() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ids := make([]string, 0, len(m.clients))
	for id := range m.clients {
		ids = append(ids, id)
	}
	return ids
}

// ClientCount 获取客户端数量
func (m *Manager) ClientCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.clients)
}

// ReadPump 读取客户端消息
func (c *Client) ReadPump(ctx context.Context) {
	defer func() {
		c.Manager.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Now().Add(serverPongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(serverPongWait))
		c.LastActive = time.Now()
		if c.Manager.onPong != nil {
			go c.Manager.onPong(c.ID)
		}
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.Manager.logger.Error("websocket read error", zap.Error(err), zap.String("agentID", c.ID))
			}
			break
		}

		c.LastActive = time.Now()

		// 解析消息
		var msg protocol.InputMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			c.Manager.logger.Error("failed to parse message", zap.Error(err), zap.String("agentID", c.ID))
			continue
		}

		// 处理消息
		if c.Manager.onMessage != nil {
			if err := c.Manager.onMessage(ctx, c.ID, string(msg.Type), msg.Data); err != nil {
				c.Manager.logger.Error("failed to handle message", zap.Error(err), zap.String("agentID", c.ID), zap.String("type", string(msg.Type)))
			}
		}
	}
}

// WritePump 向客户端写入消息
func (c *Client) WritePump() {
	ticker := time.NewTicker(serverPingInterval)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(serverWriteWait))
			if !ok {
				// 通道已关闭
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				c.Manager.logger.Error("failed to write message", zap.Error(err), zap.String("agentID", c.ID))
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(serverWriteWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// closeChannel 安全地关闭发送通道
func (c *Client) closeChannel() {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()

	if !c.closed {
		close(c.Send)
		c.closed = true
	}
}

// 错误定义
var (
	ErrClientNotFound = &websocket.CloseError{Code: 1000, Text: "client not found"}
	ErrSendTimeout    = &websocket.CloseError{Code: 1001, Text: "send timeout"}
)
