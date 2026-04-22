package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/dushixiang/pika/pkg/agent/config"
	"github.com/dushixiang/pika/pkg/agent/service"
	"github.com/dushixiang/pika/pkg/agent/sshmonitor"
	"github.com/dushixiang/pika/pkg/agent/updater"
	"github.com/dushixiang/pika/pkg/agent/utils"
	"github.com/spf13/cobra"
)

var (
	configPath string
)

// rootCmd 根命令
var rootCmd = &cobra.Command{
	Use:   "agent",
	Short: "Pika 监控探针",
	Long:  `Pika Agent 是一个轻量级的系统监控探针，用于采集服务器的各项性能指标并上报到 Pika 服务端。`,
	Run: func(cmd *cobra.Command, args []string) {
		_ = cmd.Help()
	},
}

// versionCmd 版本命令
var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "显示版本信息",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("Pika Agent v%s\n", service.GetVersion())
		fmt.Printf("OS: %s\n", runtime.GOOS)
		fmt.Printf("Arch: %s\n", runtime.GOARCH)
		fmt.Printf("Go Version: %s\n", runtime.Version())
	},
}

// runCmd 运行命令
var runCmd = &cobra.Command{
	Use:   "run",
	Short: "运行探针",
	Long:  `启动探针并连接到服务器，开始采集和上报监控数据`,
	Run:   runAgent,
}

// installCmd 安装服务命令
var installCmd = &cobra.Command{
	Use:   "install",
	Short: "安装为系统服务",
	Long:  `将 Agent 安装为系统服务（systemd/launchd），开机自动启动`,
	Run:   installService,
}

// uninstallCmd 卸载服务命令
var uninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "卸载系统服务",
	Long:  `从系统中卸载 Agent 服务`,
	Run:   uninstallService,
}

// startCmd 启动服务命令
var startCmd = &cobra.Command{
	Use:   "start",
	Short: "启动服务",
	Long:  `启动已安装的 Agent 服务`,
	Run:   startService,
}

// stopCmd 停止服务命令
var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "停止服务",
	Long:  `停止正在运行的 Agent 服务`,
	Run:   stopService,
}

// restartCmd 重启服务命令
var restartCmd = &cobra.Command{
	Use:   "restart",
	Short: "重启服务",
	Long:  `重启 Agent 服务`,
	Run:   restartService,
}

// statusCmd 查看服务状态命令
var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "查看服务状态",
	Long:  `查看 Agent 服务的运行状态`,
	Run:   statusService,
}

// configCmd 配置命令
var configCmd = &cobra.Command{
	Use:   "config",
	Short: "配置管理",
	Long:  `管理 Agent 配置文件`,
}

// configInitCmd 初始化配置命令
var configInitCmd = &cobra.Command{
	Use:   "init",
	Short: "初始化配置文件",
	Long:  `创建默认配置文件`,
	Run:   initConfig,
}

// configShowCmd 显示配置命令
var configShowCmd = &cobra.Command{
	Use:   "show",
	Short: "显示配置文件路径",
	Long:  `显示当前配置文件的路径`,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("配置文件路径: %s\n", configPath)
	},
}

// updateCmd 更新命令
var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "检查并更新",
	Long:  `检查是否有新版本可用，并进行更新`,
	Run:   updateAgent,
}

// registerCmd 注册命令
var registerCmd = &cobra.Command{
	Use:   "register",
	Short: "注册并安装探针",
	Long:  `交互式引导注册探针：配置服务端地址、Token、名称，然后自动安装为系统服务并启动`,
	Run:   registerAgent,
}

// logCmd 查看日志命令
var logCmd = &cobra.Command{
	Use:   "log",
	Short: "查看日志",
	Long:  `查看 Agent 运行日志，支持实时跟踪`,
	Run:   viewLog,
}

var (
	logFollow  bool
	logLines   int
	logService bool
)

// infoCmd 信息命令
var infoCmd = &cobra.Command{
	Use:   "info",
	Short: "显示配置信息",
	Long:  `显示当前探针的配置信息`,
	Run:   showInfo,
}

var sshLoginHookCmd = &cobra.Command{
	Use:    "ssh-login-hook",
	Short:  "SSH登录监控钩子（PAM 调用）",
	Hidden: true,
	Run: func(cmd *cobra.Command, args []string) {
		_ = sshmonitor.SendEventFromEnv()
	},
}

var (
	serverEndpoint string
	serverAPIKey   string
	agentName      string
	autoConfirm    bool
)

func init() {
	// 全局参数
	rootCmd.PersistentFlags().StringVarP(&configPath, "config", "c", "", "配置文件路径（默认: ~/.pika/agent.yaml）")

	// 注册命令的参数
	registerCmd.Flags().StringVarP(&serverEndpoint, "endpoint", "e", "", "服务端地址 (例如: http://your-server.com:18888)")
	registerCmd.Flags().StringVarP(&serverAPIKey, "token", "t", "", "API Token")
	registerCmd.Flags().StringVarP(&agentName, "name", "n", "", "探针名称（默认使用主机名）")
	registerCmd.Flags().BoolVarP(&autoConfirm, "yes", "y", false, "自动确认配置并继续安装")

	// log 命令参数
	logCmd.Flags().BoolVarP(&logFollow, "follow", "f", false, "实时跟踪日志输出")
	logCmd.Flags().IntVarP(&logLines, "lines", "n", 100, "显示最近多少行日志")
	logCmd.Flags().BoolVarP(&logService, "service", "s", false, "强制查看服务日志（跳过日志文件）")

	// 添加子命令
	rootCmd.AddCommand(versionCmd)
	rootCmd.AddCommand(registerCmd) // 注册命令放在前面，方便用户发现
	rootCmd.AddCommand(infoCmd)
	rootCmd.AddCommand(logCmd)
	rootCmd.AddCommand(runCmd)
	rootCmd.AddCommand(installCmd)
	rootCmd.AddCommand(uninstallCmd)
	rootCmd.AddCommand(startCmd)
	rootCmd.AddCommand(stopCmd)
	rootCmd.AddCommand(restartCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(updateCmd)
	rootCmd.AddCommand(sshLoginHookCmd)

	// 配置命令
	configCmd.AddCommand(configInitCmd)
	configCmd.AddCommand(configShowCmd)
	rootCmd.AddCommand(configCmd)

	if configPath == "" {
		configPath = config.GetDefaultConfigPath()
	}
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "错误: %v\n", err)
		os.Exit(1)
	}
}

// runAgent 运行探针
func runAgent(cmd *cobra.Command, args []string) {
	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("❌ 加载配置失败: %v", err)
	}

	// 创建服务管理器
	mgr, err := service.NewServiceManager(cfg)
	if err != nil {
		log.Fatalf("❌ 创建服务管理器失败: %v", err)
	}

	// 运行服务
	if err := mgr.Run(); err != nil {
		log.Fatalf("❌ 运行失败: %v", err)
	}
}

// installService 安装服务
func installService(cmd *cobra.Command, args []string) {
	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("❌ 加载配置失败: %v", err)
	}

	// 创建服务管理器
	mgr, err := service.NewServiceManager(cfg)
	if err != nil {
		log.Fatalf("❌ 创建服务管理器失败: %v", err)
	}

	// 安装服务
	if err := mgr.Install(); err != nil {
		log.Fatalf("❌ 安装服务失败: %v", err)
	}

	log.Println("✅ 服务安装成功")
	log.Println("   使用 'agent start' 启动服务")
}

// uninstallService 卸载服务
func uninstallService(cmd *cobra.Command, args []string) {
	if err := service.UninstallAgent(configPath); err != nil {
		log.Fatalf("❌ 卸载失败: %v", err)
	}
	log.Println("✅ 服务卸载成功")
}

// startService 启动服务
func startService(cmd *cobra.Command, args []string) {
	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("❌ 加载配置失败: %v", err)
	}

	// 创建服务管理器
	mgr, err := service.NewServiceManager(cfg)
	if err != nil {
		log.Fatalf("❌ 创建服务管理器失败: %v", err)
	}

	// 启动服务
	if err := mgr.Start(); err != nil {
		log.Fatalf("❌ 启动服务失败: %v", err)
	}

	log.Println("✅ 服务启动成功")
}

// stopService 停止服务
func stopService(cmd *cobra.Command, args []string) {
	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("❌ 加载配置失败: %v", err)
	}

	// 创建服务管理器
	mgr, err := service.NewServiceManager(cfg)
	if err != nil {
		log.Fatalf("❌ 创建服务管理器失败: %v", err)
	}

	// 停止服务
	if err := mgr.Stop(); err != nil {
		log.Fatalf("❌ 停止服务失败: %v", err)
	}

	log.Println("✅ 服务停止成功")
}

// restartService 重启服务
func restartService(cmd *cobra.Command, args []string) {
	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("❌ 加载配置失败: %v", err)
	}

	// 创建服务管理器
	mgr, err := service.NewServiceManager(cfg)
	if err != nil {
		log.Fatalf("❌ 创建服务管理器失败: %v", err)
	}

	// 重启服务
	if err := mgr.Restart(); err != nil {
		log.Fatalf("❌ 重启服务失败: %v", err)
	}

	log.Println("✅ 服务重启成功")
}

// statusService 查看服务状态
func statusService(cmd *cobra.Command, args []string) {
	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("❌ 加载配置失败: %v", err)
	}

	// 创建服务管理器
	mgr, err := service.NewServiceManager(cfg)
	if err != nil {
		log.Fatalf("❌ 创建服务管理器失败: %v", err)
	}

	// 查看服务状态
	status, err := mgr.Status()
	if err != nil {
		log.Printf("⚠️  获取服务状态失败: %v", err)
	}

	fmt.Println(status)
}

// initConfig 初始化配置文件
func initConfig(cmd *cobra.Command, args []string) {
	if configPath == "" {
		configPath = config.GetDefaultConfigPath()
	}

	// 创建默认配置
	cfg := config.DefaultConfig()

	// 保存配置
	if err := cfg.Save(configPath); err != nil {
		log.Fatalf("❌ 保存配置文件失败: %v", err)
	}

	log.Printf("✅ 配置文件已创建: %s", configPath)
	log.Println("   请编辑配置文件，设置 server.api_key 等必要参数")
}

// updateAgent 检查并更新
func updateAgent(cmd *cobra.Command, args []string) {
	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("❌ 加载配置失败: %v", err)
	}

	log.Println("🔍 检查更新...")

	up, err := updater.New(cfg, service.GetVersion())
	if err != nil {
		log.Fatalf("❌ 创建更新器失败: %v", err)
	}

	up.CheckAndUpdate()
}

// registerAgent 注册探针
func registerAgent(cmd *cobra.Command, args []string) {
	reader := bufio.NewReader(os.Stdin)

	log.Println("═══════════════════════════════════════")
	log.Println("   🚀 Pika Agent 注册向导")
	log.Println("═══════════════════════════════════════")
	log.Println()

	// 1. 获取服务端地址（优先使用命令行参数）
	var endpoint string
	if serverEndpoint != "" {
		endpoint = serverEndpoint
		log.Printf("📡 服务端地址: %s (来自命令行参数)", endpoint)
	} else {
		for {
			fmt.Print("📡 请输入服务端地址 (例如: http://your-server.com:8080): ")
			input, _ := reader.ReadString('\n')
			endpoint = strings.TrimSpace(input)
			if endpoint != "" {
				break
			}
			log.Println("   ❌ 服务端地址不能为空，请重新输入")
		}
	}

	// 2. 获取 API Token（优先使用命令行参数）
	var apiKey string
	if serverAPIKey != "" {
		apiKey = serverAPIKey
		log.Printf("🔑 API Token: %s (来自命令行参数)", maskToken(apiKey))
	} else {
		for {
			fmt.Print("🔑 请输入 API Token: ")
			input, _ := reader.ReadString('\n')
			apiKey = strings.TrimSpace(input)
			if apiKey != "" {
				break
			}
			log.Println("   ❌ API Token 不能为空，请重新输入")
		}
	}

	// 3. 获取探针名称（优先使用命令行参数，否则询问用户，默认使用主机名）
	hostname, _ := os.Hostname()
	var name string
	if agentName != "" {
		name = agentName
		log.Printf("📝 探针名称: %s (来自命令行参数)", name)
	} else {
		fmt.Printf("📝 请输入探针名称 (留空使用主机名 '%s'): ", hostname)
		nameInput, _ := reader.ReadString('\n')
		name = strings.TrimSpace(nameInput)
		if name == "" {
			name = hostname
		}
	}

	log.Println()
	log.Println("─────────────────────────────────────")
	log.Println("📋 配置信息:")
	log.Printf("   服务端地址: %s", endpoint)
	log.Printf("   API Token: %s", maskToken(apiKey))
	log.Printf("   探针名称: %s", name)
	log.Println("─────────────────────────────────────")
	log.Println()

	// 4. 确认
	if autoConfirm {
		log.Println("✅ 已自动确认配置，继续安装")
	} else {
		fmt.Print("❓ 确认以上配置并继续安装? (y/N): ")
		confirmInput, _ := reader.ReadString('\n')
		confirm := strings.ToLower(strings.TrimSpace(confirmInput))
		if confirm != "y" && confirm != "yes" {
			log.Println("❌ 已取消注册")
			return
		}
	}

	log.Println()
	log.Println("🔧 开始配置...")

	// 5. 创建配置
	if configPath == "" {
		configPath = config.GetDefaultConfigPath()
	}

	cfg := &config.Config{
		Path: configPath,
		Server: config.ServerConfig{
			Endpoint: endpoint,
			APIKey:   apiKey,
		},
		Agent: config.AgentConfig{
			Name:          name,
			LogLevel:      "info",
			LogFile:       getHomeLogPath(),
			LogMaxSize:    100,
			LogMaxBackups: 3,
			LogMaxAge:     28,
			LogCompress:   true,
		},
		Collector: config.CollectorConfig{
			Interval:       5,
			NetworkExclude: config.DefaultNetworkExcludePatterns(),
		},
		AutoUpdate: config.AutoUpdateConfig{
			Enabled:       true,
			CheckInterval: "1m",
		},
	}

	// 6. 保存配置
	if err := cfg.Save(configPath); err != nil {
		log.Fatalf("❌ 保存配置文件失败: %v", err)
	}
	log.Printf("✅ 配置文件已保存: %s", configPath)

	// 7. 安装为系统服务
	log.Println("📦 安装系统服务...")
	mgr, err := service.NewServiceManager(cfg)
	if err != nil {
		log.Fatalf("❌ 创建服务管理器失败: %v", err)
	}

	if err := mgr.Install(); err != nil {
		log.Fatalf("❌ 安装服务失败: %v", err)
	}
	log.Println("✅ 系统服务安装成功")

	// 8. 启动服务
	log.Println("🚀 启动服务...")
	if err := mgr.Start(); err != nil {
		log.Fatalf("❌ 启动服务失败: %v", err)
	}
	log.Println("✅ 服务启动成功")

	log.Println()
	log.Println("═══════════════════════════════════════")
	log.Println("   🎉 探针注册完成！")
	log.Println("═══════════════════════════════════════")
	log.Println()
}

// maskToken 对 Token 进行部分遮蔽显示
func maskToken(token string) string {
	if len(token) <= 8 {
		return "****"
	}
	return token[:4] + "****" + token[len(token)-4:]
}

func getHomeLogPath() string {
	homeDir := utils.GetSafeHomeDir()
	return filepath.Join(homeDir, ".pika", "logs", "agent.log")
}

// showInfo 显示配置信息
func showInfo(cmd *cobra.Command, args []string) {
	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("❌ 加载配置失败: %v", err)
	}

	fmt.Println("═══════════════════════════════════════")
	fmt.Println("   📋 Pika Agent 配置信息")
	fmt.Println("═══════════════════════════════════════")
	fmt.Println()

	// 基本信息
	fmt.Println("🔧 基本配置:")
	fmt.Printf("   配置文件路径: %s\n", configPath)
	fmt.Printf("   探针名称: %s\n", cfg.Agent.Name)
	fmt.Printf("   当前版本: %s\n", service.GetVersion())
	fmt.Println()

	// 服务端信息
	fmt.Println("🌐 服务端配置:")
	fmt.Printf("   服务端地址: %s\n", cfg.Server.Endpoint)
	fmt.Printf("   API Token: %s\n", maskToken(cfg.Server.APIKey))
	fmt.Println()

	// 采集器配置
	fmt.Println("📊 采集器配置:")
	fmt.Printf("   采集间隔: %d 秒\n", cfg.Collector.Interval)
	if len(cfg.Collector.NetworkExclude) > 0 {
		fmt.Printf("   网卡过滤规则: %v\n", cfg.Collector.NetworkExclude)
	}
	fmt.Println()

	// 自动更新配置
	fmt.Println("🔄 自动更新配置:")
	if cfg.AutoUpdate.Enabled {
		fmt.Printf("   状态: 已启用\n")
		fmt.Printf("   检查间隔: %s\n", cfg.AutoUpdate.CheckInterval)
	} else {
		fmt.Printf("   状态: 已禁用\n")
	}
	fmt.Println()

	// 系统信息
	fmt.Println("💻 系统信息:")
	fmt.Printf("   操作系统: %s\n", runtime.GOOS)
	fmt.Printf("   系统架构: %s\n", runtime.GOARCH)
	hostname, _ := os.Hostname()
	fmt.Printf("   主机名: %s\n", hostname)
	fmt.Println()
}

// viewLog 查看日志
func viewLog(cmd *cobra.Command, args []string) {
	// 加载配置
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("❌ 加载配置失败: %v", err)
	}

	// 判断是否以服务模式运行
	serviceRunning := false
	if runtime.GOOS == "linux" {
		// 检查 systemd 服务状态
		if out, err := exec.Command("systemctl", "is-active", "pika-agent").CombinedOutput(); err == nil && strings.TrimSpace(string(out)) == "active" {
			serviceRunning = true
		}
	} else if runtime.GOOS == "darwin" {
		if out, err := exec.Command("launchctl", "list", "org.pika.pika-agent").CombinedOutput(); err == nil && len(strings.TrimSpace(string(out))) > 0 {
			serviceRunning = true
		}
	} else if runtime.GOOS == "windows" {
		if out, err := exec.Command("sc", "query", "pika-agent").CombinedOutput(); err == nil && strings.Contains(string(out), "RUNNING") {
			serviceRunning = true
		}
	}

	// 决定日志来源
	// 1. 如果指定了 --service 或者服务正在运行，查看服务日志
	// 2. 否则，查看日志文件
	if logService || serviceRunning {
		viewServiceLog(cfg)
	} else {
		viewLogFile(cfg)
	}
}

// viewServiceLog 查看系统服务日志
func viewServiceLog(cfg *config.Config) {
	switch runtime.GOOS {
	case "linux":
		viewLinuxServiceLog(cfg)
	case "darwin":
		viewDarwinServiceLog()
	case "windows":
		viewWindowsServiceLog()
	default:
		log.Printf("⚠️  当前系统 (%s) 不支持查看服务日志", runtime.GOOS)
	}
}

// viewLinuxServiceLog Linux 系统服务日志查看（优先 journalctl，空时回退到日志文件）
func viewLinuxServiceLog(cfg *config.Config) {
	args := []string{"journalctl", "-u", "pika-agent", "-n", fmt.Sprintf("%d", logLines)}
	if logFollow {
		args = append(args, "-f")
	}

	// 非跟踪模式：先检查 journal 是否为空
	if !logFollow {
		out, err := exec.Command(args[0], args[1:]...).CombinedOutput()
		output := strings.TrimSpace(string(out))
		if err != nil || output == "" || strings.Contains(output, "-- No entries --") {
			// journal 为空，回退到日志文件
			viewLogFile(cfg)
			return
		}
		fmt.Printf("📋 系统服务日志 (最近 %d 行)：\n", logLines)
		fmt.Println(strings.Repeat("─", 50))
		fmt.Println(output)
		return
	}

	// 跟踪模式：先快速检查 journal 是否有内容，再决定是否回退
	checkOut, _ := exec.Command("journalctl", "-u", "pika-agent", "-n", "1").CombinedOutput()
	checkOutput := strings.TrimSpace(string(checkOut))
	if checkOutput == "" || strings.Contains(checkOutput, "-- No entries --") {
		// journal 为空，回退到日志文件
		viewLogFile(cfg)
		return
	}

	fmt.Printf("📋 正在跟踪系统服务日志 (最近 %d 行)...\n", logLines)
	fmt.Println("按 Ctrl+C 退出")
	fmt.Println()

	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		log.Printf("⚠️  查看服务日志失败: %v", err)
	}
}

// viewDarwinServiceLog macOS 系统服务日志查看
func viewDarwinServiceLog() {
	args := []string{"log", "show"}
	args = append(args, "--predicate", `subsystem == "org.pika.pika-agent"`)
	args = append(args, "--last", fmt.Sprintf("%d", logLines))
	if logFollow {
		args = append(args, "--stream")
	}

	if logFollow {
		fmt.Printf("📋 正在跟踪系统服务日志 (最近 %d 行)...\n", logLines)
		fmt.Println("按 Ctrl+C 退出")
		fmt.Println()
	} else {
		fmt.Printf("📋 系统服务日志 (最近 %d 行)：\n", logLines)
		fmt.Println(strings.Repeat("─", 50))
	}

	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		log.Printf("⚠️  查看服务日志失败: %v", err)
	}
}

// viewWindowsServiceLog Windows 系统服务日志查看
func viewWindowsServiceLog() {
	psCmd := fmt.Sprintf("Get-WinEvent -FilterHashtable @{LogName='Application';ProviderName='pika-agent'} -MaxEvents %d | Format-List TimeCreated, Message", logLines)
	cmd := exec.Command("powershell", "-NoProfile", "-Command", psCmd)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if logFollow {
		fmt.Printf("📋 正在跟踪系统服务日志 (最近 %d 行)...\n", logLines)
		fmt.Println("按 Ctrl+C 退出")
		fmt.Println()
	} else {
		fmt.Printf("📋 系统服务日志 (最近 %d 行)：\n", logLines)
		fmt.Println(strings.Repeat("─", 50))
	}

	if err := cmd.Run(); err != nil {
		log.Printf("⚠️  查看服务日志失败: %v", err)
	}
}

// viewLogFile 查看日志文件
func viewLogFile(cfg *config.Config) {
	logFile := cfg.Agent.LogFile
	if logFile == "" {
		// 默认日志路径
		logFile = getHomeLogPath()
	}

	// 检查日志文件是否存在
	if _, err := os.Stat(logFile); os.IsNotExist(err) {
		log.Printf("⚠️  日志文件不存在: %s", logFile)
		fmt.Println()
		fmt.Println("💡 提示: 如果 Agent 以服务方式运行，请使用以下命令查看日志:")
		if runtime.GOOS == "linux" {
			fmt.Println("   journalctl -u pika-agent -n 100 -f")
		} else if runtime.GOOS == "darwin" {
			fmt.Println("   log show --predicate 'subsystem == \"org.pika.pika-agent\"' --last 100")
		} else if runtime.GOOS == "windows" {
			fmt.Println("   Get-WinEvent -FilterHashtable @{LogName='Application';ProviderName='pika-agent'} -MaxEvents 100")
		}
		fmt.Println()
		fmt.Println("或者使用 --service 参数直接查看服务日志:")
		fmt.Println("   agent log --service")
		return
	}

	if logFollow {
		fmt.Printf("📋 正在跟踪日志: %s (最近 %d 行)...\n", logFile, logLines)
		fmt.Println("按 Ctrl+C 退出")
		fmt.Println(strings.Repeat("─", 50))

		// 使用 tail -f
		cmd := exec.Command("tail", "-f", "-n", fmt.Sprintf("%d", logLines), logFile)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr

		if err := cmd.Run(); err != nil {
			log.Printf("⚠️  跟踪日志失败: %v", err)
		}
	} else {
		fmt.Printf("📋 日志文件: %s (最近 %d 行)\n", logFile, logLines)
		fmt.Println(strings.Repeat("─", 50))

		// 读取文件最后 N 行
		cmd := exec.Command("tail", "-n", fmt.Sprintf("%d", logLines), logFile)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr

		if err := cmd.Run(); err != nil {
			log.Printf("⚠️  读取日志失败: %v", err)
		}
	}
}
