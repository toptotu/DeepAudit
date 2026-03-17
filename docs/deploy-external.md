# DeepAudit 外网部署指南

> 将 DeepAudit 从本地开发环境部署到公网可访问的生产环境

## 目录

1. [快速部署（5 分钟）](#1-快速部署5-分钟)
2. [架构说明](#2-架构说明)
3. [服务器准备](#3-服务器准备)
4. [配置文件说明](#4-配置文件说明)
5. [HTTP 部署（适合内网或测试）](#5-http-部署)
6. [HTTPS 部署（推荐生产环境）](#6-https-部署推荐)
7. [使用已有 Nginx 反向代理](#7-使用已有-nginx-反向代理)
8. [云服务商安全组配置](#8-云服务商安全组配置)
9. [常见问题](#9-常见问题)
10. [安全加固清单](#10-安全加固清单)

---

## 1. 快速部署（5 分钟）

```bash
# 克隆项目（或使用已有目录）
git clone https://github.com/lintsinghua/DeepAudit.git
cd DeepAudit

# 一键部署（交互式配置 LLM Key）
bash scripts/deploy.sh
```

完成后访问 `http://你的服务器IP`

---

## 2. 架构说明

### 端口映射（外网模式）

```
公网用户
   │
   ▼
[服务器防火墙/安全组]
   │ 80 / 443 放行
   ▼
[Docker: frontend 容器]
[Nginx: 监听 80/443]
   │ /api/* 代理
   ▼
[Docker 内网: backend:8000]  ← 不直接对外暴露
   │
   ├── [Docker 内网: db:5432]      ← 不对外暴露
   └── [Docker 内网: redis:6379]   ← 不对外暴露
```

### 与开发模式的区别

| 项目 | 开发模式 (`docker-compose.yml`) | 外网模式 (`docker-compose.external.yml`) |
|------|------|------|
| 前端端口 | `3000:80` | **`80:80` + `443:443`** |
| 后端端口 | `8000:8000`（暴露到宿主机） | `expose: 8000`（仅内网） |
| 数据库端口 | `5432:5432`（暴露到宿主机） | **不暴露** |
| Redis 端口 | `6379:6379`（暴露到宿主机） | **不暴露** |
| 数据库密码 | 默认 `postgres` | **环境变量，需强密码** |
| Redis 密码 | 无 | **环境变量，需设置** |
| JWT Secret | 代码默认值 | **环境变量，需设置** |

---

## 3. 服务器准备

### 最低配置要求

| 组件 | 最低 | 推荐 |
|------|------|------|
| CPU | 2 核 | 4 核+ |
| 内存 | 4 GB | 8 GB+ |
| 磁盘 | 20 GB | 50 GB+ |
| 系统 | Ubuntu 22.04 | Ubuntu 22.04 LTS |

### 安装 Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | bash

# 添加当前用户到 docker 组（免 sudo）
sudo usermod -aG docker $USER
newgrp docker

# 验证
docker version
docker compose version
```

### 开放防火墙端口

```bash
# Ubuntu UFW
sudo ufw allow 22/tcp    # SSH（务必保留）
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
sudo ufw status

# CentOS/RHEL firewalld
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

> **云服务器额外步骤**：还需在云厂商控制台的安全组中开放 80/443 端口，见[第 8 节](#8-云服务商安全组配置)。

---

## 4. 配置文件说明

```
DeepAudit/
├── docker-compose.external.yml   ← 外网部署专用 Compose 文件
├── .env.prod.example             ← 环境变量模板（复制为 .env.prod）
├── .env.prod                     ← 实际配置（需自行创建，不提交 git）
├── frontend/
│   ├── nginx.external.conf       ← HTTP 模式 Nginx 配置
│   └── nginx.https.conf          ← HTTPS 模式 Nginx 配置（含 SSL）
├── certs/                        ← SSL 证书目录（setup-ssl.sh 自动创建）
└── scripts/
    ├── deploy.sh                 ← 一键部署脚本
    └── setup-ssl.sh              ← Let's Encrypt 证书申请脚本
```

---

## 5. HTTP 部署

适合：内网环境、测试环境、使用上游 SSL 卸载（CDN/SLB）的场景。

### 步骤

```bash
# 1. 复制并编辑配置
cp .env.prod.example .env.prod
vim .env.prod
```

`.env.prod` 最少需要填写：

```bash
DB_PASSWORD=你的数据库强密码
REDIS_PASSWORD=你的Redis强密码
SECRET_KEY=你的JWT密钥（openssl rand -hex 32）
LLM_API_KEY=sk-你的API密钥
LLM_MODEL=gpt-4o
```

```bash
# 2. 启动服务
docker compose -f docker-compose.external.yml --env-file .env.prod up -d

# 3. 查看状态
docker compose -f docker-compose.external.yml ps

# 4. 访问
# http://你的服务器IP
```

---

## 6. HTTPS 部署（推荐）

### 前提条件

1. 已有一个域名（如 `deepaudit.example.com`）
2. 域名 DNS A 记录已解析到服务器 IP
3. 服务器 80 端口可公网访问（用于 Let's Encrypt 域名验证）

### 步骤

```bash
# 1. 配置 .env.prod（同上）
cp .env.prod.example .env.prod
# 设置 DOMAIN=deepaudit.example.com 以及其他必填项
vim .env.prod

# 2. 先用 HTTP 模式启动（Let's Encrypt 需要用 80 端口验证）
docker compose -f docker-compose.external.yml --env-file .env.prod up -d

# 3. 申请 SSL 证书
bash scripts/setup-ssl.sh deepaudit.example.com your@email.com

# 4. 修改 docker-compose.external.yml 中 frontend 的 volumes：
#    取消 HTTPS 配置的注释，注释掉 HTTP 配置
vim docker-compose.external.yml
```

在 `docker-compose.external.yml` 中找到 frontend volumes 部分，修改为：

```yaml
volumes:
  # 注释掉 HTTP 配置
  # - ./frontend/nginx.external.conf:/etc/nginx/conf.d/default.conf:ro
  # 取消注释 HTTPS 配置
  - ./frontend/nginx.https.generated.conf:/etc/nginx/conf.d/default.conf:ro
  - ./certs:/etc/nginx/certs:ro
```

```bash
# 5. 重启 frontend 容器使 HTTPS 配置生效
docker compose -f docker-compose.external.yml --env-file .env.prod up -d frontend

# 6. 访问
# https://deepaudit.example.com
```

### 证书自动续签

`setup-ssl.sh` 已自动配置 crontab 每天凌晨检查续签，无需手动操作。

查看续签日志：

```bash
cat /var/log/deepaudit-ssl-renew.log
```

---

## 7. 使用已有 Nginx 反向代理

如果服务器上已有 Nginx 在管理其他网站，推荐使用这种方式：

### 方案：DeepAudit 监听非标准端口，由系统 Nginx 转发

```bash
# 修改 docker-compose.external.yml，让 frontend 只监听内部端口
# 将 "80:80" 改为 "127.0.0.1:8080:80"
```

在系统 Nginx 中添加虚拟主机配置：

```nginx
# /etc/nginx/sites-available/deepaudit
server {
    listen 80;
    server_name deepaudit.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name deepaudit.example.com;

    ssl_certificate /etc/letsencrypt/live/deepaudit.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/deepaudit.example.com/privkey.pem;

    # 代理到 DeepAudit Docker 容器
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # SSE 流式传输（重要！）
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header X-Accel-Buffering no;
        proxy_read_timeout 300s;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        client_max_body_size 500M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/deepaudit /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### 方案：使用 Caddy（自动 HTTPS，最简单）

```caddy
# /etc/caddy/Caddyfile
deepaudit.example.com {
    reverse_proxy 127.0.0.1:8080 {
        flush_interval -1   # 禁用缓冲（SSE 必须）
        transport http {
            read_timeout 300s
        }
    }
}
```

```bash
sudo systemctl reload caddy
```

---

## 8. 云服务商安全组配置

### 阿里云 ECS

1. 进入 **云服务器 ECS** → **实例** → 点击实例
2. 左侧 **本实例安全组** → **配置规则**
3. **入方向** → **手动添加**：
   - 端口范围: `80/80`，授权对象: `0.0.0.0/0`
   - 端口范围: `443/443`，授权对象: `0.0.0.0/0`

### 腾讯云 CVM

1. 进入 **云服务器** → **安全组**
2. 选择关联的安全组 → **编辑入站规则**
3. 添加规则：`HTTP(80)` 和 `HTTPS(443)`，来源 `0.0.0.0/0`

### AWS EC2

1. EC2 控制台 → **Security Groups**
2. 选择实例的安全组 → **Edit inbound rules**
3. 添加：Type `HTTP (80)` 和 `HTTPS (443)`，Source `0.0.0.0/0, ::/0`

### 华为云 ECS

1. **网络控制台** → **安全组** → 选择安全组
2. **入方向规则** → **添加规则**
3. 协议: `TCP`，端口: `80`，源地址: `0.0.0.0/0`（443 同理）

---

## 9. 常见问题

### Q: 访问 http://IP 显示 502 Bad Gateway

```bash
# 查看后端日志
docker compose -f docker-compose.external.yml logs backend --tail=50

# 检查后端是否正常运行
docker compose -f docker-compose.external.yml ps
```

常见原因：
- 后端启动失败（LLM API Key 未配置）
- 数据库迁移失败

### Q: 前端加载后 API 请求失败（403/401）

```bash
# 检查 nginx 代理是否正常
docker compose -f docker-compose.external.yml exec frontend nginx -t
docker compose -f docker-compose.external.yml logs frontend
```

### Q: SSE 实时日志不显示（审计过程看不到日志）

Nginx 必须关闭缓冲。检查 nginx.conf 中是否有：

```nginx
proxy_buffering off;
proxy_set_header X-Accel-Buffering no;
```

如果使用上游 Nginx/CDN 代理，也需要在上游配置这些头。

### Q: 上传 ZIP 文件失败（413 Request Entity Too Large）

在 nginx 配置中增大上传限制：

```nginx
client_max_body_size 500M;  # 已默认配置
```

### Q: HTTPS 证书申请失败

检查：
1. 域名是否已解析到服务器 IP
2. 服务器 80 端口是否可公网访问（安全组是否开放）
3. 申请时服务是否已停止（避免端口冲突）

```bash
# 测试 80 端口是否可从外部访问
curl -I http://你的域名
```

### Q: 如何查看和管理数据

```bash
# 进入数据库容器
docker compose -f docker-compose.external.yml exec db psql -U deepaudit -d deepaudit

# 备份数据库
docker compose -f docker-compose.external.yml exec db pg_dump -U deepaudit deepaudit > backup.sql

# 恢复数据库
cat backup.sql | docker compose -f docker-compose.external.yml exec -T db psql -U deepaudit -d deepaudit
```

### Q: 如何修改管理员密码

部署后通过 Web 界面注册第一个用户，该用户即为管理员。

---

## 10. 安全加固清单

部署到公网前，请逐项确认：

- [ ] `.env.prod` 中所有 `CHANGE_ME` 已替换为强密码
- [ ] `SECRET_KEY` 已设置为随机字符串（`openssl rand -hex 32`）
- [ ] 数据库端口（5432）未暴露到公网
- [ ] Redis 端口（6379）未暴露到公网
- [ ] 后端端口（8000）未暴露到公网
- [ ] 已配置 HTTPS（生产环境强烈建议）
- [ ] 服务器 SSH 密钥登录，已禁用密码登录
- [ ] 服务器防火墙只开放必要端口（22/80/443）
- [ ] 定期备份数据库（可添加 crontab 定时任务）
- [ ] 如使用 LLM API Key，确认其权限最小化

```bash
# 生成强密码示例
openssl rand -hex 16    # 32 位十六进制密码
openssl rand -base64 24 # 32 位 Base64 密码
openssl rand -hex 32    # JWT Secret（推荐 64 位）
```
