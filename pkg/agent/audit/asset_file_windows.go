//go:build windows

package audit

import (
	"os"

	"github.com/dushixiang/pika/internal/protocol"
)

// fillFileOwnership 填充文件所有者和组信息 (Windows系统)
// Windows 系统不支持 Unix 风格的 UID/GID，这里留空
func (fac *FileAssetsCollector) fillFileOwnership(fileInfo *protocol.FileInfo, info os.FileInfo) {
	// Windows 系统不填充 Owner 和 Group 字段
	// 可以在未来扩展以支持 Windows SID
}
