# Stalwart + SnappyMail 本地部署指南

## 项目信息

| 组件 | GitHub | 文档 |
|---|---|---|
| **Stalwart** | https://github.com/stalwartlabs/stalwart | https://stalw.art/docs |
| **SnappyMail** | https://github.com/the-djmaze/snappymail | https://github.com/the-djmaze/snappymail/wiki |

## 组件说明

### Stalwart — 邮件服务器

- Rust 编写，单二进制文件
- 支持 SMTP / IMAP / JMAP / POP3
- 内置垃圾邮件过滤、DKIM/SPF/DMARC
- 存储：RocksDB（嵌入式，无需额外数据库）
- 自带 Web 管理后台
- 最低 512MB RAM 即可运行

### SnappyMail — Web 收件箱界面

- 基于 PHP 的轻量 Webmail 客户端
- RainLoop 的现代化分支
- 无需数据库，文件存储
- Docker 镜像约 60MB
- 自带管理面板（`/admin`）

---

## 前置要求

- Docker + Docker Compose
- 至少 2GB 可用磁盘空间
- 本地测试不需要域名，用 IP 即可

---

## 部署步骤

### 第一步：创建项目目录

```bash
mkdir -p ~/mail-server/{stalwart,snappymail}
cd ~/mail-server
```

### 第二步：创建 docker-compose.yml

在项目目录下创建 `docker-compose.yml`：

```yaml
version: "3.8"

services:
  stalwart:
    image: stalwartlabs/mail-server:latest
    container_name: stalwart
    restart: unless-stopped
    ports:
      - "25:25"
      - "587:587"
      - "993:993"
      - "443:443"
      - "8080:8080"
    volumes:
      - ./stalwart/config:/opt/stalwart-mail/config
      - ./stalwart/data:/opt/stalwart-mail/data
      - ./stalwart/logs:/opt/stalwart-mail/logs
    environment:
      - TZ=Asia/Shanghai
    networks:
      - mailnet

  snappymail:
    image: hotarudash/snappymail:latest
    container_name: snappymail
    restart: unless-stopped
    ports:
      - "8081:8888"
    volumes:
      - ./snappymail/data:/var/lib/snappymail
    environment:
      - TZ=Asia/Shanghai
    networks:
      - mailnet

networks:
  mailnet:
    driver: bridge
```

### 第三步：启动服务

```bash
cd ~/mail-server
docker compose up -d
```

### 第四步：获取 Stalwart 管理员密码

```bash
docker logs stalwart 2>&1 | grep -i admin
```

输出示例：

```
Admin user: admin
Admin password: xxxxxxxx
```

> 记下这个密码，下一步登录要用。

### 第五步：配置 Stalwart

1. 浏览器打开 `http://你的IP:8080/admin`
2. 使用上面的 admin 账号登录
3. **添加域名**：
   - 进入 **Settings → Domains → Add Domain**
   - 填写域名（本地测试填 `local.test` 即可）
4. **创建用户**：
   - 进入 **Accounts → Add Account**
   - 填写用户名（如 `test001`）
   - 设置密码
   - 关联到刚才创建的域名

### 第六步：配置 SnappyMail 连接 Stalwart

1. 浏览器打开 `http://你的IP:8081/admin`
2. 默认管理密码 `12345`（登录后立即修改）
3. **添加域名**：
   - 进入 **Domains** 页面
   - 添加域名 `local.test`
4. **配置 IMAP**：
   - Host: `stalwart`（Docker 网络内使用服务名）
   - Port: `993`
   - Secure: TLS
5. **配置 SMTP**：
   - Host: `stalwart`
   - Port: `587`
   - Secure: STARTTLS

### 第七步：访问邮箱

浏览器打开 `http://你的IP:8081`，用第五步创建的账号登录即可收发邮件。

---

## 快速验证

```bash
# 检查两个容器都在运行
docker compose ps

# 检查 Stalwart 端口监听
ss -tlnp | grep -E '25|587|993|443|8080'

# 检查 SnappyMail 端口
ss -tlnp | grep 8081
```

预期结果：两个容器状态为 `Up`，对应端口处于监听状态。

---

## 端口说明

| 端口 | 服务 | 用途 |
|---|---|---|
| 25 | Stalwart | SMTP 入站（接收外部邮件） |
| 587 | Stalwart | SMTP 提交（客户端发信） |
| 993 | Stalwart | IMAPS（客户端收取邮件） |
| 443 | Stalwart | HTTPS（JMAP / WebAdmin） |
| 8080 | Stalwart | Web 管理后台（HTTP） |
| 8081 | SnappyMail | Webmail 收件箱界面 |

> 如果本地端口冲突，修改 `docker-compose.yml` 中冒号前的主机端口映射即可。

---

## 数据持久化

| 组件 | 数据目录 | 说明 |
|---|---|---|
| Stalwart 配置 | `~/mail-server/stalwart/config` | 配置文件、TLS 证书 |
| Stalwart 数据 | `~/mail-server/stalwart/data` | RocksDB 邮件存储 |
| Stalwart 日志 | `~/mail-server/stalwart/logs` | 运行日志 |
| SnappyMail | `~/mail-server/snappymail/data` | 用户偏好、缓存 |

备份时只需打包 `~/mail-server/` 整个目录即可。

---

## 注意事项

- 本地测试不需要配 DNS（MX/SPF/DKIM）、SSL 证书
- Stalwart 默认使用 RocksDB 嵌入式存储，不需要额外数据库
- SnappyMail 无数据库依赖，纯文件存储
- 如果端口 8080/8081 被占用，修改 docker-compose 中冒号前的端口号
- SnappyMail 初始管理密码是 `12345`，务必登录后立即修改
