package web

import (
	"embed"
	"encoding/base64"
	"io/fs"
)

//go:embed dist/*
var distFS embed.FS

func Assets() fs.FS {
	sub, _ := fs.Sub(distFS, "dist")
	return sub
}

//go:embed dist/index.html
var indexHtml string

func IndexHtml() string {
	return indexHtml
}

//go:embed public/logo.png
var defaultLogo []byte

func DefaultLogo() []byte {
	return defaultLogo
}

// DefaultLogoBase64 返回默认 Logo 的 base64 编码（data URI 格式）
func DefaultLogoBase64() string {
	if len(defaultLogo) == 0 {
		return ""
	}
	// 编码为 base64 并添加 data URI 前缀
	encoded := base64.StdEncoding.EncodeToString(defaultLogo)
	return "data:image/png;base64," + encoded
}
