# VulnHunter 实施路线图

> **Version**: 0.1.0  
> **Date**: 2026-03-13  
> **Related**: [SPEC.md](./SPEC.md) | [ARCHITECTURE.md](./ARCHITECTURE.md) | [SKILL_COMPATIBILITY.md](./SKILL_COMPATIBILITY.md)

---

## 总览

VulnHunter 从零构建，参考 DeepAudit 技术栈，分 8 个 Phase 交付。

**总工期**: 约 20 周  
**核心依赖**: Python 3.11+, Node 20+, PostgreSQL 15, Redis 7, Docker

---

## Phase 0: 项目脚手架（Week 1）

目标：可运行的空项目骨架。

### 后端

| 任务 | 说明 | 验收 |
|------|------|------|
| 初始化 Python 项目 | `pyproject.toml`（uv）, FastAPI app, Uvicorn | `uv run uvicorn app.main:app` 启动 |
| 数据库连接 | SQLAlchemy async session, Alembic 初始化 | `alembic upgrade head` 成功 |
| 基础中间件 | CORS, 异常处理, 日志 | 请求日志正常输出 |
| Docker Compose | PG + Redis + backend + sandbox 占位 | `docker compose up` 全部绿色 |
| CI 骨架 | GitHub Actions: lint + test | PR 触发 CI |

### 前端

| 任务 | 说明 | 验收 |
|------|------|------|
| 初始化 React 项目 | Vite + TypeScript + TailwindCSS + shadcn/ui init | `pnpm dev` 启动 |
| 路由骨架 | React Router v7, MainLayout + Sidebar + 空页面 | 所有路由可导航 |
| Axios 客户端 | baseURL, JWT interceptor, 401 处理 | 可调用后端 /docs |
| i18n | i18next 中英文基础配置 | 切换语言成功 |
| 主题 | 暗色/亮色切换 | 切换生效 |

**交付物**: 前后端可启动，Swagger 文档可访问，前端路由全部占位。

---

## Phase 1: 核心数据层（Week 2-3）

目标：所有数据模型、Schema、基础 CRUD API 就绪。

### 数据库模型

| 模型 | 文件 | 关键字段 |
|------|------|---------|
| User | `models/user.py` | email, hashed_pwd, role, llm_config |
| Project | `models/project.py` | name, source_type, repo_url, security_score |
| Skill | `models/skill.py` | slug, pipeline_config, openclaw_manifest, category |
| SkillProfile | `models/skill_profile.py` | skills_config, verification_level |
| ProjectSkillProfile | `models/skill_profile.py` | project_id, profile_id |
| AuditTask | `models/audit_task.py` | project_id, profile_id, status, progress |
| SkillExecution | `models/audit_task.py` | task_id, skill_id, status |
| Finding | `models/finding.py` | title, severity, status, file_path, fingerprint |
| FindingComment | `models/finding.py` | finding_id, user_id, content |
| FindingHistory | `models/finding.py` | finding_id, action, old_value, new_value |
| FindingCategory | `models/category.py` | code, cwe_id, parent_id |
| AuditEvent | `models/audit_task.py` | task_id, event_type, message |
| Report | `models/report.py` | task_id, type, format, version, status |
| ReportTemplate | `models/report.py` | content_template, template_type |

### Pydantic Schemas

每个模型对应 `schemas/` 下的 Base/Create/Update/Response/List 五件套。

### 基础 API

| API | 验收 |
|-----|------|
| Auth (login/register) | JWT 登录成功 |
| User CRUD | /users/me 返回当前用户 |
| Project CRUD | 创建/查询/更新/删除项目 |
| Skill CRUD | 创建/查询/更新/删除 Skill |
| SkillProfile CRUD | 创建/查询 Profile |
| Category CRUD | 创建/查询分类树 |

### 种子数据

| 数据 | 说明 |
|------|------|
| FindingCategory 树 | 30+ 节点，覆盖 OWASP Top 10 所有类别 |
| 内置 SkillProfile | Python Web / Java Web / Node.js / 快速扫描 |
| 默认 ReportTemplate | 中文完整报告 + 英文完整报告 + 管理摘要 |
| Admin 用户 | admin@vulnhunter.local / admin |

**交付物**: 所有表可迁移，所有 CRUD API 通过测试，Swagger 完整。

---

## Phase 2: Skill 引擎 + OpenClaw 兼容（Week 4-6）

目标：Skill 可解析、可执行、可从 OpenClaw 导入。

### Skill 引擎

| 模块 | 文件 | 说明 |
|------|------|------|
| Registry | `services/skill_engine/registry.py` | 加载内置 Skill，管理已注册 Skill |
| Parser | `services/skill_engine/parser.py` | 解析 pipeline.yaml + metadata.yaml |
| Resolver | `services/skill_engine/resolver.py` | 解析 Profile 依赖，输出 ExecutionPlan |
| Recommender | `services/skill_engine/recommender.py` | 根据项目特征匹配 Skill |

### OpenClaw 兼容

| 模块 | 文件 | 说明 |
|------|------|------|
| Importer | `services/skill_engine/openclaw_importer.py` | 解析 skill.yaml/SKILL.md → VH Skill |
| Exporter | `services/skill_engine/openclaw_exporter.py` | VH Skill → skill.yaml + SKILL.md |
| Adapter | `services/skill_engine/openclaw_adapter.py` | 运行时适配 OC entryPoint |

### 内置 Skill 包

```
skills/builtin/
├── code-recon/
│   ├── skill.yaml           # OC manifest
│   ├── SKILL.md             # OC instructions
│   ├── pipeline.yaml        # VH pipeline
│   └── metadata.yaml        # VH metadata
├── dependency-audit/
├── secret-detection/
├── sql-injection/
├── xss-detection/
├── csrf-detection/
├── ssrf-detection/
├── path-traversal/
├── auth-bypass/
├── insecure-deser/
├── crypto-weakness/
├── api-security/
└── full-audit/
```

每个 Skill 需要编写：
- `skill.yaml`：OpenClaw 格式 manifest
- `SKILL.md`：OpenClaw 格式 instructions
- `pipeline.yaml`：VulnHunter pipeline（phases + tools + agent config）
- `metadata.yaml`：CWE/OWASP 映射、语言/框架兼容

### API

| 端点 | 说明 |
|------|------|
| `POST /skills/import-openclaw` | 从 ClawHub URL / 本地导入 |
| `GET /skills/{id}/export?format=openclaw` | 导出为 OC 格式 |
| `POST /skills/{id}/test` | 干跑测试 |
| `POST /projects/{id}/recommend-profile` | 智能推荐 |

**交付物**: 13 个内置 Skill 完成，OC 导入导出可用，推荐引擎可用。

---

## Phase 3: Agent 与审计引擎（Week 7-9）

目标：能端到端执行一次完整的 Skill 驱动审计。

### LLM 服务

| 模块 | 说明 |
|------|------|
| `services/llm/service.py` | LiteLLM 统一接口 |
| `services/llm/adapters/` | Provider 适配器 |
| 流式输出 | streaming generator |
| Token 管理 | 计数、budget、历史压缩 |

### Agent 系统

| 模块 | 说明 |
|------|------|
| `services/agent/base.py` | BaseAgent（ReAct loop） |
| `services/agent/recon.py` | 侦查 Agent |
| `services/agent/analysis.py` | 分析 Agent |
| `services/agent/verification.py` | 验证 Agent |

### 工具层

| 工具 | 说明 |
|------|------|
| `tools/file_tool.py` | list_files, read_file, search_code |
| `tools/semgrep_tool.py` | Semgrep 调用（Sandbox） |
| `tools/bandit_tool.py` | Bandit 调用（Sandbox） |
| `tools/gitleaks_tool.py` | Gitleaks 调用 |
| `tools/sandbox_tool.py` | Docker sandbox exec/http |
| `tools/rag_tool.py` | ChromaDB 语义检索 |
| `tools/run_code_tool.py` | PoC 执行 |

### 审计引擎

| 模块 | 说明 |
|------|------|
| `services/audit_engine/orchestrator.py` | Skill-driven 编排 |
| `services/audit_engine/skill_executor.py` | 单 Skill 管线执行 |
| `services/audit_engine/agent_builder.py` | 根据 Skill 构建 Agent |
| `services/audit_engine/event_manager.py` | SSE 事件推送 |

### RAG

| 模块 | 说明 |
|------|------|
| `services/rag/indexer.py` | 代码索引（Tree-sitter 分块） |
| `services/rag/retriever.py` | 语义检索 |
| `services/rag/splitter.py` | AST-aware 代码分块 |

### Sandbox Docker 镜像

```Dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y nodejs npm golang
RUN pip install semgrep bandit safety
RUN npm install -g npm-audit
# ...security tools installation
```

### API

| 端点 | 说明 |
|------|------|
| `POST /audits` | 创建并启动审计 |
| `GET /audits/{id}/stream` | SSE 实时流 |
| `GET /audits/{id}/events` | 事件列表 |
| `GET /audits/{id}/summary` | 审计摘要 |
| `GET /audits/{id}/skill-executions` | Skill 明细 |
| `POST /audits/{id}/cancel` | 取消 |

**验收**: 创建项目 → 绑定 Profile → 启动审计 → SSE 实时日志 → 审计完成 → 查看 Findings。

---

## Phase 4: Finding 管理（Week 10-11）

目标：Finding 全生命周期管理、评论、历史。

### Finding Engine

| 模块 | 说明 |
|------|------|
| 状态机 | open → confirmed → fixing → resolved / false_positive / accepted_risk |
| Fingerprint | sha256(file_path + vuln_type + code_hash) |
| 去重 | 入库时检查 fingerprint |
| Categorizer | 自动匹配 FindingCategory |
| AI 增强 | ai-explain, ai-fix |

### API

| 端点 | 说明 |
|------|------|
| `GET /findings` | 全局列表（多过滤器、分页） |
| `GET /findings/{id}` | 详情 |
| `PATCH /findings/{id}/status` | 状态转换 |
| `POST /findings/{id}/confirm` | 确认 |
| `POST /findings/{id}/resolve` | 已解决 |
| `POST /findings/{id}/false-positive` | 误报 |
| `POST /findings/{id}/accept-risk` | 接受风险 |
| `POST /findings/{id}/reopen` | 重新打开 |
| `POST /findings/{id}/duplicate` | 标记重复 |
| `POST /findings/bulk-status` | 批量更新 |
| `GET/POST /findings/{id}/comments` | 评论 |
| `GET /findings/{id}/history` | 历史 |
| `POST /findings/{id}/ai-explain` | AI 解释 |
| `POST /findings/{id}/ai-fix` | AI 修复 |

**交付物**: Finding 状态机、评论、历史全部可用。

---

## Phase 5: 报告系统（Week 12-13）

目标：多格式报告生成、版本管理、审批。

### Report Engine

| 模块 | 说明 |
|------|------|
| `services/report_engine/generator.py` | 报告生成入口 |
| `services/report_engine/renderers/pdf.py` | WeasyPrint |
| `services/report_engine/renderers/markdown.py` | Markdown |
| `services/report_engine/renderers/html.py` | 独立 HTML |
| `services/report_engine/renderers/json.py` | JSON |
| `services/report_engine/ai_summary.py` | LLM Executive Summary |
| `services/report_engine/template_engine.py` | Jinja2 模板 |

### 内置模板

| 模板 | 类型 | 说明 |
|------|------|------|
| `full-report-cn` | Full | 中文完整报告 |
| `full-report-en` | Full | 英文完整报告 |
| `executive-cn` | Executive | 中文管理摘要 |
| `executive-en` | Executive | 英文管理摘要 |
| `technical` | Technical | 技术深度报告 |
| `compliance-owasp` | Compliance | OWASP 合规报告 |

### API

| 端点 | 说明 |
|------|------|
| `POST /reports` | 生成报告 |
| `GET /reports` | 列表 |
| `GET /reports/{id}` | 详情 |
| `GET /reports/{id}/download` | 下载文件 |
| `POST /reports/{id}/regenerate` | 重新生成 |
| `POST /reports/{id}/approve` | 审批 |
| `GET/POST /report-templates` | 模板管理 |

**交付物**: PDF/MD/HTML/JSON 报告可生成，版本管理和审批流程可用。

---

## Phase 6: 前端核心页面（Week 14-16）

目标：所有核心 UI 页面完成。

### 页面开发清单

| 优先级 | 页面 | 路由 | 工时 |
|--------|------|------|------|
| P0 | 登录/注册 | `/login`, `/register` | 0.5d |
| P0 | Dashboard | `/dashboard` | 3d |
| P0 | 项目列表 | `/projects` | 2d |
| P0 | 项目详情 (5 tabs) | `/projects/:id` | 4d |
| P0 | 审计列表 | `/audits` | 1d |
| P0 | 审计详情 (SSE) | `/audits/:id` | 3d |
| P0 | Finding 列表 | `/findings` | 3d |
| P0 | Finding 详情 (Panel) | (侧面板) | 2d |
| P1 | Skill 管理 | `/skills` | 2d |
| P1 | Skill 详情 | `/skills/:id` | 1d |
| P1 | Skill Profile | `/skill-profiles` | 2d |
| P1 | 报告列表 | `/reports` | 1.5d |
| P2 | 管理后台 | `/admin` | 2d |
| P2 | 个人设置 | `/account` | 1d |

### 关键组件

| 组件 | 用途 |
|------|------|
| `SeverityBadge` | Critical/High/Medium/Low/Info 标签 |
| `StatusBadge` | Open/Confirmed/Resolved/... 标签 |
| `SecurityScore` | 分数环形进度 |
| `TrendIndicator` | ↑ 3.2% / ↓ 1.5% |
| `CWETag` | CWE-89 标签 |
| `SkillCard` | Skill 卡片（图标、名称、分类、统计） |
| `FindingTable` | 可过滤/排序/分页的 Finding 表 |
| `LiveStream` | SSE 实时日志渲染 |
| `CommentThread` | Finding 评论列表 |
| `PipelineView` | Skill pipeline 可视化 |

### API 客户端模块

| 模块 | 文件 |
|------|------|
| Auth | `shared/api/auth.ts` |
| Projects | `shared/api/projects.ts` |
| Skills | `shared/api/skills.ts` |
| Audits | `shared/api/audits.ts` |
| Findings | `shared/api/findings.ts` |
| Reports | `shared/api/reports.ts` |
| Dashboard | `shared/api/dashboard.ts` |
| Categories | `shared/api/categories.ts` |
| Config | `shared/api/config.ts` |

**交付物**: 所有页面可交互，端到端用户流程走通。

---

## Phase 7: Dashboard 与数据分析（Week 17-18）

目标：多维度 Dashboard 数据。

### Dashboard API

| 端点 | 数据 | 图表 |
|------|------|------|
| `GET /dashboard/overview` | 核心指标 | 数字卡片 |
| `GET /dashboard/trends` | 按天/周/月趋势 | Area Chart |
| `GET /dashboard/severity-distribution` | 严重程度 | Donut Chart |
| `GET /dashboard/category-distribution` | 分类 | Horizontal Bar |
| `GET /dashboard/top-vulnerabilities` | Top 10 漏洞 | Bar Chart |
| `GET /dashboard/recent-activity` | 最近活动 | Activity List |
| `GET /dashboard/skills` | Skill 效果 | Table + Radar |
| `GET /dashboard/skills/comparison` | Skill 对比 | Multi-bar |
| `GET /projects/{id}/dashboard` | 项目级汇总 | Mixed |

### Dashboard Engine

| 模块 | 说明 |
|------|------|
| `services/dashboard/aggregator.py` | 数据聚合查询 |
| `services/dashboard/cache.py` | Redis 缓存管理 |
| 触发器 | 审计完成 / Finding 变更 → 缓存失效 |

### 前端图表

| 图表 | Recharts 组件 |
|------|--------------|
| 趋势线 | `AreaChart` |
| 严重程度 | `PieChart` (donut) |
| 分类分布 | `BarChart` (horizontal) |
| Top 漏洞 | `BarChart` |
| 安全评分 | 自定义 SVG 圆环 |
| Skill 对比 | `RadarChart` |

**交付物**: 全局 Dashboard + 项目级 Dashboard + Skill 数据分析。

---

## Phase 8: 打磨与发布（Week 19-20）

### 测试

| 类型 | 范围 | 工具 |
|------|------|------|
| 单元测试 | Service 层 | pytest + pytest-asyncio |
| API 测试 | 所有端点 | pytest + httpx |
| 前端测试 | 关键组件 | Vitest + Testing Library |
| E2E 测试 | 核心流程 | Playwright (可选) |

### 文档

| 文件 | 内容 |
|------|------|
| `README.md` | 项目介绍、快速开始、截图 |
| `docs/DEPLOYMENT.md` | 部署指南 |
| `docs/SKILL_DEVELOPMENT.md` | Skill 开发指南 |
| `docs/API_REFERENCE.md` | API 参考 (或指向 /docs Swagger) |
| `CONTRIBUTING.md` | 贡献指南 |
| `CHANGELOG.md` | 版本变更日志 |

### 发布

| 任务 | 说明 |
|------|------|
| Docker 镜像 | 构建 + 推送到 GHCR |
| docker-compose.prod.yml | 生产配置 |
| GitHub Release | v0.1.0 tag + release notes |
| CI/CD | lint + test + build + push |

---

## Phase 依赖图

```
Phase 0 (脚手架)
    │
    ▼
Phase 1 (数据层)
    │
    ├──────────────────┐
    ▼                  ▼
Phase 2 (Skill 引擎)  Phase 4 (Finding)
    │                  │
    ▼                  │
Phase 3 (Agent 引擎)──┘
    │
    ├──▶ Phase 5 (报告)
    │
    ▼
Phase 6 (前端)
    │
    ▼
Phase 7 (Dashboard)
    │
    ▼
Phase 8 (发布)
```

Phase 2 + Phase 4 可并行。Phase 5 依赖 Phase 3+4。

---

## 里程碑

| 里程碑 | Phase | 交付 | 目标周 |
|--------|-------|------|--------|
| **M0: Skeleton** | 0 | 可运行骨架 | W1 |
| **M1: Data Ready** | 1 | 全部模型+CRUD | W3 |
| **M2: Skill Ready** | 2 | Skill 引擎 + OC 兼容 | W6 |
| **M3: Audit Ready** | 3+4 | 端到端审计 + Finding | W11 |
| **M4: Report Ready** | 5 | 报告系统 | W13 |
| **M5: UI Ready** | 6 | 前端完整 | W16 |
| **M6: Dashboard** | 7 | 数据分析 | W18 |
| **M7: v0.1.0** | 8 | 首个可用版本 | W20 |

---

## 技术风险

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| LLM API 不稳定 | 中 | 审计失败 | 重试 + 降级 + 多 provider |
| Sandbox 安全逃逸 | 低 | 严重 | 网络隔离 + 资源限制 + 定期审查 |
| 大项目性能 | 中 | 用户体验差 | 文件过滤 + 分批处理 + Token budget |
| OpenClaw 格式变更 | 低 | 兼容性断裂 | 版本化 importer + 降级处理 |
| 前端状态复杂度 | 中 | 代码难维护 | 页面级状态 + 自定义 hooks |

---

*本路线图随项目进展持续更新。每个 Phase 完成后进行 retrospective 并调整后续计划。*
