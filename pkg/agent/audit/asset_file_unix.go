//go:build linux || darwin

package audit

import (
	"fmt"
	"os"
	"syscall"

	"github.com/dushixiang/pika/internal/protocol"
)

// fillFileOwnership 填充文件所有者和组信息 (Unix系统)
func (fac *FileAssetsCollector) fillFileOwnership(fileInfo *protocol.FileInfo, info os.FileInfo) {
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		fileInfo.Owner = fmt.Sprintf("%d", stat.Uid)
		fileInfo.Group = fmt.Sprintf("%d", stat.Gid)
	}
}
