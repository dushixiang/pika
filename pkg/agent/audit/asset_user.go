package audit

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dushixiang/pika/internal/protocol"
)

// UserAssetsCollector 用户资产收集器
type UserAssetsCollector struct {
	config   *Config
	executor *CommandExecutor
}

// NewUserAssetsCollector 创建用户资产收集器
func NewUserAssetsCollector(config *Config, executor *CommandExecutor) *UserAssetsCollector {
	return &UserAssetsCollector{
		config:   config,
		executor: executor,
	}
}

// Collect 收集用户资产
func (uac *UserAssetsCollector) Collect() *protocol.UserAssets {
	assets := &protocol.UserAssets{}

	// 收集系统用户
	assets.SystemUsers = uac.collectSystemUsers()

	// 收集登录历史
	assets.LoginHistory = uac.collectLoginHistory()

	// 收集当前登录
	assets.CurrentLogins = uac.collectCurrentLogins()

	// 收集SSH密钥
	assets.SSHKeys = uac.collectSSHKeys()

	// 收集Sudo用户
	assets.SudoUsers = uac.collectSudoUsers()

	// 统计信息
	assets.Statistics = uac.calculateStatistics(assets)

	return assets
}

// collectSystemUsers 收集系统用户
func (uac *UserAssetsCollector) collectSystemUsers() []protocol.UserInfo {
	var users []protocol.UserInfo

	// 读取 /etc/passwd
	passwdFile, err := os.Open("/etc/passwd")
	if err != nil {
		globalLogger.Warn("读取/etc/passwd失败: %v", err)
		return users
	}
	defer passwdFile.Close()

	// 读取 /etc/shadow 获取密码信息
	shadowPasswords := uac.readShadowPasswords()

	scanner := bufio.NewScanner(passwdFile)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Split(line, ":")
		if len(parts) < 7 {
			continue
		}

		username := parts[0]
		uid := parts[2]
		gid := parts[3]
		homeDir := parts[5]
		shell := parts[6]

		// 判断是否可登录
		isLoginable := !strings.Contains(shell, "nologin") &&
			!strings.Contains(shell, "false") &&
			shell != ""

		// 判断是否Root等效
		isRootEquiv := uid == "0" && username != "root"

		// 检查是否有密码
		hasPassword := false
		if pwd, ok := shadowPasswords[username]; ok {
			hasPassword = pwd != "" && pwd != "!" && pwd != "*"
		}

		user := protocol.UserInfo{
			Username:    username,
			UID:         uid,
			GID:         gid,
			HomeDir:     homeDir,
			Shell:       shell,
			IsLoginable: isLoginable,
			IsRootEquiv: isRootEquiv,
			HasPassword: hasPassword,
		}

		users = append(users, user)
	}

	return users
}

// readShadowPasswords 读取shadow密码
func (uac *UserAssetsCollector) readShadowPasswords() map[string]string {
	passwords := make(map[string]string)

	shadowFile, err := os.Open("/etc/shadow")
	if err != nil {
		return passwords
	}
	defer shadowFile.Close()

	scanner := bufio.NewScanner(shadowFile)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Split(line, ":")
		if len(parts) >= 2 {
			passwords[parts[0]] = parts[1]
		}
	}

	return passwords
}

// collectLoginHistory 收集登录历史
func (uac *UserAssetsCollector) collectLoginHistory() []protocol.LoginRecord {
	var records []protocol.LoginRecord

	// 使用 last 命令获取登录历史
	output, err := uac.executor.Execute("last", "-n", "50", "-F")
	if err != nil {
		globalLogger.Debug("获取登录历史失败: %v", err)
		return records
	}

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "wtmp") || strings.HasPrefix(line, "reboot") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 7 {
			continue
		}

		username := fields[0]
		terminal := fields[1]
		ip := fields[2]

		// 解析时间 (简化处理,使用当前时间作为近似)
		timestamp := time.Now().UnixMilli()

		record := protocol.LoginRecord{
			Username:  username,
			Terminal:  terminal,
			IP:        ip,
			Timestamp: timestamp,
			Status:    "success",
		}

		records = append(records, record)

		// 限制数量
		if len(records) >= 50 {
			break
		}
	}

	return records
}

// collectCurrentLogins 收集当前登录
func (uac *UserAssetsCollector) collectCurrentLogins() []protocol.LoginSession {
	var sessions []protocol.LoginSession

	// 使用 w 命令
	output, err := uac.executor.Execute("w", "-h")
	if err != nil {
		globalLogger.Debug("获取当前登录失败: %v", err)
		return sessions
	}

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		username := fields[0]
		terminal := fields[1]
		ip := fields[2]

		// 解析空闲时间
		idleStr := fields[3]
		idleTime := 0
		if idleStr != "-" {
			// 简化处理,不解析复杂格式
			fmt.Sscanf(idleStr, "%d", &idleTime)
		}

		session := protocol.LoginSession{
			Username:  username,
			Terminal:  terminal,
			IP:        ip,
			LoginTime: time.Now().UnixMilli(),
			IdleTime:  idleTime,
		}

		sessions = append(sessions, session)
	}

	return sessions
}

// collectSSHKeys 收集SSH密钥
func (uac *UserAssetsCollector) collectSSHKeys() []protocol.SSHKeyInfo {
	var keys []protocol.SSHKeyInfo

	// 获取所有用户目录
	userDirs := uac.getAllUserDirectories()

	for _, userDir := range userDirs {
		keyPath := filepath.Join(userDir, ".ssh", "authorized_keys")

		info, err := os.Stat(keyPath)
		if err != nil {
			continue
		}

		// 读取密钥文件
		file, err := os.Open(keyPath)
		if err != nil {
			continue
		}

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}

			parts := strings.Fields(line)
			if len(parts) < 2 {
				continue
			}

			keyType := parts[0]
			comment := ""
			if len(parts) > 2 {
				comment = parts[2]
			}

			// 计算指纹 (简化,只取前16个字符)
			fingerprint := ""
			if len(parts[1]) > 16 {
				fingerprint = parts[1][:16] + "..."
			} else {
				fingerprint = parts[1]
			}

			keyInfo := protocol.SSHKeyInfo{
				Username:    filepath.Base(filepath.Dir(filepath.Dir(keyPath))),
				KeyType:     keyType,
				Fingerprint: fingerprint,
				Comment:     comment,
				FilePath:    keyPath,
				AddedTime:   info.ModTime().UnixMilli(),
			}

			keys = append(keys, keyInfo)
		}
		file.Close()
	}

	return keys
}

// collectSudoUsers 收集Sudo用户
func (uac *UserAssetsCollector) collectSudoUsers() []protocol.SudoUserInfo {
	var sudoUsers []protocol.SudoUserInfo

	// 读取 /etc/sudoers
	sudoersFile, err := os.Open("/etc/sudoers")
	if err != nil {
		globalLogger.Debug("读取sudoers失败: %v", err)
		return sudoUsers
	}
	defer sudoersFile.Close()

	scanner := bufio.NewScanner(sudoersFile)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// 简单匹配包含 ALL 的行
		if !strings.Contains(line, "ALL") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 1 {
			continue
		}

		username := fields[0]
		if strings.HasPrefix(username, "%") {
			// 组,跳过
			continue
		}

		sudoUser := protocol.SudoUserInfo{
			Username: username,
			Rules:    line,
			NoPasswd: strings.Contains(line, "NOPASSWD"),
		}

		sudoUsers = append(sudoUsers, sudoUser)
	}

	return sudoUsers
}

// getAllUserDirectories 获取所有用户目录
func (uac *UserAssetsCollector) getAllUserDirectories() []string {
	var dirs []string

	// 从 /etc/passwd 读取
	file, err := os.Open("/etc/passwd")
	if err != nil {
		return dirs
	}
	defer file.Close()

	seen := make(map[string]bool)

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		parts := strings.Split(scanner.Text(), ":")
		if len(parts) >= 6 {
			homeDir := parts[5]
			if homeDir != "" && !seen[homeDir] {
				dirs = append(dirs, homeDir)
				seen[homeDir] = true
			}
		}
	}

	return dirs
}

// calculateStatistics 计算统计信息
func (uac *UserAssetsCollector) calculateStatistics(assets *protocol.UserAssets) *protocol.UserStatistics {
	stats := &protocol.UserStatistics{
		TotalUsers:       len(assets.SystemUsers),
		RecentLoginCount: len(assets.LoginHistory),
	}

	for _, user := range assets.SystemUsers {
		if user.IsLoginable {
			stats.LoginableUsers++
		}
		if user.IsRootEquiv {
			stats.RootEquivalentUsers++
		}
	}

	// 统计失败登录 (可以从 /var/log/auth.log 读取,这里简化)
	stats.FailedLoginCount = 0

	return stats
}
