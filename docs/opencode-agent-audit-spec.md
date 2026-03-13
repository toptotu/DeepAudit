# DeepAudit OpenCode Agent 审计扩展方案

> 版本: 1.0 | 状态: 实施中 | 技术栈: FastAPI + React + OpenCode

## 目录

1. [背景与目标](#1-背景与目标)
2. [整体架构](#2-整体架构)
3. [OpenCode 集成设计](#3-opencode-集成设计)
4. [数据模型设计](#4-数据模型设计)
5. [后端 API 设计](#5-后端-api-设计)
6. [Skills 体系设计](#6-skills-体系设计)
7. [MCP 工具集成](#7-mcp-工具集成)
8. [审计结果兼容层](#8-审计结果兼容层)
9. [问题管理与闭环](#9-问题管理与闭环)
10. [报告优化方案](#10-报告优化方案)
11. [前端交互设计](#11-前端交互设计)
12. [实施路线图](#12-实施路线图)

---

## 1. 背景与目标

### 现有架构分析

DeepAudit v3.x 已建立完整的多 Agent 审计流水线：
- **OrchestratorAgent** 协调 ReconAgent / AnalysisAgent / VerificationAgent
- 基于 LangGraph + LangChain 的 ReAct 模式
- 30+ 内置安全工具 (Semgrep, Bandit, Gitleaks 等)
- RAG 辅助的语义代码检索
- Docker 沙箱 PoC 验证

### 扩展目标

| 目标 | 说明 |
|------|------|
| OpenCode Agent 模式 | 以 OpenCode 作为审计执行引擎，支持更灵活的代码理解 |
| 项目级隔离 | 每个项目独立的 OpenCode 服务实例（端口+代码路径隔离） |
| Skills 注入 | 运行时动态注入审计技能（OWASP、业务逻辑、框架特定规则等） |
| MCP 工具扩展 | 通过 MCP 协议扩展 OpenCode 的工具能力 |
| 问题闭环管理 | 对发现的每个问题支持确认/拒绝/分配/跟踪/关闭流程 |
| 报告增强 | 支持问题状态管理、审计进度追踪、闭环统计 |

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        DeepAudit Frontend                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐ │
│  │  OpenCode 项目   │  │  Skills/MCP 管理 │  │  问题管理面板     │ │
│  │  管理 (CRUD)     │  │  配置界面        │  │  确认/闭环流程    │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘ │
└───────────┼─────────────────────┼────────────────────┼──────────┘
            │                     │                    │
            ▼                     ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DeepAudit Backend (FastAPI)                    │
│                                                                   │
│  /api/v1/opencode/         /api/v1/agent-tasks/{id}/            │
│  ├── projects (CRUD)       ├── findings/{id}/comments            │
│  ├── skills (CRUD)         ├── findings/{id}/review              │
│  ├── mcp-tools (CRUD)      ├── findings/batch-update             │
│  ├── {id}/start            └── {id}/report (enhanced)            │
│  ├── {id}/stop                                                    │
│  ├── {id}/inject-skills    OpenCodeService                        │
│  ├── {id}/inject-mcp       ├── Port Pool Manager (9100-9199)     │
│  └── {id}/audit            ├── Process Lifecycle Manager         │
│                            ├── OpenCode API Client               │
│  ResultTransformer         └── Audit Result Transformer          │
│  └── OpenCode → AgentFinding                                      │
└───────────────────────┬─────────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
  │ OpenCode    │ │ OpenCode     │ │ OpenCode     │
  │ Server      │ │ Server       │ │ Server       │
  │ :9100       │ │ :9101        │ │ :9102        │
  │ /proj-A     │ │ /proj-B      │ │ /proj-C      │
  └─────────────┘ └──────────────┘ └──────────────┘
```

---

## 3. OpenCode 集成设计

### 3.1 OpenCode 服务器管理

每个 OpenCode 审计项目对应一个独立的 OpenCode 服务进程：

```
opencode serve --port <port> --cwd <code_path>
```

**端口池**: 9100 - 9199（可通过配置扩展）

**进程生命周期**:
```
created → starting → running → auditing → idle → stopping → stopped
```

### 3.2 OpenCode REST API

OpenCode 服务启动后，通过其 HTTP API 进行通信：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /session | 创建新审计会话 |
| POST | /session/{id}/message | 发送审计指令 |
| GET | /session/{id}/events | 获取实时事件 (SSE) |
| GET | /session/{id}/messages | 获取所有消息 |
| DELETE | /session/{id} | 关闭会话 |

### 3.3 Skills 注入机制

Skills 通过 OpenCode 的 Session 系统提示词注入：

```json
{
  "systemPrompt": "<skill_prompts_combined>",
  "tools": ["<mcp_tool_names>"]
}
```

### 3.4 MCP 工具注入

MCP 工具通过 OpenCode 配置文件注入：

```json
{
  "mcp": {
    "<tool_name>": {
      "type": "http",
      "url": "http://mcp-server:port/mcp"
    }
  }
}
```

---

## 4. 数据模型设计

### 4.1 OpenCodeProject 模型

```sql
CREATE TABLE opencode_projects (
  id          VARCHAR(36) PRIMARY KEY,
  project_id  VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- OpenCode 服务器配置
  code_path   VARCHAR(500) NOT NULL,  -- 本地代码路径
  port        INTEGER,                 -- 分配的端口（运行时）
  status      VARCHAR(30) DEFAULT 'stopped', -- stopped/starting/running/auditing/error
  server_pid  INTEGER,                 -- 进程 ID
  
  -- 审计配置
  selected_skills    JSON,  -- 选择的 skill IDs
  selected_mcp_tools JSON,  -- 选择的 MCP tool IDs
  audit_config       JSON,  -- 审计参数配置
  
  -- 当前审计任务
  current_agent_task_id VARCHAR(36) REFERENCES agent_tasks(id),
  
  -- 元数据
  created_by VARCHAR(36) REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);
```

### 4.2 OpenCodeSkill 模型

```sql
CREATE TABLE opencode_skills (
  id          VARCHAR(36) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  category    VARCHAR(100),  -- owasp/business/framework/custom
  
  -- Skill 内容
  system_prompt TEXT NOT NULL,  -- 注入到 OpenCode 的系统提示词
  tool_hints    JSON,           -- 建议使用的工具列表
  vulnerability_types JSON,     -- 关注的漏洞类型
  
  -- 元数据
  is_system   BOOLEAN DEFAULT FALSE,  -- 系统内置 skill
  is_active   BOOLEAN DEFAULT TRUE,
  icon        VARCHAR(50),
  tags        JSON,
  
  created_by VARCHAR(36) REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);
```

### 4.3 MCPToolConfig 模型

```sql
CREATE TABLE mcp_tool_configs (
  id          VARCHAR(36) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- MCP 连接配置
  transport_type VARCHAR(20) DEFAULT 'http',  -- http/stdio/sse
  server_url  VARCHAR(500),   -- HTTP 传输时的 URL
  command     VARCHAR(500),   -- stdio 传输时的命令
  args        JSON,           -- 命令参数
  env_vars    JSON,           -- 环境变量
  
  -- 工具元数据
  capabilities JSON,  -- 该工具提供的能力列表
  is_active   BOOLEAN DEFAULT TRUE,
  is_system   BOOLEAN DEFAULT FALSE,
  
  created_by VARCHAR(36) REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);
```

### 4.4 IssueComment 模型（问题闭环）

```sql
CREATE TABLE issue_comments (
  id          VARCHAR(36) PRIMARY KEY,
  finding_id  VARCHAR(36) REFERENCES agent_findings(id) ON DELETE CASCADE,
  
  -- 评论内容
  comment_type VARCHAR(30) DEFAULT 'note',  -- note/confirm/reject/fix/reopen
  content     TEXT NOT NULL,
  
  -- 状态变更记录
  from_status VARCHAR(30),
  to_status   VARCHAR(30),
  
  -- 作者信息
  author_id   VARCHAR(36) REFERENCES users(id),
  author_name VARCHAR(255),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4.5 AgentFinding 增强字段（通过迁移添加）

```sql
ALTER TABLE agent_findings ADD COLUMN IF NOT EXISTS
  reviewer_id    VARCHAR(36) REFERENCES users(id),
  reviewed_at    TIMESTAMP WITH TIME ZONE,
  review_notes   TEXT,
  assignee_id    VARCHAR(36) REFERENCES users(id),
  assigned_at    TIMESTAMP WITH TIME ZONE,
  due_date       DATE,
  closed_at      TIMESTAMP WITH TIME ZONE,
  risk_accepted  BOOLEAN DEFAULT FALSE,
  external_id    VARCHAR(255),   -- Jira/Github issue ID
  external_url   VARCHAR(500);   -- 外部问题链接
```

---

## 5. 后端 API 设计

### 5.1 OpenCode 项目 API

```
GET    /api/v1/opencode/projects              列出所有 OpenCode 项目
POST   /api/v1/opencode/projects              创建 OpenCode 项目
GET    /api/v1/opencode/projects/{id}         获取项目详情
PATCH  /api/v1/opencode/projects/{id}         更新项目配置
DELETE /api/v1/opencode/projects/{id}         删除项目

POST   /api/v1/opencode/projects/{id}/start   启动 OpenCode 服务器
POST   /api/v1/opencode/projects/{id}/stop    停止 OpenCode 服务器
GET    /api/v1/opencode/projects/{id}/status  获取服务器状态

POST   /api/v1/opencode/projects/{id}/inject-skills   注入 Skills
POST   /api/v1/opencode/projects/{id}/inject-mcp      注入 MCP 工具
POST   /api/v1/opencode/projects/{id}/audit           触发审计
GET    /api/v1/opencode/projects/{id}/audit-history   审计历史
```

### 5.2 Skills 管理 API

```
GET    /api/v1/opencode/skills               列出所有 Skills
POST   /api/v1/opencode/skills               创建自定义 Skill
GET    /api/v1/opencode/skills/{id}          获取 Skill 详情
PATCH  /api/v1/opencode/skills/{id}          更新 Skill
DELETE /api/v1/opencode/skills/{id}          删除 Skill
POST   /api/v1/opencode/skills/{id}/preview  预览 Skill 提示词
```

### 5.3 MCP 工具 API

```
GET    /api/v1/opencode/mcp-tools            列出所有 MCP 工具
POST   /api/v1/opencode/mcp-tools            添加 MCP 工具配置
GET    /api/v1/opencode/mcp-tools/{id}       获取工具详情
PATCH  /api/v1/opencode/mcp-tools/{id}       更新工具配置
DELETE /api/v1/opencode/mcp-tools/{id}       删除工具配置
POST   /api/v1/opencode/mcp-tools/{id}/test  测试连通性
```

### 5.4 问题管理增强 API

```
GET    /api/v1/agent-tasks/{tid}/findings/{fid}/comments       获取评论列表
POST   /api/v1/agent-tasks/{tid}/findings/{fid}/comments       添加评论
DELETE /api/v1/agent-tasks/{tid}/findings/{fid}/comments/{cid} 删除评论

PATCH  /api/v1/agent-tasks/{tid}/findings/{fid}/review         审核（确认/拒绝）
PATCH  /api/v1/agent-tasks/{tid}/findings/{fid}/assign         分配责任人
PATCH  /api/v1/agent-tasks/{tid}/findings/{fid}/close          关闭问题

POST   /api/v1/agent-tasks/{tid}/findings/batch-update         批量更新状态
GET    /api/v1/agent-tasks/{tid}/findings/statistics           统计摘要
```

---

## 6. Skills 体系设计

### 6.1 内置 Skills 分类

#### OWASP Top 10 Skills
| Skill ID | 名称 | 描述 |
|----------|------|------|
| `owasp-a01` | 访问控制缺陷检测 | 检测权限绕过、IDOR、水平越权等 |
| `owasp-a02` | 加密失效检测 | 检测弱加密、硬编码密钥、明文传输 |
| `owasp-a03` | 注入漏洞检测 | SQL/命令/代码注入全面检测 |
| `owasp-a05` | 安全配置错误 | 检测配置问题、调试模式、默认凭据 |
| `owasp-a07` | 认证失效检测 | 检测认证绕过、弱密码、会话管理问题 |
| `owasp-a08` | 软件完整性失效 | 检测供应链、反序列化、CI/CD安全 |
| `owasp-a10` | 服务端请求伪造 | SSRF 全面检测 |

#### 框架特定 Skills
| Skill ID | 名称 | 适用场景 |
|----------|------|---------|
| `framework-django` | Django 安全审计 | Django ORM 注入、CSRF、settings 配置 |
| `framework-fastapi` | FastAPI 安全审计 | Pydantic 验证绕过、路由权限 |
| `framework-react` | React 前端安全 | XSS、CSP、敏感数据暴露 |
| `framework-express` | Express 安全审计 | 中间件配置、CORS、rate limiting |

#### 业务逻辑 Skills
| Skill ID | 名称 | 描述 |
|----------|------|------|
| `biz-payment` | 支付逻辑审计 | 价格篡改、竞态条件、重放攻击 |
| `biz-auth-flow` | 认证流程审计 | OAuth 漏洞、令牌泄露、登录逻辑 |
| `biz-api-security` | API 安全审计 | 速率限制、数据过滤、版本安全 |

### 6.2 Skill 提示词模板

每个 Skill 包含结构化的系统提示词：

```
# [Skill 名称]

## 审计目标
[明确的审计范围和关注点]

## 检测方法
1. [方法1]
2. [方法2]
...

## 关键模式
- [模式1]
- [模式2]
...

## 输出格式
发现漏洞时，请按以下格式报告：
- 漏洞类型
- 严重程度（critical/high/medium/low）
- 文件路径和行号
- 漏洞代码片段
- 利用方式描述
- 修复建议
```

---

## 7. MCP 工具集成

### 7.1 内置 MCP 工具

| 工具名 | 传输方式 | 功能 |
|--------|---------|------|
| `filesystem` | stdio | 文件系统访问（已内置于 OpenCode） |
| `git` | stdio | Git 历史分析 |
| `web-search` | http | 漏洞信息搜索 |
| `cve-lookup` | http | CVE 数据库查询 |
| `semgrep` | stdio | Semgrep 规则扫描 |
| `code-graph` | http | 代码调用图分析 |

### 7.2 MCP 配置注入流程

```
1. 选择 MCP 工具
       ↓
2. 读取工具配置（URL/命令/参数）
       ↓
3. 生成 OpenCode config patch
       ↓
4. 通过 OpenCode API 注入配置
       ↓
5. 重启 OpenCode 会话使配置生效
       ↓
6. 验证工具可用性
```

---

## 8. 审计结果兼容层

### 8.1 OpenCode → AgentFinding 映射

```python
# OpenCode 输出格式
opencode_result = {
    "vulnerability_type": "sql_injection",
    "severity": "high",
    "file": "app/models/user.py",
    "line": 42,
    "code": "query = f\"SELECT * FROM users WHERE id={user_id}\"",
    "description": "...",
    "fix": "..."
}

# 映射到 AgentFinding
agent_finding = {
    "task_id": task_id,
    "vulnerability_type": opencode_result["vulnerability_type"],
    "severity": opencode_result["severity"],
    "file_path": opencode_result["file"],
    "line_start": opencode_result["line"],
    "code_snippet": opencode_result["code"],
    "description": opencode_result["description"],
    "suggestion": opencode_result["fix"],
    "status": "new",
    "finding_metadata": {
        "source": "opencode",
        "opencode_session_id": session_id,
        "skills_used": skill_ids
    }
}
```

### 8.2 结果去重与合并

- 基于文件路径 + 行号 + 漏洞类型生成指纹
- 与现有 DeepAudit findings 合并时去重
- 支持跨审计任务的历史对比

---

## 9. 问题管理与闭环

### 9.1 问题状态机

```
         new
          │
    ┌─────┴─────┐
    │           │
confirmed   false_positive
    │           
    ├── assigned（分配给修复人）
    │       │
    │   in_progress（修复中）
    │       │
    │     fixed（已修复）
    │       │
    │   verified（验证通过）
    │       │
    │    closed（关闭）
    │
    └── wont_fix（接受风险）
         │
       closed
```

### 9.2 评论类型

| 类型 | 说明 | 触发状态变更 |
|------|------|------------|
| `note` | 普通备注 | 否 |
| `confirm` | 确认漏洞真实 | new → confirmed |
| `reject` | 标记为误报 | any → false_positive |
| `assign` | 分配修复责任人 | confirmed → assigned |
| `fix` | 标记已修复 | assigned → fixed |
| `verify` | 验证修复有效 | fixed → closed |
| `reopen` | 重新打开问题 | closed → new |
| `accept_risk` | 接受风险不修复 | any → wont_fix |

### 9.3 问题仪表盘指标

- **发现率**: 总发现数
- **确认率**: confirmed / total × 100%
- **误报率**: false_positive / total × 100%
- **修复率**: closed / confirmed × 100%
- **平均修复时间**: avg(closed_at - confirmed_at)
- **超期问题**: due_date < today AND status != closed

---

## 10. 报告优化方案

### 10.1 报告结构增强

```
审计报告 v2
├── 执行摘要
│   ├── 项目信息
│   ├── 审计模式（DeepAudit Agent / OpenCode Agent）
│   ├── Skills 和 MCP 工具列表
│   └── 关键指标概览
├── 风险评估
│   ├── 严重程度分布
│   ├── 漏洞类型分布
│   └── CVSS 评分分布
├── 问题状态总览（新增）
│   ├── 状态分布饼图
│   ├── 确认/误报/修复统计
│   └── 趋势变化（与上次审计对比）
├── 问题详情列表
│   ├── 漏洞描述 + 代码证据
│   ├── 当前状态 + 责任人
│   ├── 审核记录（评论历史）
│   └── 修复建议 + 参考链接
└── 附录
    ├── 审计方法说明
    ├── 工具和规则版本
    └── 免责声明
```

### 10.2 报告导出格式

| 格式 | 功能 |
|------|------|
| PDF | 完整报告，含状态、评论历史 |
| Markdown | 开发友好格式，适合 PR 集成 |
| JSON | 机器可读，支持与 Jira/JIRA/GitLab 集成 |
| CSV | 问题列表导出，适合 Excel 管理 |
| SARIF | GitHub Code Scanning 标准格式 |

### 10.3 差异报告

对比两次审计任务，生成：
- 新增问题（本次发现，上次未有）
- 已修复问题（上次有，本次无）
- 持续存在问题（两次都有）
- 状态变化问题

---

## 11. 前端交互设计

### 11.1 导航结构

```
侧边栏
├── Agent 审计（现有）
├── OpenCode 审计（新增）  ← 本次新增
├── 仪表盘
├── 项目管理
├── 即时分析
├── 审计任务
├── 审计规则
├── 提示词管理
└── 系统管理
```

### 11.2 OpenCode 审计页面布局

```
┌─────────────────────────────────────────────────────────┐
│  OpenCode 审计项目                    [+ 新建项目]        │
├─────────────────────────────────────────────────────────┤
│  项目卡片区域                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ 项目A         │ │ 项目B         │ │ 项目C         │    │
│  │ ● 运行中:9100│ │ ○ 已停止      │ │ ⟳ 审计中      │    │
│  │ Skills: 3    │ │ Skills: 1    │ │ Skills: 5    │    │
│  │ MCP: 2       │ │ MCP: 0       │ │ MCP: 3       │    │
│  │ [开始审计]   │ │ [启动服务器] │ │ [查看结果]   │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
├─────────────────────────────────────────────────────────┤
│  项目详情侧边板（选中项目后展开）                          │
│  ├── 基本配置（代码路径/端口/状态）                        │
│  ├── Skills 选择（多选卡片）                               │
│  ├── MCP 工具配置                                         │
│  └── 审计历史（任务列表）                                  │
└─────────────────────────────────────────────────────────┘
```

### 11.3 问题管理面板

现有 AgentAudit 页面右侧新增问题管理面板：

```
┌─────────────────────────────────────────────────────────┐
│  发现问题列表                     [过滤▼] [批量操作▼]    │
├─────────────────────────────────────────────────────────┤
│  统计栏: 总计42 | 待确认12 | 已确认18 | 误报8 | 已修复4   │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐   │
│  │ [CRITICAL] SQL注入 - app/models/user.py:42        │   │
│  │ 状态: 待确认  责任人: 未分配  截止: -              │   │
│  │ [确认] [误报] [分配] [查看详情 →]                 │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ [HIGH] 硬编码密钥 - config/settings.py:15         │   │
│  │ 状态: 已确认  责任人: 张三  截止: 2026-03-20       │   │
│  │ [查看评论(3)] [标记修复] [查看详情 →]              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 12. 实施路线图

### Phase 1: 数据基础（Week 1）
- [x] 数据库模型设计
- [x] Alembic 迁移脚本
- [x] Backend API 骨架

### Phase 2: OpenCode 集成（Week 2）
- [x] OpenCode 服务管理器
- [x] Skills 库内置数据
- [x] MCP 工具配置系统
- [x] 结果转换层

### Phase 3: 前端实现（Week 3）
- [x] OpenCode 项目管理页面
- [x] Skills/MCP 选择界面
- [x] 问题管理面板
- [x] 报告导出增强

### Phase 4: 报告优化（Week 4）
- [ ] 问题闭环统计仪表盘
- [ ] 差异报告功能
- [ ] SARIF 导出
- [ ] 邮件通知集成
