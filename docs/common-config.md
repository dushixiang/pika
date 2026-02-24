# 通用配置说明

## 配置文件修改（重要）

编辑 `config.yaml` 文件，根据需要修改以下配置：

### VictoriaMetrics 配置

确保时序数据库连接信息正确：

```yaml
App:
  VictoriaMetrics:
    Enabled: true
    URL: "http://victoriametrics:8428"
    RetentionDays: 7 # 数据保留时长
    WriteTimeout: 60 # 写超时时间（秒）
    QueryTimeout: 60 # 读超时时间（秒）
```

### JWT 密钥

必须修改为强随机字符串：

```yaml
App:
  JWT:
    Secret: "your-secret-key-here"  # 必须修改
```

生成随机密钥：

```bash
openssl rand -base64 32
```

### 用户认证

配置管理员账户或启用 OIDC/GitHub 登录：

```yaml
App:
  # Basic Auth 用户（默认用户名: admin，密码: admin123）
  Users:
    admin: "$2y$12$7DXcOiX1D59xNTIn5riUKusAPLP88LxxoczWmUT83MBj5EFznbp8a"

  # 可选：启用 OIDC 认证
  OIDC:
    Enabled: false
    Issuer: "https://your-oidc-provider.com"
    ClientID: "your-client-id"
    ClientSecret: "your-client-secret"

  # 可选：启用 GitHub OAuth
  GitHub:
    Enabled: false
    ClientID: "your-github-client-id"
    ClientSecret: "your-github-client-secret"
```

### 生成新的管理员密码

```bash
# 使用 htpasswd 工具
htpasswd -nBC 12 '' | tr -d ':\n'
```

或者使用在线网站生成密码

https://tools.typesafe.cn/bcrypt

### 推荐使用第三方认证服务

为什么推荐使用第三方认证服务？

因为用户权限是一套非常通用的需求，例如登录、注销、修改密码、忘记密码、二次认证等等，这些都不是本系统的重点，没有必要去重新实现，使用第三方认证服务可以避免这个问题。

- 优先推荐 Github OAuth 认证
- 建议使用 [next-terminal](https://github.com/dushixiang/next-terminal) 作为 OIDC 认证服务，支持 OTP 认证，Passkey 认证。
  详细文档 https://docs.next-terminal.typesafe.cn/usage/oidc_server.html

### 修改配置文件后需要重启服务

```shell
docker compose restart pika
```

## 生产环境部署建议

### 1. 安全配置

- 在 `config.yaml` 中设置强随机的 JWT 密钥（`App.JWT.Secret`）
- 修改默认管理员密码或启用 OIDC/GitHub 认证
- 使用 HTTPS 反向代理（如 Nginx）
- 限制 VictoriaMetrics 端口仅允许内部访问（docker-compose 中已配置为 `127.0.0.1:8428:8428`）
- 妥善保管 `config.yaml` 文件，避免泄露敏感信息

### 2. 反向代理配置（Nginx 示例）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 故障排查

### 服务无法启动

```bash
# 查看详细日志
docker-compose logs -f

# 检查容器状态
docker-compose ps

# 重启服务
docker-compose restart
```

### VictoriaMetrics 连接失败

- 确认 VictoriaMetrics 容器已启动
- 检查 `config.yaml` 中的 VictoriaMetrics 配置是否正确：
  - `URL` 应该为 `http://victoriametrics:8428`（Docker Compose 服务名）
- 查看 VictoriaMetrics 日志：`docker-compose logs victoriametrics`
- 测试 VictoriaMetrics 是否正常工作：
  ```bash
  # 从宿主机访问
  curl http://localhost:8428/metrics

  # 从容器内访问
  docker-compose exec pika wget -O- http://victoriametrics:8428/metrics
  ```

### 配置文件问题

- 确认 `config.yaml` 文件存在于与 `docker-compose.yml` 同一目录
- 检查 `config.yaml` 文件格式是否正确（YAML 语法）
- 验证配置文件权限：`ls -l config.yaml`
- 查看容器内是否成功加载配置：
  ```bash
  docker-compose exec pika cat /app/config.yaml
  ```

### 端口冲突

如果 8080 端口被占用，修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "8081:8080"  # 将 8080 改为其他端口
```

### 网卡过滤

如果探针采集到了很多网卡，说明默认的过滤规则已经不适用于你的环境了。

你可以参考 [agent.example.yaml](../cmd/agent/agent.example.yaml) 修改 `collector` 下的 `network_include` 或者 `network_exclude` 配置。

### 多磁盘采集

本系统默认只采集根目录和 C 盘，其他磁盘需要手动配置。

你可以参考 [agent.example.yaml](../cmd/agent/agent.example.yaml) 修改 `collector` 下的 `disk_include` 配置。

### IP 归属地

- 注意：GeoIP 数据库需要手动下载并配置路径
- 下载地址 https://github.com/P3TERX/GeoLite.mmdb
- 下载后将 config.yaml 中的 GeoIP.Enabled 配置启用，并把路径替换为您的实际路径
- 需要同步修改 docker-compose.yml 中的文件映射

