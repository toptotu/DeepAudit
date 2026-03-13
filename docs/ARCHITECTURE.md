# VulnHunter 系统架构设计

> **Version**: 0.1.0  
> **Date**: 2026-03-13  
> **Related**: [SPEC.md](./SPEC.md)

---

## 1. 架构总图

```
                         ┌──────────────────────┐
                         │      Browser         │
                         │  React 18 + Vite 5   │
                         └──────────┬───────────┘
                                    │ REST + SSE
                         ┌──────────▼───────────┐
                         │   Nginx / Vite Dev   │
                         └──────────┬───────────┘
                                    │
          ┌─────────────────────────▼──────────────────────────┐
          │                  FastAPI Backend                     │
          │                                                     │
          │  ┌───────────────────────────────────────────────┐  │
          │  │                 API Layer                      │  │
          │  │  /auth  /users  /projects  /skills  /audits   │  │
          │  │  /findings  /categories  /reports  /dashboard  │  │
          │  └──────────────────────┬────────────────────────┘  │
          │                         │                           │
          │  ┌──────────────────────▼────────────────────────┐  │
          │  │              Service Layer                     │  │
          │  │                                                │  │
          │  │  ┌──────────────┐  ┌────────────────────┐     │  │
          │  │  │ Skill Engine │  │ Audit Engine        │     │  │
          │  │  │              │  │                     │     │  │
          │  │  │ • Registry   │  │ • Orchestrator      │     │  │
          │  │  │ • Resolver   │  │ • SkillExecutor     │     │  │
          │  │  │ • Recommender│  │ • EventManager (SSE)│     │  │
          │  │  │ • OC Import  │  │ • AgentBuilder      │     │  │
          │  │  └──────────────┘  └────────────────────┘     │  │
          │  │                                                │  │
          │  │  ┌──────────────┐  ┌────────────────────┐     │  │
          │  │  │Report Engine │  │ Dashboard Engine    │     │  │
          │  │  │              │  │                     │     │  │
          │  │  │ • Generator  │  │ • Aggregator        │     │  │
          │  │  │ • Renderers  │  │ • CacheManager      │     │  │
          │  │  │ • AI Summary │  │                     │     │  │
          │  │  └──────────────┘  └────────────────────┘     │  │
          │  │                                                │  │
          │  │  ┌──────────────┐  ┌────────────────────┐     │  │
          │  │  │Finding Engine│  │ LLM Service         │     │  │
          │  │  │              │  │                     │     │  │
          │  │  │ • StateMachine│ │ • LiteLLM adapter   │     │  │
          │  │  │ • Dedup       │ │ • Streaming         │     │  │
          │  │  │ • Categorizer │ │ • Token management  │     │  │
          │  │  └──────────────┘  └────────────────────┘     │  │
          │  └───────────────────────────────────────────────┘  │
          │                         │                           │
          │  ┌──────────────────────▼────────────────────────┐  │
          │  │             Agent Layer                        │  │
          │  │                                                │  │
          │  │  ReAct Loop: Thought → Action → Observation   │  │
          │  │                                                │  │
          │  │  ┌────────┐  ┌──────────┐  ┌──────────────┐   │  │
          │  │  │ Recon  │  │ Analysis │  │ Verification │   │  │
          │  │  │ Agent  │  │  Agent   │  │    Agent     │   │  │
          │  │  └────────┘  └──────────┘  └──────────────┘   │  │
          │  └───────────────────────────────────────────────┘  │
          │                         │                           │
          │  ┌──────────────────────▼────────────────────────┐  │
          │  │              Tool Layer                        │  │
          │  │                                                │  │
          │  │  file_tool  semgrep  bandit  gitleaks  sandbox │  │
          │  │  rag_query  npm_audit  safety  run_code       │  │
          │  └───────────────────────────────────────────────┘  │
          └─────────────────────────────────────────────────────┘
                         │          │         │          │
               ┌─────────▼──┐ ┌────▼────┐ ┌──▼──────┐ ┌▼────────┐
               │ PostgreSQL │ │  Redis  │ │ChromaDB │ │ Docker  │
               │    15      │ │    7    │ │  (RAG)  │ │ Sandbox │
               └────────────┘ └─────────┘ └─────────┘ └─────────┘
```

---

## 2. 分层职责

| 层 | 职责 | 关键技术 |
|----|------|---------|
| **Presentation** | 渲染 UI、路由、状态管理、SSE 订阅 | React, TypeScript, Vite |
| **API** | HTTP 端点、认证、参数校验、限流 | FastAPI, Pydantic v2, JWT |
| **Service** | 业务逻辑：Skill 管理、审计编排、报告生成、Dashboard 聚合 | Python async |
| **Agent** | LLM 驱动的 ReAct 循环，代码分析智能体 | LangChain / LangGraph, LiteLLM |
| **Tool** | 具体的检测/验证操作 | Semgrep, Bandit, Docker SDK |
| **Infrastructure** | 数据持久化、缓存、向量检索、沙箱隔离 | PostgreSQL, Redis, ChromaDB, Docker |

---

## 3. Skill Engine 架构

Skill Engine 是平台的核心引擎，负责 Skill 的生命周期管理和执行编排。

```
                      ┌────────────────────┐
                      │   Skill Registry   │
                      │                    │
                      │ • register(skill)  │
                      │ • get(slug)        │
                      │ • list(filters)    │
                      │ • import_openclaw()│
                      └────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ OC Importer   │    │ Skill Resolver  │    │ Skill           │
│               │    │                 │    │ Recommender     │
│ skill.yaml ─┐ │    │ profile.skills  │    │                 │
│ SKILL.md  ─┤ │    │     │           │    │ project_meta ─┐ │
│            ↓ │    │     ▼           │    │              ↓ │
│ → pipeline   │    │ topo_sort()     │    │ match_rules()  │
│ → metadata   │    │     │           │    │              │ │
│ → Skill rec  │    │     ▼           │    │ → recommended │
│              │    │ ExecutionPlan   │    │   profiles    │
└───────────────┘    └─────────────────┘    └─────────────────┘
```

### 3.1 SkillResolver 执行计划

```python
@dataclass
class ExecutionPlan:
    phases: list[ExecutionPhase]

@dataclass
class ExecutionPhase:
    name: str           # "recon" | "detection" | "verification"
    parallel: bool
    skills: list[SkillConfig]

# 示例: Python Web 全栈审计
ExecutionPlan(phases=[
    ExecutionPhase(
        name="recon",
        parallel=False,
        skills=[SkillConfig("code-recon")]
    ),
    ExecutionPhase(
        name="detection",
        parallel=True,
        skills=[
            SkillConfig("dependency-audit"),
            SkillConfig("secret-detection"),
            SkillConfig("sql-injection", config={"scan_depth": "deep"}),
            SkillConfig("xss-detection"),
            SkillConfig("csrf-detection"),
        ]
    ),
    ExecutionPhase(
        name="verification",
        parallel=False,
        skills=[]  # 验证阶段由各 Skill 的 pipeline 内部处理
    ),
])
```

### 3.2 SkillExecutor 管线执行

每个 Skill 内部的 `pipeline.yaml` 定义了多个 phase，SkillExecutor 逐个执行：

```
┌─────────────────────────────────────────────────────┐
│                SkillExecutor                         │
│                                                     │
│  Input: Skill + config + project_context            │
│                                                     │
│  ┌─────────────────┐                                │
│  │ static_analysis  │  →  ToolRunner                │
│  │                  │     ├── semgrep_scan()         │
│  │                  │     └── bandit_scan()          │
│  └────────┬────────┘                                │
│           │ findings[]                              │
│  ┌────────▼────────┐                                │
│  │ ai_deep_analysis│  →  AgentBuilder               │
│  │                 │     ├── system_prompt (Skill)   │
│  │                 │     ├── tools (file, rag, ...)  │
│  │                 │     └── ReAct loop              │
│  └────────┬────────┘                                │
│           │ findings[]                              │
│  ┌────────▼────────┐                                │
│  │  verification   │  →  SandboxRunner              │
│  │  (conditional)  │     ├── test_sql_injection()   │
│  │                 │     └── run_code(poc)           │
│  └────────┬────────┘                                │
│           │                                          │
│  Output: SkillExecution + findings[]                │
└─────────────────────────────────────────────────────┘
```

---

## 4. Audit Engine 架构

```
POST /audits
     │
     ▼
┌──────────────────────────────────────┐
│            Audit Engine              │
│                                      │
│  1. Create AuditTask (pending)       │
│  2. Load SkillProfile                │
│  3. SkillResolver.resolve()          │
│  4. Start background coroutine       │
│                                      │
│  ┌────────────────────────────────┐  │
│  │     Background Execution       │  │
│  │                                │  │
│  │  for phase in plan.phases:     │  │
│  │    if parallel:                │  │
│  │      gather(run_skill(...))    │  │
│  │    else:                       │  │
│  │      for s in phase.skills:    │  │
│  │        run_skill(s)            │  │
│  │                                │  │
│  │  Events → EventManager → SSE  │  │
│  │  Findings → FindingEngine      │  │
│  │  Stats → update AuditTask      │  │
│  │                                │  │
│  │  After all:                    │  │
│  │    aggregate_findings()        │  │
│  │    calculate_score()           │  │
│  │    update_project()            │  │
│  │    invalidate_cache()          │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 4.1 SSE 事件流

```
GET /audits/{id}/stream
     │
     ▼
EventManager 推送事件:

data: {"type": "phase_start", "phase": "detection", "message": "开始检测阶段"}

data: {"type": "skill_start", "skill": "sql-injection", "message": "开始 SQL 注入检测"}

data: {"type": "thinking", "content": "分析 app/models/user.py 中的查询语句..."}

data: {"type": "tool_call", "tool": "semgrep_scan", "input": {"rulesets": ["p/sql-injection"]}}

data: {"type": "tool_result", "tool": "semgrep_scan", "output": {"findings": 3}, "duration_ms": 2340}

data: {"type": "finding", "finding": {"title": "SQL 注入", "severity": "critical", ...}}

data: {"type": "skill_complete", "skill": "sql-injection", "findings_count": 5, "duration_ms": 45000}

data: {"type": "progress", "percent": 72.5, "message": "已完成 5/7 Skills"}

data: {"type": "complete", "summary": {"total_findings": 23, "security_score": 78.5}}
```

---

## 5. Finding Engine 架构

```
┌──────────────────────────────────────────────┐
│              Finding Engine                    │
│                                                │
│  ┌────────────────────────────────────────┐   │
│  │           Finding Creator              │   │
│  │                                        │   │
│  │  Input: raw finding from Skill         │   │
│  │                                        │   │
│  │  1. generate_fingerprint()             │   │
│  │     sha256(file + type + code_hash)    │   │
│  │                                        │   │
│  │  2. check_duplicate(fingerprint)       │   │
│  │     → if dup: link to existing         │   │
│  │                                        │   │
│  │  3. categorize()                       │   │
│  │     → match vulnerability_type         │   │
│  │       to FindingCategory               │   │
│  │                                        │   │
│  │  4. persist Finding record             │   │
│  └────────────────────────────────────────┘   │
│                                                │
│  ┌────────────────────────────────────────┐   │
│  │         Status Machine                 │   │
│  │                                        │   │
│  │  open ──┬──> confirmed ──> fixing      │   │
│  │         │                    │          │   │
│  │         ├──> false_positive  ▼          │   │
│  │         │               resolved       │   │
│  │         └──> accepted_risk    │         │   │
│  │                           reopen ──> open│  │
│  │                                        │   │
│  │  Transitions log → finding_history     │   │
│  └────────────────────────────────────────┘   │
│                                                │
│  ┌────────────────────────────────────────┐   │
│  │        AI Enhancement                  │   │
│  │                                        │   │
│  │  ai-explain: LLM 深度解释              │   │
│  │  ai-fix: LLM 生成修复代码              │   │
│  │  similar: embedding 相似搜索            │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

---

## 6. Report Engine 架构

```
POST /reports
     │
     ▼
┌──────────────────────────────────────┐
│           Report Generator           │
│                                      │
│  1. Load AuditTask + Findings        │
│  2. Load ReportTemplate              │
│  3. Aggregate stats snapshot         │
│  4. (Optional) AI Executive Summary  │
│     └── LLM.generate_summary(...)    │
│  5. Jinja2 render template           │
│  6. Render to target format:         │
│     ├── PDFRenderer (WeasyPrint)     │
│     ├── MarkdownRenderer             │
│     ├── HTMLRenderer                 │
│     └── JSONRenderer                 │
│  7. Save file + create Report record │
└──────────────────────────────────────┘
```

---

## 7. Dashboard Engine 架构

```
┌──────────────────────────────────────────────────┐
│              Dashboard Aggregator                 │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │  Request: GET /dashboard/overview           │  │
│  │                                             │  │
│  │  1. Check Redis cache                       │  │
│  │     key: dash:overview:{user_id}            │  │
│  │     TTL: 5 minutes                          │  │
│  │                                             │  │
│  │  2. Cache miss → query PostgreSQL           │  │
│  │     SELECT count(*) FROM projects ...       │  │
│  │     SELECT count(*) FROM audit_tasks ...    │  │
│  │     SELECT count(*), severity FROM findings │  │
│  │     SELECT avg(security_score) FROM ...     │  │
│  │                                             │  │
│  │  3. Store in Redis + return                 │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │  Cache Invalidation Triggers               │  │
│  │                                             │  │
│  │  • Audit task completed → invalidate        │  │
│  │    dash:overview:*, dash:project:{pid}      │  │
│  │                                             │  │
│  │  • Finding status changed → invalidate      │  │
│  │    dash:severity, dash:overview:*           │  │
│  │                                             │  │
│  │  • Trend data → hourly cron job             │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 8. OpenClaw 兼容层架构

```
┌──────────────────────────────────────────────────┐
│         OpenClaw Compatibility Layer              │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │           OpenClawImporter                  │  │
│  │                                             │  │
│  │  Input sources:                             │  │
│  │  • ClawHub URL                             │  │
│  │  • GitHub repo path                        │  │
│  │  • Local directory                         │  │
│  │  • Pasted YAML/MD content                  │  │
│  │                                             │  │
│  │  Process:                                   │  │
│  │  1. Fetch & parse skill.yaml               │  │
│  │     → extract name, version, author        │  │
│  │     → extract permissions                  │  │
│  │     → extract entryPoint                   │  │
│  │     → extract config params                │  │
│  │                                             │  │
│  │  2. Fetch & parse SKILL.md (if exists)     │  │
│  │     → extract frontmatter                  │  │
│  │     → extract instructions                 │  │
│  │                                             │  │
│  │  3. Generate pipeline.yaml                 │  │
│  │     entryPoint.natural → ai_analysis phase │  │
│  │     entryPoint.shell   → static phase      │  │
│  │     entryPoint.ts      → static phase      │  │
│  │                                             │  │
│  │  4. Infer metadata.yaml                    │  │
│  │     description + tags → category guess    │  │
│  │     keywords → CWE/OWASP mapping           │  │
│  │                                             │  │
│  │  5. Create Skill record in DB              │  │
│  │     openclaw_manifest = original yaml      │  │
│  │     openclaw_instructions = original md    │  │
│  │     openclaw_source = clawhub | local      │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │          OpenClawExporter                   │  │
│  │                                             │  │
│  │  VulnHunter Skill → skill.yaml + SKILL.md  │  │
│  │  → Publishable to ClawHub                  │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │      OpenClaw Runtime Adapter               │  │
│  │                                             │  │
│  │  For imported skills at execution time:     │  │
│  │                                             │  │
│  │  type=natural:                              │  │
│  │    Agent.system_prompt += OC prompt          │  │
│  │    Agent.instructions += SKILL.md sections  │  │
│  │                                             │  │
│  │  type=shell:                                │  │
│  │    sandbox.exec(entryPoint.path)            │  │
│  │    parse stdout → findings                  │  │
│  │                                             │  │
│  │  type=typescript:                           │  │
│  │    node_sandbox.exec(entryPoint.path)       │  │
│  │    parse stdout → findings                  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 9. 前端架构

```
src/
├── app/
│   ├── App.tsx              # <BrowserRouter> + <AuthProvider> + routes
│   ├── routes.tsx           # 路由表 (path, element, sidebar visibility)
│   └── ProtectedRoute.tsx   # JWT guard
│
├── pages/                   # 每个页面一个目录
│   ├── Dashboard/
│   │   ├── index.tsx        # 页面入口
│   │   ├── components/      # 页面级组件
│   │   │   ├── OverviewCards.tsx
│   │   │   ├── TrendChart.tsx
│   │   │   ├── SeverityDonut.tsx
│   │   │   ├── TopVulnerabilities.tsx
│   │   │   ├── RecentActivity.tsx
│   │   │   └── SkillStats.tsx
│   │   └── hooks/
│   │       └── useDashboardData.ts
│   ├── Projects/
│   ├── ProjectDetail/       # Tabs: overview, audits, findings, reports, skills, settings
│   ├── Audits/
│   ├── AuditDetail/         # 实时流 + 结果
│   │   ├── index.tsx
│   │   ├── components/
│   │   │   ├── LiveStream.tsx     # SSE 日志面板
│   │   │   ├── SkillProgress.tsx  # Skill 执行进度卡
│   │   │   ├── FindingList.tsx
│   │   │   └── Summary.tsx
│   │   └── hooks/
│   │       └── useAuditStream.ts  # SSE hook
│   ├── Findings/
│   │   ├── index.tsx
│   │   └── components/
│   │       ├── FindingTable.tsx
│   │       ├── FindingDetail.tsx  # 侧面板
│   │       ├── Filters.tsx
│   │       ├── BulkActions.tsx
│   │       └── CommentThread.tsx
│   ├── Reports/
│   ├── Skills/
│   │   ├── index.tsx
│   │   └── components/
│   │       ├── SkillCard.tsx
│   │       ├── ImportDialog.tsx   # OpenClaw 导入
│   │       └── PipelineView.tsx
│   ├── SkillProfiles/
│   ├── Admin/
│   └── Account/
│
├── components/
│   ├── ui/                  # shadcn/ui 基础组件
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── MainLayout.tsx
│   │   └── PageHeader.tsx
│   └── shared/
│       ├── SeverityBadge.tsx
│       ├── StatusBadge.tsx
│       ├── SecurityScore.tsx
│       ├── CWETag.tsx
│       └── EmptyState.tsx
│
├── shared/
│   ├── api/                 # API 客户端模块
│   │   ├── client.ts        # Axios instance + interceptors
│   │   ├── auth.ts
│   │   ├── projects.ts
│   │   ├── skills.ts
│   │   ├── audits.ts
│   │   ├── findings.ts
│   │   ├── reports.ts
│   │   ├── dashboard.ts
│   │   └── categories.ts
│   ├── types/               # TypeScript 类型定义
│   │   ├── skill.ts
│   │   ├── finding.ts
│   │   ├── audit.ts
│   │   ├── report.ts
│   │   └── dashboard.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useSSE.ts
│   └── context/
│       └── AuthContext.tsx
│
└── assets/
    └── globals.css          # Tailwind base + custom
```

### 数据流

```
Page Component
     │
     │ useEffect / user action
     ▼
 API Client (shared/api/*)
     │
     │ axios.get/post/...
     ▼
 FastAPI Backend
     │
     │ response / SSE stream
     ▼
 useState / useReducer / Context
     │
     │ re-render
     ▼
 UI Components
```

---

## 10. 安全架构

```
┌────────────────────────────────────────────┐
│             Security Layers                 │
│                                             │
│  L1: Transport                              │
│    TLS/SSL (Nginx termination)              │
│    CORS whitelist                           │
│    Rate limiting (Redis counter)            │
│                                             │
│  L2: Authentication                         │
│    JWT (access 30min + refresh 7d)          │
│    bcrypt password hashing                  │
│    Token rotation on refresh                │
│                                             │
│  L3: Authorization                          │
│    RBAC: admin, auditor, developer, viewer  │
│    Project-level ownership check            │
│    API endpoint decorators                  │
│                                             │
│  L4: Data                                   │
│    API keys encrypted at rest (AES-256)     │
│    Database connection SSL                  │
│    No secrets in logs                       │
│                                             │
│  L5: Sandbox                                │
│    Docker container isolation               │
│    No network access                        │
│    CPU/mem/time limits                      │
│    Ephemeral filesystem                     │
└────────────────────────────────────────────┘
```

---

## 11. 部署拓扑

### 开发环境

```
localhost
├── Frontend   :5173  (Vite dev server)
├── Backend    :8000  (Uvicorn --reload)
├── PostgreSQL :5432  (Docker)
├── Redis      :6379  (Docker)
├── ChromaDB   :8100  (Docker)
└── Sandbox    :8080  (Docker)
```

### 生产环境 (Docker Compose)

```
┌───────────────────────────────────────┐
│           Docker Host                  │
│                                        │
│  ┌────────┐   ┌──────────────────┐    │
│  │ Nginx  │──▶│ Frontend (:3000) │    │
│  │  :443  │   └──────────────────┘    │
│  │  :80   │   ┌──────────────────┐    │
│  │        │──▶│ Backend  (:8000) │    │
│  └────────┘   └────────┬─────────┘    │
│                        │              │
│    ┌──────────┬────────┼────┬──────┐  │
│    ▼          ▼        ▼    ▼      │  │
│ ┌──────┐ ┌──────┐ ┌──────┐┌─────┐ │  │
│ │ PG15 │ │Redis7│ │Chroma││Sand-│ │  │
│ │:5432 │ │:6379 │ │:8100 ││box  │ │  │
│ └──────┘ └──────┘ └──────┘└─────┘ │  │
│                                    │  │
│  Volumes: pgdata, chromadata       │  │
└───────────────────────────────────────┘
```

---

*本文档描述 VulnHunter 的系统架构。配合 SPEC.md 和 IMPLEMENTATION_ROADMAP.md 使用。*
