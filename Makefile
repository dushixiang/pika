# 版本号（可通过 make VERSION=1.0.0 指定）
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

# Agent 版本号基于 pkg/agent/ 目录的最后修改提交生成
# 格式：agent-{最近修改 pkg/agent 的提交短hash}-{提交数量}
AGENT_VERSION ?= $(shell \
	LAST_COMMIT=$$(git log -1 --format=%h -- pkg/agent 2>/dev/null || echo "dev"); \
	COMMIT_COUNT=$$(git rev-list --count HEAD -- pkg/agent 2>/dev/null || echo "0"); \
	if [ "$$LAST_COMMIT" = "dev" ]; then \
		echo "dev"; \
	else \
		echo "$$LAST_COMMIT-$$COMMIT_COUNT"; \
	fi \
)

GIT_REVISION=$(shell git rev-parse HEAD)
GO_VERSION=$(shell go version)
BUILD_TIME=$(shell date +%Y-%m-%d_%H:%M:%S)

# Go 构建参数
LDFLAGS=-s -w -X 'github.com/dushixiang/pika/pkg/version.Version=$(VERSION)' -X 'github.com/dushixiang/pika/pkg/version.AgentVersion=$(AGENT_VERSION)'
AGENT_LDFLAGS=-s -w -X 'github.com/dushixiang/pika/pkg/version.Version=$(VERSION)' -X 'github.com/dushixiang/pika/pkg/version.AgentVersion=$(AGENT_VERSION)'
GOFLAGS=CGO_ENABLED=0

# 构建前端
build-web:
	cd web && yarn && yarn build

# 构建服务端（开发）
build-server:
	$(GOFLAGS) GOOS=linux GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o bin/pika-linux-amd64 cmd/serv/main.go
	upx bin/pika-linux-amd64

build-servers:
	$(GOFLAGS) GOOS=linux GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o bin/pika-linux-amd64 cmd/serv/main.go
	$(GOFLAGS) GOOS=linux GOARCH=arm64 go build -ldflags="$(LDFLAGS)" -o bin/pika-linux-arm64 cmd/serv/main.go

	upx bin/pika-linux-amd64
	upx bin/pika-linux-arm64

# 构建所有平台的 Agent
build-agents:
	@echo "Building agents for all platforms..."
	@echo "Server version: $(VERSION)"
	@echo "Agent version: $(AGENT_VERSION)"
	@mkdir -p bin/agents

	# Linux
	$(GOFLAGS) GOOS=linux GOARCH=amd64 go build -ldflags="$(AGENT_LDFLAGS)" -o bin/agents/pika-agent-linux-amd64 cmd/agent/*.go
	$(GOFLAGS) GOOS=linux GOARCH=arm64 go build -ldflags="$(AGENT_LDFLAGS)" -o bin/agents/pika-agent-linux-arm64 cmd/agent/*.go
	$(GOFLAGS) GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="$(AGENT_LDFLAGS)" -o bin/agents/pika-agent-linux-armv7 cmd/agent/*.go
	$(GOFLAGS) GOOS=linux GOARCH=loong64 go build -ldflags="$(AGENT_LDFLAGS)" -o bin/agents/pika-agent-linux-loong64 cmd/agent/*.go

	# macOS
	$(GOFLAGS) GOOS=darwin GOARCH=amd64 go build -ldflags="$(AGENT_LDFLAGS)" -o bin/agents/pika-agent-darwin-amd64 cmd/agent/*.go
	$(GOFLAGS) GOOS=darwin GOARCH=arm64 go build -ldflags="$(AGENT_LDFLAGS)" -o bin/agents/pika-agent-darwin-arm64 cmd/agent/*.go

	# Windows
	$(GOFLAGS) GOOS=windows GOARCH=amd64 go build -ldflags="$(AGENT_LDFLAGS)" -o bin/agents/pika-agent-windows-amd64.exe cmd/agent/*.go

	@echo "All agents built successfully!"
	@echo "Compressing agents with UPX..."
	@upx bin/agents/pika-agent-linux-amd64
	@upx bin/agents/pika-agent-linux-arm64
	@upx bin/agents/pika-agent-linux-armv7
	@echo "All agents compressed successfully!"
	@ls -lh bin/agents/

# 构建所有
build-release:
	make build-web
	make build-agents
	make build-servers

# 清理编译产物
clean:
	rm -rf bin/*
	rm -rf web/dist

# 运行测试
test:
	go test -v ./...

# 代码格式化
fmt:
	go fmt ./...
	cd web && yarn format

# 代码检查
lint:
	golangci-lint run

# 生成 Wire 代码
wire:
	cd internal && wire

# 显示版本信息
version:
	@echo "Server Version: $(VERSION)"
	@echo "Agent Version: $(AGENT_VERSION)"
	@echo "Git Revision: $(GIT_REVISION)"
	@echo "Go Version: $(GO_VERSION)"
	@echo "Build Time: $(BUILD_TIME)"
