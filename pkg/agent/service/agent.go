package service

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/dushixiang/pika/internal/protocol"
	"github.com/dushixiang/pika/pkg/agent/audit"
	"github.com/dushixiang/pika/pkg/agent/collector"
	"github.com/dushixiang/pika/pkg/agent/config"
	"github.com/dushixiang/pika/pkg/agent/id"
	"github.com/dushixiang/pika/pkg/agent/tamper"
	"github.com/dushixiang/pika/pkg/version"
	"github.com/gorilla/websocket"
	"github.com/jpillora/backoff"
)

// safeConn 线程安全的 WebSocket 连接包装器
type safeConn struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

// WriteJSON 线程安全地写入 JSON 消息
func (sc *safeConn) WriteJSON(v interface{}) error {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	return sc.conn.WriteJSON(v)
}

// WriteMessage 线程安全地写入消息
func (sc *safeConn) WriteMessage(messageType int, data []byte) error {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	return sc.conn.WriteMessage(messageType, data)
}

// ReadJSON 读取 JSON 消息（读操作本身是安全的）
func (sc *safeConn) ReadJSON(v interface{}) error {
	return sc.conn.ReadJSON(v)
}

// Close 关闭连接
func (sc *safeConn) Close() error {
	return sc.conn.Close()
}

// Agent 探针服务
type Agent struct {
	cfg              *config.Config
	idMgr            *id.Manager
	cancel           context.CancelFunc
	connMu           sync.RWMutex
	activeConn       *safeConn
	collectorMu      sync.RWMutex
	collectorManager *collector.Manager
	tamperProtector  *tamper.Protector
}

// New 创建 Agent 实例
func New(cfg *config.Config) *Agent {
	return &Agent{
		cfg:             cfg,
		idMgr:           id.NewManager(),
		tamperProtector: tamper.NewProtector(),
	}
}

// Start 启动探针服务
func (a *Agent) Start(ctx context.Context) error {
	// 创建可取消的 context
	ctx, cancel := context.WithCancel(ctx)
	a.cancel = cancel

	// 启动探针主循环
	b := &backoff.Backoff{
		Min:    5 * time.Second,
		Max:    5 * time.Minute,
		Factor: 2,
		Jitter: true,
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		if err := a.runOnce(ctx); err != nil {
			retryAfter := b.Duration()
			log.Printf("⚠️  探针运行出错: %v，将在 %v 后重试", err, retryAfter)

			select {
			case <-time.After(retryAfter):
				continue
			case <-ctx.Done():
				return nil
			}
		}

		// 正常断开，重置退避
		b.Reset()
		log.Println("连接已断开，准备重连...")
		time.Sleep(3 * time.Second)
	}
}

// Stop 停止探针服务
func (a *Agent) Stop() {
	if a.cancel != nil {
		a.cancel()
	}
}

// runOnce 运行一次探针连接
func (a *Agent) runOnce(ctx context.Context) error {
	wsURL := a.cfg.GetWebSocketURL()
	log.Printf("🔌 正在连接到服务器: %s", wsURL)

	// 创建自定义的 Dialer
	var dialer = websocket.DefaultDialer
	if a.cfg.Server.InsecureSkipVerify {
		dialer.TLSClientConfig = &tls.Config{
			InsecureSkipVerify: true,
		}
		log.Println("⚠️  警告: 已禁用 TLS 证书验证")
	}

	// 连接到服务器
	rawConn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		return fmt.Errorf("连接失败: %w", err)
	}
	defer rawConn.Close()

	// 创建线程安全的连接包装器
	conn := &safeConn{conn: rawConn}

	// 设置 Ping 处理器，自动响应服务端的 Ping
	rawConn.SetPingHandler(func(appData string) error {
		// WriteControl 有内置锁，可以安全调用
		err := rawConn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(time.Second))
		if err == nil {
			//log.Println("💓 收到 Ping，已发送 Pong")
		}
		return err
	})

	// 发送注册消息
	if err := a.registerAgent(conn); err != nil {
		return fmt.Errorf("注册失败: %w", err)
	}

	log.Println("✅ 探针注册成功，开始监控...")

	// 创建采集器管理器
	collectorManager := collector.NewManager(a.cfg)

	a.setActiveConn(conn)
	a.setCollectorManager(collectorManager)
	defer func() {
		a.setCollectorManager(nil)
		a.setActiveConn(nil)
	}()

	// 创建完成通道
	done := make(chan struct{})
	errChan := make(chan error, 3)

	// 启动读取循环（处理服务端的 Ping/Pong 等控制消息）
	go func() {
		if err := a.readLoop(rawConn, done); err != nil {
			errChan <- fmt.Errorf("读取失败: %w", err)
		}
	}()

	// 启动心跳和数据发送
	go func() {
		if err := a.heartbeatLoop(ctx, conn, done); err != nil {
			errChan <- fmt.Errorf("心跳失败: %w", err)
		}
	}()

	go func() {
		if err := a.metricsLoop(ctx, conn, collectorManager, done); err != nil {
			errChan <- fmt.Errorf("数据采集失败: %w", err)
		}
	}()

	// 启动防篡改事件监控
	go func() {
		a.tamperEventLoop(ctx, conn, done)
	}()

	// 启动防篡改属性告警监控
	go func() {
		a.tamperAlertLoop(ctx, conn, done)
	}()

	// 等待错误或上下文取消
	select {
	case err := <-errChan:
		close(done)
		return err
	case <-ctx.Done():
		close(done)
		// 优雅关闭连接
		closeMsg := websocket.FormatCloseMessage(websocket.CloseNormalClosure, "")
		if err := conn.WriteMessage(websocket.CloseMessage, closeMsg); err != nil {
			log.Printf("⚠️  关闭连接失败: %v", err)
		}
		time.Sleep(time.Second)
		return nil
	}
}

// readLoop 读取服务端消息（主要用于处理 Ping/Pong 和指令）
func (a *Agent) readLoop(conn *websocket.Conn, done chan struct{}) error {
	for {
		select {
		case <-done:
			return nil
		default:
		}

		// 读取消息（这会触发 PingHandler）
		_, message, err := conn.ReadMessage()
		if err != nil {
			// 检查是否是正常关闭
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				log.Println("服务端正常关闭连接")
				return nil
			}
			// 其他错误
			return fmt.Errorf("读取消息失败: %w", err)
		}

		// 解析消息
		var msg protocol.Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("⚠️  解析消息失败: %v", err)
			continue
		}

		switch msg.Type {
		case protocol.MessageTypeCommand:
			go a.handleCommand(msg.Data)
		case protocol.MessageTypeMonitorConfig:
			go a.handleMonitorConfig(msg.Data)
		case protocol.MessageTypeTamperProtect:
			go a.handleTamperProtect(msg.Data)
		default:
			// 忽略其他类型
		}
	}
}

// registerAgent 注册探针
func (a *Agent) registerAgent(conn *safeConn) error {
	// 加载或生成探针 ID
	agentID, err := a.idMgr.Load()
	if err != nil {
		return fmt.Errorf("加载 agent ID 失败: %w", err)
	}
	log.Printf("🆔 Agent ID: %s (存储在: %s)", agentID, a.idMgr.GetPath())

	// 获取主机信息
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "unknown"
	}

	// 使用配置或默认值
	agentName := a.cfg.Agent.Name
	if agentName == "" {
		agentName = hostname
	}

	// 构建注册请求
	registerReq := protocol.RegisterRequest{
		AgentInfo: protocol.AgentInfo{
			ID:       agentID,
			Name:     agentName,
			Hostname: hostname,
			OS:       runtime.GOOS,
			Arch:     runtime.GOARCH,
			Version:  version.GetVersion(),
		},
		ApiKey: a.cfg.Server.APIKey,
	}

	reqData, err := json.Marshal(registerReq)
	if err != nil {
		return fmt.Errorf("序列化注册请求失败: %w", err)
	}

	msg := protocol.Message{
		Type: protocol.MessageTypeRegister,
		Data: reqData,
	}

	if err := conn.WriteJSON(msg); err != nil {
		return fmt.Errorf("发送注册消息失败: %w", err)
	}

	// 读取注册响应
	var response protocol.Message
	if err := conn.ReadJSON(&response); err != nil {
		return fmt.Errorf("读取注册响应失败: %w", err)
	}

	// 检查响应类型
	if response.Type == protocol.MessageTypeRegisterErr {
		var errResp protocol.RegisterResponse
		if err := json.Unmarshal(response.Data, &errResp); err == nil {
			return fmt.Errorf("注册失败: %s", errResp.Message)
		}
		return fmt.Errorf("注册失败: 未知错误")
	}

	if response.Type != protocol.MessageTypeRegisterAck {
		return fmt.Errorf("注册失败: 收到未知响应类型 %s", response.Type)
	}

	var registerResp protocol.RegisterResponse
	if err := json.Unmarshal(response.Data, &registerResp); err != nil {
		return fmt.Errorf("解析注册响应失败: %w", err)
	}

	log.Printf("注册成功: AgentId=%s, Status=%s", registerResp.AgentID, registerResp.Status)
	return nil
}

func (a *Agent) handleMonitorConfig(data json.RawMessage) {
	var payload protocol.MonitorConfigPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		log.Printf("⚠️  解析监控配置失败: %v", err)
		return
	}

	if len(payload.Items) == 0 {
		log.Println("ℹ️  收到空的服务监控配置，跳过")
		return
	}

	conn := a.getActiveConn()
	manager := a.getCollectorManager()
	if conn == nil || manager == nil {
		log.Println("⚠️  当前连接未就绪，无法执行服务监控任务")
		return
	}

	log.Printf("📥 收到服务监控配置，总计 %d 个监控项，立即执行检测", len(payload.Items))

	// 立即执行一次监控检测
	if err := manager.CollectAndSendMonitor(conn, payload.Items); err != nil {
		log.Printf("⚠️  监控检测失败: %v", err)
	} else {
		log.Printf("✅ 服务监控检测完成，已上报 %d 个监控项结果", len(payload.Items))
	}
}

// heartbeatLoop 心跳循环
func (a *Agent) heartbeatLoop(ctx context.Context, conn *safeConn, done chan struct{}) error {
	ticker := time.NewTicker(a.cfg.GetHeartbeatInterval())
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			msg := protocol.Message{
				Type: protocol.MessageTypeHeartbeat,
				Data: json.RawMessage(`{}`),
			}
			if err := conn.WriteJSON(msg); err != nil {
				return fmt.Errorf("发送心跳失败: %w", err)
			}
			//log.Println("💓 心跳已发送")
		case <-done:
			return nil
		case <-ctx.Done():
			return nil
		}
	}
}

func (a *Agent) setActiveConn(conn *safeConn) {
	a.connMu.Lock()
	defer a.connMu.Unlock()
	a.activeConn = conn
}

func (a *Agent) getActiveConn() *safeConn {
	a.connMu.RLock()
	defer a.connMu.RUnlock()
	return a.activeConn
}

func (a *Agent) setCollectorManager(manager *collector.Manager) {
	a.collectorMu.Lock()
	defer a.collectorMu.Unlock()
	a.collectorManager = manager
}

func (a *Agent) getCollectorManager() *collector.Manager {
	a.collectorMu.RLock()
	defer a.collectorMu.RUnlock()
	return a.collectorManager
}

// metricsLoop 指标采集循环
func (a *Agent) metricsLoop(ctx context.Context, conn *safeConn, manager *collector.Manager, done chan struct{}) error {
	// 立即采集一次动态数据
	if err := a.collectAndSendAllMetrics(conn, manager); err != nil {
		log.Printf("⚠️  初始数据采集失败: %v", err)
	}

	// 定时采集动态指标
	ticker := time.NewTicker(a.cfg.GetCollectorInterval())
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// 采集并发送各种动态指标
			if err := a.collectAndSendAllMetrics(conn, manager); err != nil {
				return fmt.Errorf("数据采集失败: %w", err)
			}
		case <-done:
			return nil
		case <-ctx.Done():
			return nil
		}
	}
}

// collectAndSendAllMetrics 采集并发送所有动态指标
func (a *Agent) collectAndSendAllMetrics(conn *safeConn, manager *collector.Manager) error {
	var hasError bool

	// CPU 动态指标
	if err := manager.CollectAndSendCPU(conn); err != nil {
		log.Printf("⚠️  发送CPU指标失败: %v", err)
		hasError = true
	}

	// 内存动态指标
	if err := manager.CollectAndSendMemory(conn); err != nil {
		log.Printf("⚠️  发送内存指标失败: %v", err)
		hasError = true
	}

	// 磁盘指标
	if err := manager.CollectAndSendDisk(conn); err != nil {
		log.Printf("⚠️  发送磁盘指标失败: %v", err)
		hasError = true
	}

	// 磁盘 IO 指标
	if err := manager.CollectAndSendDiskIO(conn); err != nil {
		log.Printf("⚠️  发送磁盘IO指标失败: %v", err)
		hasError = true
	}

	// 网络指标
	if err := manager.CollectAndSendNetwork(conn); err != nil {
		log.Printf("⚠️  发送网络指标失败: %v", err)
		hasError = true
	}

	// 系统负载指标
	if err := manager.CollectAndSendLoad(conn); err != nil {
		log.Printf("⚠️  发送负载指标失败: %v", err)
		hasError = true
	}

	// 主机信息
	if err := manager.CollectAndSendHost(conn); err != nil {
		log.Printf("⚠️  发送主机信息失败: %v", err)
		hasError = true
	}

	// GPU 信息（可选）
	if err := manager.CollectAndSendGPU(conn); err != nil {
		log.Printf("ℹ️  发送GPU信息失败: %v", err)
	}

	// 温度信息（可选）
	if err := manager.CollectAndSendTemperature(conn); err != nil {
		log.Printf("ℹ️  发送温度信息失败: %v", err)
	}

	if hasError {
		return fmt.Errorf("部分指标采集失败")
	}

	return nil
}

// handleCommand 处理服务端下发的指令
func (a *Agent) handleCommand(data json.RawMessage) {
	var cmdReq protocol.CommandRequest
	if err := json.Unmarshal(data, &cmdReq); err != nil {
		log.Printf("⚠️  解析指令失败: %v", err)
		return
	}

	log.Printf("📥 收到指令: %s (ID: %s)", cmdReq.Type, cmdReq.ID)

	conn := a.getActiveConn()
	// 发送运行中状态
	a.sendCommandResponse(conn, cmdReq.ID, cmdReq.Type, "running", "", "")

	switch cmdReq.Type {
	case "vps_audit":
		a.handleVPSAudit(conn, cmdReq.ID)
	default:
		log.Printf("⚠️  未知指令类型: %s", cmdReq.Type)
		a.sendCommandResponse(conn, cmdReq.ID, cmdReq.Type, "error", "未知指令类型", "")
	}
}

// handleVPSAudit 处理VPS安全审计指令
func (a *Agent) handleVPSAudit(conn *safeConn, cmdID string) {
	// 导入 audit 包
	result, err := a.runVPSAudit()
	if err != nil {
		log.Printf("❌ VPS安全审计失败: %v", err)
		a.sendCommandResponse(conn, cmdID, "vps_audit", "error", err.Error(), "")
		return
	}

	// 将结果序列化为JSON
	resultJSON, err := json.Marshal(result)
	if err != nil {
		log.Printf("❌ 序列化审计结果失败: %v", err)
		a.sendCommandResponse(conn, cmdID, "vps_audit", "error", "序列化结果失败", "")
		return
	}

	log.Println("✅ VPS安全审计完成")
	a.sendCommandResponse(conn, cmdID, "vps_audit", "success", "", string(resultJSON))
}

// runVPSAudit 运行VPS安全审计
func (a *Agent) runVPSAudit() (*protocol.VPSAuditResult, error) {
	return audit.RunAudit()
}

// sendCommandResponse 发送指令响应
func (a *Agent) sendCommandResponse(conn *safeConn, cmdID, cmdType, status, errMsg, result string) {
	resp := protocol.CommandResponse{
		ID:     cmdID,
		Type:   cmdType,
		Status: status,
		Error:  errMsg,
		Result: result,
	}

	respData, err := json.Marshal(resp)
	if err != nil {
		log.Printf("⚠️  序列化指令响应失败: %v", err)
		return
	}

	msg := protocol.Message{
		Type: protocol.MessageTypeCommandResp,
		Data: respData,
	}

	msgData, err := json.Marshal(msg)
	if err != nil {
		log.Printf("⚠️  序列化消息失败: %v", err)
		return
	}

	if err := conn.WriteMessage(websocket.TextMessage, msgData); err != nil {
		log.Printf("⚠️  发送指令响应失败: %v", err)
	}
}

// GetVersion 获取版本号
func GetVersion() string {
	return version.GetVersion()
}

// handleTamperProtect 处理防篡改保护指令（增量更新）
func (a *Agent) handleTamperProtect(data json.RawMessage) {
	var tamperProtectConfig protocol.TamperProtectConfig
	if err := json.Unmarshal(data, &tamperProtectConfig); err != nil {
		log.Printf("⚠️  解析防篡改保护配置失败: %v", err)
		a.sendTamperProtectResponse(false, "解析配置失败", nil, nil, nil, err.Error())
		return
	}

	log.Printf("📥 收到防篡改保护增量配置: Added=%v, Removed=%v", tamperProtectConfig.Added, tamperProtectConfig.Removed)

	conn := a.getActiveConn()
	if conn == nil {
		log.Println("⚠️  当前连接未就绪，无法执行防篡改保护")
		return
	}

	// 如果没有新增也没有移除，不需要做任何操作
	if len(tamperProtectConfig.Added) == 0 && len(tamperProtectConfig.Removed) == 0 {
		log.Println("ℹ️  配置无变化，跳过更新")
		a.sendTamperProtectResponse(true, "配置无变化", a.tamperProtector.GetProtectedPaths(), []string{}, []string{}, "")
		return
	}

	ctx := context.Background()

	// 应用增量更新
	result, err := a.tamperProtector.ApplyIncrementalUpdate(ctx, tamperProtectConfig.Added, tamperProtectConfig.Removed)
	if err != nil {
		log.Printf("⚠️  应用增量更新失败: %v", err)
		// 即使有错误也返回部分成功的结果
		if result != nil {
			a.sendTamperProtectResponse(false, "部分更新失败", result.Current, result.Added, result.Removed, err.Error())
		} else {
			a.sendTamperProtectResponse(false, "更新失败", nil, nil, nil, err.Error())
		}
		return
	}

	// 成功更新
	message := fmt.Sprintf("防篡改保护已更新: 新增 %d 个, 移除 %d 个, 当前保护 %d 个目录",
		len(result.Added), len(result.Removed), len(result.Current))
	log.Printf("✅ %s", message)
	a.sendTamperProtectResponse(true, message, result.Current, result.Added, result.Removed, "")
}

// sendTamperProtectResponse 发送防篡改保护响应
func (a *Agent) sendTamperProtectResponse(success bool, message string, paths []string, added []string, removed []string, errMsg string) {
	conn := a.getActiveConn()
	if conn == nil {
		return
	}

	resp := protocol.TamperProtectResponse{
		Success: success,
		Message: message,
		Paths:   paths,
		Added:   added,
		Removed: removed,
		Error:   errMsg,
	}

	respData, err := json.Marshal(resp)
	if err != nil {
		log.Printf("⚠️  序列化防篡改保护响应失败: %v", err)
		return
	}

	msg := protocol.Message{
		Type: protocol.MessageTypeTamperProtect,
		Data: respData,
	}

	if err := conn.WriteJSON(msg); err != nil {
		log.Printf("⚠️  发送防篡改保护响应失败: %v", err)
	}
}

// tamperEventLoop 防篡改事件监控循环
func (a *Agent) tamperEventLoop(ctx context.Context, conn *safeConn, done chan struct{}) {
	eventCh := a.tamperProtector.GetEvents()

	for {
		select {
		case <-done:
			return
		case <-ctx.Done():
			return
		case event := <-eventCh:
			// 发送防篡改事件到服务端
			eventData := protocol.TamperEventData{
				Path:      event.Path,
				Operation: event.Operation,
				Timestamp: event.Timestamp.UnixMilli(),
				Details:   event.Details,
			}

			data, err := json.Marshal(eventData)
			if err != nil {
				log.Printf("⚠️  序列化防篡改事件失败: %v", err)
				continue
			}

			msg := protocol.Message{
				Type: protocol.MessageTypeTamperEvent,
				Data: data,
			}

			if err := conn.WriteJSON(msg); err != nil {
				log.Printf("⚠️  发送防篡改事件失败: %v", err)
			} else {
				log.Printf("📤 已上报防篡改事件: %s - %s", event.Path, event.Operation)
			}
		}
	}
}

// tamperAlertLoop 防篡改属性告警监控循环
func (a *Agent) tamperAlertLoop(ctx context.Context, conn *safeConn, done chan struct{}) {
	alertCh := a.tamperProtector.GetAlerts()

	for {
		select {
		case <-done:
			return
		case <-ctx.Done():
			return
		case alert := <-alertCh:
			// 发送属性篡改告警到服务端
			alertData := protocol.TamperAlertData{
				Path:      alert.Path,
				Timestamp: alert.Timestamp.UnixMilli(),
				Details:   alert.Details,
				Restored:  alert.Restored,
			}

			data, err := json.Marshal(alertData)
			if err != nil {
				log.Printf("⚠️  序列化属性篡改告警失败: %v", err)
				continue
			}

			msg := protocol.Message{
				Type: protocol.MessageTypeTamperAlert,
				Data: data,
			}

			if err := conn.WriteJSON(msg); err != nil {
				log.Printf("⚠️  发送属性篡改告警失败: %v", err)
			} else {
				status := "未恢复"
				if alert.Restored {
					status = "已恢复"
				}
				log.Printf("📤 已上报属性篡改告警: %s - %s", alert.Path, status)
			}
		}
	}
}
