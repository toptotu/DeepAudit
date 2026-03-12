# GoDeepAudit 代码修改清单

> 本文档记录了从 DeepAudit 到 GoDeepAudit 的所有代码修改。

---

## 一、品牌重命名：DeepAudit → GoDeepAudit

将项目名称从 `DeepAudit` 全面更改为 `GoDeepAudit`。

### 后端修改

| 文件 | 修改内容 |
|------|---------|
| `backend/app/core/config.py` | `PROJECT_NAME` 改为 `"GoDeepAudit"`，`SANDBOX_IMAGE` 改为 `"godeepaudit/sandbox:latest"` |
| `backend/app/main.py` | 所有日志消息和 API 响应中的 `DeepAudit` → `GoDeepAudit` |
| `backend/pyproject.toml` | 项目名称和描述 |
| `backend/docker-entrypoint.sh` | 启动日志中的名称 |
| `backend/start.sh` | 启动脚本中的名称 |
| `backend/README.md` | 文档中的名称 |
| `backend/app/services/report_generator.py` | 报告标题/水印 |
| `backend/app/services/git_ssh_service.py` | 日志中的名称 |
| `backend/app/services/agent/core/state.py` | Agent 状态模块中的名称 |
| `backend/app/services/agent/core/__init__.py` | 模块文档中的名称 |
| `backend/app/services/agent/__init__.py` | 模块文档中的名称 |
| `backend/app/services/agent/agents/verification.py` | Agent 提示词中的名称 |
| `backend/app/services/agent/agents/recon.py` | Agent 提示词中的名称 |
| `backend/app/services/agent/agents/orchestrator.py` | Agent 提示词中的名称 |
| `backend/app/services/agent/agents/analysis.py` | Agent 提示词中的名称 |
| `backend/app/services/agent/prompts/system_prompts.py` | 系统提示词中的名称 |
| `backend/app/api/v1/endpoints/agent_tasks.py` | API 端点中的名称 |
| `backend/tests/agent/run_tests.py` | 测试中的名称 |
| `backend/tests/agent/__init__.py` | 测试模块中的名称 |

### 前端修改

| 文件 | 修改内容 |
|------|---------|
| `frontend/package.json` | `"name": "deep-audit"` → `"go-deep-audit"` |
| `frontend/index.html` | `<title>` 标签 |
| `frontend/src/components/layout/Sidebar.tsx` | Logo 文字 `DEEP` + `AUDIT` → `GO` + `DEEPAUDIT`，alt 文本 |
| `frontend/src/components/layout/PageMeta.tsx` | 页面标题默认值 |
| `frontend/src/pages/NotFound.tsx` | 404 页面中的名称 |
| `frontend/src/pages/Login.tsx` | 登录页面中的名称 |
| `frontend/src/pages/Register.tsx` | 注册页面中的名称 |
| `frontend/src/pages/AgentAudit/components/SplashScreen.tsx` | 启动屏幕中的名称 |
| `frontend/src/pages/AgentAudit/components/ReportExportDialog.tsx` | 报告导出中的名称 |

### Docker/基础设施修改

| 文件 | 修改内容 |
|------|---------|
| `docker-compose.yml` | 容器名称、镜像名称 |
| `docker-compose.prod.yml` | 生产环境镜像名称 |
| `docker-compose.prod.cn.yml` | 中国镜像配置 |
| `docker-compose.override.yml` | 开发覆盖配置 |
| `scripts/setup.sh` | 安装脚本中的名称 |
| `scripts/release.sh` | 发布脚本中的名称 |
| `scripts/setup_security_tools.sh` | 安全工具脚本中的名称 |

### 文档修改

| 文件 | 修改内容 |
|------|---------|
| `README.md` | 项目标题和描述 |
| `README_EN.md` | 英文文档 |
| `DISCLAIMER.md` | 免责声明 |
| `CVEList.md` | CVE 列表文档 |
| `CONTRIBUTING.md` | 贡献指南 |
| `SECURITY.md` | 安全政策 |
| `docs/AGENT_AUDIT_ARCHITECTURE.md` | Agent 架构文档 |
| `docs/AGENT_DEPLOYMENT_CHECKLIST.md` | 部署清单 |
| `docs/FAQ.md` | FAQ 文档 |
| `docs/SECURITY_TOOLS_SETUP.md` | 安全工具设置文档 |
| `docs/DEPLOYMENT.md` | 部署文档 |
| `docs/CONFIGURATION.md` | 配置文档 |
| `docs/LLM_PROVIDERS.md` | LLM 提供商文档 |
| `docs/AGENT_AUDIT.md` | Agent 审计文档 |
| `docs/PAPER_ARCHITECTURE.md` | 架构论文 |

---

## 二、新增 Skills 管理功能

支持技能包的完整生命周期管理：上传（ZIP）、下载、新增、修改、删除。

### 新增后端文件

| 文件 | 说明 |
|------|------|
| `backend/app/models/skill.py` | Skills 数据模型（SQLAlchemy），包含 name, description, version, category, tags, file_path, file_size, file_hash, config, is_active 等字段 |
| `backend/app/schemas/skill.py` | Skills Pydantic Schema，包含 SkillCreate, SkillUpdate, SkillResponse, SkillListResponse |
| `backend/app/api/v1/endpoints/skills.py` | Skills API 端点，支持 CRUD + 上传 ZIP + 下载 + 切换启用状态 |
| `backend/alembic/versions/009_add_skills_and_mcp_tables.py` | 数据库迁移：创建 `skills` 表 |

### Skills API 端点清单

| 方法 | 路径 | 功能 |
|------|------|------|
| `GET` | `/api/v1/skills` | 获取技能包列表（支持分页、分类过滤、搜索） |
| `GET` | `/api/v1/skills/{id}` | 获取单个技能包详情 |
| `POST` | `/api/v1/skills` | 创建技能包（不含文件） |
| `POST` | `/api/v1/skills/upload` | 上传技能包（ZIP 压缩包，multipart/form-data） |
| `GET` | `/api/v1/skills/{id}/download` | 下载技能包 ZIP 文件 |
| `PUT` | `/api/v1/skills/{id}` | 更新技能包信息 |
| `DELETE` | `/api/v1/skills/{id}` | 删除技能包 |
| `PUT` | `/api/v1/skills/{id}/toggle` | 切换技能包启用/禁用状态 |

### 新增前端文件

| 文件 | 说明 |
|------|------|
| `frontend/src/shared/api/skills.ts` | Skills API 客户端 |
| `frontend/src/pages/Skills.tsx` | Skills 管理页面，包含列表、新建对话框、编辑对话框、上传对话框 |

### 前端修改文件

| 文件 | 修改内容 |
|------|---------|
| `frontend/src/app/routes.tsx` | 添加 Skills 页面路由 `/skills` |
| `frontend/src/components/layout/Sidebar.tsx` | 添加 Skills 导航图标（Package） |

---

## 三、新增 CodeCode 对接功能

支持配置 CodeCode 连接到远程 GoDeepAudit 实例，浏览并下载远程 Skills。

### 新增后端文件

| 文件 | 说明 |
|------|------|
| `backend/app/api/v1/endpoints/codecode.py` | CodeCode 对接 API 端点 |

### CodeCode API 端点清单

| 方法 | 路径 | 功能 |
|------|------|------|
| `GET` | `/api/v1/codecode/config` | 获取 CodeCode 对接配置 |
| `PUT` | `/api/v1/codecode/config` | 更新 CodeCode 对接配置 |
| `POST` | `/api/v1/codecode/test-connection` | 测试与远程服务器的连接 |
| `GET` | `/api/v1/codecode/remote-skills` | 获取远程 GoDeepAudit 实例的 Skills 列表 |
| `POST` | `/api/v1/codecode/download-skill/{id}` | 从远程实例下载指定 Skill |

### 新增前端文件

| 文件 | 说明 |
|------|------|
| `frontend/src/shared/api/codecode.ts` | CodeCode API 客户端 |

> CodeCode 对接的 UI 集成在 MCP 管理页面的「CodeCode 对接」选项卡中。

---

## 四、新增 MCP 管理功能

支持 Model Context Protocol (MCP) 服务的完整管理：创建、编辑、删除、启禁用、健康检查。

### 新增后端文件

| 文件 | 说明 |
|------|------|
| `backend/app/models/mcp_server.py` | MCP 服务数据模型（SQLAlchemy），包含 name, server_type, command, args, url, api_key, tools, resources, health_status 等字段 |
| `backend/app/schemas/mcp_server.py` | MCP 服务 Pydantic Schema |
| `backend/app/api/v1/endpoints/mcp_servers.py` | MCP 服务 API 端点 |
| `backend/alembic/versions/009_add_skills_and_mcp_tables.py` | 数据库迁移：创建 `mcp_servers` 表 |

### MCP API 端点清单

| 方法 | 路径 | 功能 |
|------|------|------|
| `GET` | `/api/v1/mcp-servers` | 获取 MCP 服务列表 |
| `GET` | `/api/v1/mcp-servers/{id}` | 获取单个 MCP 服务详情 |
| `POST` | `/api/v1/mcp-servers` | 创建 MCP 服务 |
| `PUT` | `/api/v1/mcp-servers/{id}` | 更新 MCP 服务配置 |
| `DELETE` | `/api/v1/mcp-servers/{id}` | 删除 MCP 服务 |
| `PUT` | `/api/v1/mcp-servers/{id}/toggle` | 切换 MCP 服务启用状态 |
| `POST` | `/api/v1/mcp-servers/{id}/health-check` | 执行健康检查 |

### MCP 服务支持的类型

| 类型 | 说明 |
|------|------|
| `stdio` | 标准输入输出模式，通过本地命令启动 |
| `sse` | Server-Sent Events 模式，通过 URL 连接 |
| `streamable-http` | HTTP 流式模式，通过 URL 连接 |

### 新增前端文件

| 文件 | 说明 |
|------|------|
| `frontend/src/shared/api/mcpServers.ts` | MCP 服务 API 客户端 |
| `frontend/src/pages/McpManager.tsx` | MCP 管理页面（含 MCP 服务管理 + CodeCode 对接两个选项卡） |

### 前端修改文件

| 文件 | 修改内容 |
|------|---------|
| `frontend/src/app/routes.tsx` | 添加 MCP 管理页面路由 `/mcp` |
| `frontend/src/components/layout/Sidebar.tsx` | 添加 MCP 导航图标（Plug） |

---

## 五、后端路由注册

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `backend/app/api/v1/api.py` | 注册 3 个新路由：`/skills`、`/mcp-servers`、`/codecode` |
| `backend/app/models/__init__.py` | 导入新模型：`Skill`、`McpServer` |

---

## 六、数据库变更

### 新增表

| 表名 | 说明 | 迁移文件 |
|------|------|---------|
| `skills` | 技能包管理表 | `009_add_skills_and_mcp_tables.py` |
| `mcp_servers` | MCP 服务配置表 | `009_add_skills_and_mcp_tables.py` |

### skills 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(36) PK | 主键 |
| name | String(200) | 技能包名称 |
| description | Text | 描述 |
| version | String(50) | 版本号 |
| category | String(50) | 分类 |
| tags | JSON | 标签列表 |
| file_path | String(500) | 文件存储路径 |
| file_size | Integer | 文件大小 |
| file_hash | String(64) | 文件 SHA256 哈希 |
| original_filename | String(255) | 原始文件名 |
| config | JSON | 配置信息 |
| entry_point | String(255) | 入口文件 |
| is_active | Boolean | 是否启用 |
| is_system | Boolean | 是否系统内置 |
| download_count | Integer | 下载次数 |
| source | String(50) | 来源 (local/upload/codecode) |
| source_url | String(500) | 来源 URL |
| created_by | String(36) FK | 创建者 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### mcp_servers 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(36) PK | 主键 |
| name | String(200) | 服务名称 |
| description | Text | 描述 |
| server_type | String(50) | 类型 (stdio/sse/streamable-http) |
| command | String(500) | 启动命令 |
| args | JSON | 命令参数 |
| env | JSON | 环境变量 |
| url | String(500) | 服务 URL |
| api_key | String(500) | API Key |
| headers | JSON | HTTP Headers |
| tools | JSON | 可用工具列表 |
| resources | JSON | 可用资源列表 |
| prompts_config | JSON | Prompt 配置 |
| is_active | Boolean | 是否启用 |
| health_status | String(20) | 健康状态 |
| last_health_check | DateTime | 最后检查时间 |
| config | JSON | 额外配置 |
| timeout_seconds | Integer | 超时时间 |
| max_retries | Integer | 最大重试次数 |
| created_by | String(36) FK | 创建者 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

---

## 七、文件变更汇总

### 新增文件（共 12 个）

```
backend/app/models/skill.py
backend/app/models/mcp_server.py
backend/app/schemas/skill.py
backend/app/schemas/mcp_server.py
backend/app/api/v1/endpoints/skills.py
backend/app/api/v1/endpoints/mcp_servers.py
backend/app/api/v1/endpoints/codecode.py
backend/alembic/versions/009_add_skills_and_mcp_tables.py
frontend/src/shared/api/skills.ts
frontend/src/shared/api/mcpServers.ts
frontend/src/shared/api/codecode.ts
frontend/src/pages/Skills.tsx
frontend/src/pages/McpManager.tsx
CHANGELOG_GoDeepAudit.md
```

### 修改文件（约 50+ 个）

- 品牌重命名涉及约 50 个文件的文本替换
- `backend/app/api/v1/api.py` — 注册新路由
- `backend/app/models/__init__.py` — 导入新模型
- `frontend/src/app/routes.tsx` — 添加新页面路由
- `frontend/src/components/layout/Sidebar.tsx` — 添加导航图标
