# VulnHunter — 代码安全审计智能体平台 技术规格说明书

> **Version**: 0.2.0-draft  
> **Date**: 2026-03-13  
> **Status**: RFC  
> **License**: AGPL-3.0  
> **OpenClaw 兼容**: 基于 ClawHub 22,614 个 Skill 实际分析

---

## 目录

1. [愿景与产品定位](#1-愿景与产品定位)
2. [用户角色与核心场景](#2-用户角色与核心场景)
3. [核心领域模型](#3-核心领域模型)
4. [Skill 体系与 OpenClaw 兼容](#4-skill-体系与-openclaw-兼容)
5. [数据模型设计 (DDL)](#5-数据模型设计)
6. [后端 API 设计](#6-后端-api-设计)
7. [Agent 编排引擎](#7-agent-编排引擎)
8. [审计问题分类体系](#8-审计问题分类体系)
9. [报告管理系统](#9-报告管理系统)
10. [Dashboard 数据体系](#10-dashboard-数据体系)
11. [前端页面与交互设计](#11-前端页面与交互设计)
12. [安全与权限](#12-安全与权限)
13. [技术栈与基础设施](#13-技术栈与基础设施)
14. [部署方案](#14-部署方案)

---

## 1. 愿景与产品定位

### 1.1 一句话定位

**VulnHunter** 是一个全新的、以 **Skill 为核心** 的 Web 代码安全审计智能体平台。
它让安全团队能像搭积木一样组合审计能力（Skill），对不同技术栈的项目使用最合适的审计策略，并提供问题全生命周期管理、多维 Dashboard 和结构化报告输出。

### 1.2 核心理念

| 理念 | 说明 |
|------|------|
| **Skill 即能力** | 每种检测能力（SQL 注入、XSS、密钥泄漏…）都是一个独立的 Skill，可独立安装、配置、升级 |
| **OpenClaw 原生兼容** | Skill 格式直接兼容 OpenClaw `skill.yaml` / `SKILL.md`，可一键从 ClawHub 导入 |
| **项目即上下文** | 不同项目绑定不同的 Skill 组合（Skill Profile），审计策略随项目走 |
| **问题即资产** | 发现的漏洞不是一次性扫描结果，而是有状态、有分类、有生命周期的安全资产 |
| **数据即洞察** | Dashboard 提供安全态势、趋势分析、Skill 效果对比等多维度数据 |

### 1.3 与同类产品对比

| 维度 | SonarQube | Semgrep Cloud | Snyk Code | **VulnHunter** |
|------|-----------|---------------|-----------|----------------|
| 检测引擎 | 固定规则 | Semgrep 规则 | ML + 规则 | **AI Agent + 可组合 Skill** |
| 自定义能力 | 规则编写 | 规则编写 | 有限 | **OpenClaw Skill 生态** |
| 漏洞验证 | 无 | 无 | 无 | **沙箱 PoC 自动验证** |
| 问题管理 | 基本 | 基本 | 中等 | **全生命周期 + CWE 分类** |
| AI 能力 | 无 | 有限 | 有限 | **LLM 深度集成 + RAG** |
| 开源生态 | 插件市场 | Registry | 封闭 | **兼容 OpenClaw 生态** |

---

## 2. 用户角色与核心场景

### 2.1 角色定义

| 角色 | 典型用户 | 核心诉求 |
|------|---------|---------|
| **平台管理员** (Admin) | 安全负责人 | 管理用户、全局配置、查看平台级 Dashboard |
| **审计员** (Auditor) | 安全工程师 | 创建项目、配置 Skill、执行审计、处理 Finding |
| **开发者** (Developer) | 后端/前端开发 | 查看自己项目的 Finding、标记已修复、查看报告 |
| **观察者** (Viewer) | 管理层 | 只读访问 Dashboard 和报告 |

### 2.2 核心用户旅程

```
审计员的一天:

1. 创建项目 → 导入 Git 仓库 / 上传 ZIP
2. 选择 Skill Profile → "Python Web 全栈审计" (或让系统智能推荐)
3. (可选) 微调 Skill 参数 → 关闭 CSRF 检测、加深 SQL 注入扫描深度
4. 启动审计 → 观看实时日志 (SSE)
5. 审计完成 → 查看 Finding 列表、按严重程度排序
6. 逐个处理 Finding → 确认 / 标记误报 / 添加评论
7. 生成报告 → 选择模板、导出 PDF / Markdown
8. 查看 Dashboard → 安全评分趋势、Top 漏洞类型分布
```

---

## 3. 核心领域模型

```
                      ┌──────────────┐
                      │   Platform   │
                      └──────┬───────┘
                             │ manages
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ┌──────────┐      ┌──────────┐       ┌──────────┐
   │   User   │      │  Skill   │       │ Category │
   └────┬─────┘      └────┬─────┘       └────┬─────┘
        │ owns             │ grouped          │ classifies
        ▼                  ▼                  ▼
   ┌──────────┐      ┌────────────┐     ┌──────────┐
   │ Project  │─────▶│Skill       │     │ Finding  │
   │          │ uses │Profile     │     │          │
   └────┬─────┘      └────────────┘     └────┬─────┘
        │ runs                                │ found_by
        ▼                                     │
   ┌──────────┐      ┌────────────┐           │
   │AuditTask │─────▶│ Skill Exec │───────────┘
   │          │ has  │            │ produces
   └────┬─────┘      └────────────┘
        │ generates
        ▼
   ┌──────────┐
   │  Report  │
   └──────────┘
```

### 实体概览

| 实体 | 职责 | 关键属性 |
|------|------|---------|
| **User** | 平台用户 | email, role, llm_config |
| **Project** | 被审计项目 | name, repo_url, source_type, default_profile |
| **Skill** | 审计能力单元 | slug, version, pipeline, openclaw_meta |
| **SkillProfile** | 面向项目的 Skill 组合 | skills[], verification_level |
| **AuditTask** | 一次审计执行 | project, profile, status, progress |
| **SkillExecution** | 单个 Skill 在 Task 内的执行 | skill, status, findings_count |
| **Finding** | 发现的安全问题 | severity, category, status, file_path |
| **FindingCategory** | CWE/OWASP 分类树 | code, cwe_id, parent |
| **Report** | 审计报告 | type, format, version, status |
| **ReportTemplate** | 报告模板 | content_template, type |

---

## 4. Skill 体系与 OpenClaw 兼容

### 4.1 OpenClaw Skill 的真实形态

通过分析 ClawHub 上 **22,614 个 Skill**，我们发现 OpenClaw Skill 有两种实际形态：

**Type A: 纯 SKILL.md（占绝大多数）** — 只有一个 `SKILL.md` 文件，内容是 AI Agent 的行为指令 + 嵌入的代码块。Agent 阅读 Markdown 并按指令行事。

**Type B: SKILL.md + 独立脚本文件（占 ~30%）** — `SKILL.md` + 实际可执行的 Python/Shell/JS 脚本。脚本是独立的 CLI 工具，`SKILL.md` 说明如何调用。

> 注意：`skill.yaml` manifest 格式仅有 214 个 Skill（< 1%）使用，VulnHunter 支持但不以此为设计重心。

```
┌───────────────────────────────────────────────────────┐
│              VulnHunter Skill 结构                     │
│                                                       │
│  ┌───────────────────────────────────────────────┐    │
│  │  OpenClaw 兼容层（原始文件，完整保留）          │    │
│  │                                               │    │
│  │  SKILL.md (必须)                              │    │
│  │  ├── frontmatter: name, description, metadata │    │
│  │  └── body: 指令 + 嵌入代码块                  │    │
│  │                                               │    │
│  │  脚本文件 (Type B 才有)                        │    │
│  │  ├── *.py — Python 脚本                       │    │
│  │  ├── *.sh — Shell 脚本                        │    │
│  │  ├── *.js / *.ts — JS/TS 脚本                 │    │
│  │  ├── package.json — Node 依赖                 │    │
│  │  └── requirements.txt — Python 依赖           │    │
│  │                                               │    │
│  │  _meta.json — ClawHub 注册信息                 │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  ┌───────────────────────────────────────────────┐    │
│  │  VulnHunter 扩展层（自动生成 / 手动配置）      │    │
│  │                                               │    │
│  │  pipeline_config (JSONB)                      │    │
│  │  ├── 从 SKILL.md + 脚本文件自动推断           │    │
│  │  ├── phases: 嵌入脚本执行 → AI 分析 → 验证    │    │
│  │  └── 可手动覆盖                               │    │
│  │                                               │    │
│  │  metadata (DB fields)                         │    │
│  │  ├── category — 从 description/tags 推断      │    │
│  │  ├── cwe_ids, owasp_ids                       │    │
│  │  ├── supported_languages / frameworks         │    │
│  │  └── required_bins — 从 metadata.requires 提取 │    │
│  └───────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────┘
```

### 4.2 OpenClaw Skill 导入流程

```
OpenClaw Skill（ClawHub URL / GitHub / 本地目录 / 粘贴）
         │
         ▼
┌────────────────────────────────────────────────────┐
│              Skill Loader                          │
│                                                    │
│  1. 检测类型                                       │
│     ├── 有 SKILL.md + 脚本文件? → Type B          │
│     ├── 只有 SKILL.md?          → Type A          │
│     └── 有 skill.yaml?          → Type C (少见)   │
│                                                    │
│  2. 解析 SKILL.md                                  │
│     ├── frontmatter → name, description, metadata  │
│     ├── body 代码块提取 → embedded_scripts[]       │
│     └── 工作流段落 → Agent 指令                    │
│                                                    │
│  3. 扫描脚本文件                                    │
│     ├── *.py / *.sh / *.js → script_files[]       │
│     ├── package.json → node_deps                   │
│     └── requirements.txt → python_deps             │
│                                                    │
│  4. 安全扫描 (30+ 恶意模式)                        │
│                                                    │
│  5. 自动生成 pipeline_config                       │
│     ├── Type A → 嵌入脚本执行 + AI 指令跟随       │
│     └── Type B → 依赖安装 + 脚本执行 + 输出解析    │
│                                                    │
│  6. 推断 metadata                                  │
│     ├── category ← description + tags 关键字匹配   │
│     └── required_bins ← metadata.clawdbot.requires │
│                                                    │
│  7. 存入数据库 + 文件系统                           │
└────────────────────────────────────────────────────┘
```

### 4.3 OpenClaw Skill 执行机制

#### Type A（纯 Markdown）执行

Agent 阅读 SKILL.md 指令，按工作流步骤行事；同时提取嵌入的代码块在 Sandbox 中执行：

```
SKILL.md body
    │
    ├── 嵌入的 bash 代码块 ──→ Sandbox 逐个执行
    │   ├── npm audit --json
    │   ├── pip-audit -r requirements.txt
    │   ├── grep -rn 'AKIA...' (密钥扫描)
    │   └── openssl s_client (SSL 检测)
    │
    ├── 工作流指令 ──→ 注入 Agent system prompt
    │   └── Agent 按照步骤进行深度代码分析
    │
    └── 两者输出合并 ──→ Finding 列表
```

#### Type B（有脚本文件）执行

```
Skill 目录
    │
    ├── 1. 依赖安装
    │   ├── pip install -r requirements.txt
    │   └── npm install (如有 package.json)
    │
    ├── 2. 脚本执行（在 Docker Sandbox 中）
    │   ├── python3 slither-audit.py /project --format json
    │   └── 或 node scripts/audit.js /project
    │
    ├── 3. 输出解析（多级 fallback）
    │   ├── 尝试 JSON → 结构化 findings
    │   ├── 尝试 SARIF
    │   ├── 尝试 Markdown 报告格式
    │   ├── 尝试结构化文本 [SEVERITY] file:line msg
    │   └── LLM Fallback → 从自由文本提取
    │
    └── 4. (可选) AI 增强分析
        └── Agent 基于脚本结果做深度补充
```

> 完整的 OpenClaw 兼容技术细节见 [SKILL_COMPATIBILITY.md](./SKILL_COMPATIBILITY.md)

### 4.3 Skill 目录结构

```
skills/
├── builtin/                       # 平台内置 Skill
│   ├── code-recon/
│   │   ├── SKILL.md               # OpenClaw 兼容的 Skill 指令
│   │   └── pipeline.yaml          # VulnHunter 管线配置
│   ├── sql-injection/
│   │   ├── SKILL.md               # OpenClaw 兼容 + 嵌入检测脚本
│   │   ├── pipeline.yaml
│   │   └── knowledge/             # 知识库
│   │       ├── patterns.yaml
│   │       └── references.md
│   ├── dependency-audit/
│   │   ├── SKILL.md
│   │   ├── scan.py                # 独立 Python 脚本（Type B）
│   │   ├── requirements.txt
│   │   └── pipeline.yaml
│   ├── secret-detection/
│   ├── xss-detection/
│   ├── csrf-detection/
│   ├── ssrf-detection/
│   ├── path-traversal/
│   ├── auth-bypass/
│   ├── insecure-deserialization/
│   ├── crypto-weakness/
│   ├── api-security/
│   └── full-audit/                # 组合型 Skill
│       ├── SKILL.md
│       └── pipeline.yaml          # 引用其他所有 Skill
│
└── imported/                      # 从 OpenClaw/ClawHub 导入的 Skill
    └── {author}/
        └── {skill-name}/
            ├── SKILL.md           # 原始 SKILL.md（完整保留）
            ├── _meta.json         # ClawHub 元数据
            ├── *.py / *.sh / *.js # 原始脚本文件（如有）
            ├── package.json       # Node 依赖（如有）
            ├── requirements.txt   # Python 依赖（如有）
            └── .vulnhunter/
                └── pipeline.yaml  # 自动生成的管线
```

### 4.4 内置 Skill SKILL.md 示例（OpenClaw 兼容格式）

以下是内置 SQL 注入检测 Skill 的 `SKILL.md`，同时兼容 OpenClaw 生态和 VulnHunter 管线：

```markdown
---
name: sql-injection-detection
description: >
  Detect SQL injection vulnerabilities in source code.
  Use when auditing database-interacting code, checking raw queries,
  string concatenation in SQL, ORM bypass, and stored procedures.
  Also covers blind injection and second-order injection.
metadata:
  clawdbot:
    emoji: "💉"
    requires:
      anyBins: ["semgrep", "python3"]
    os: ["linux", "darwin"]
tags: [sql-injection, database, security, owasp-a03]
---

# SQL Injection Detection

## When to Use
- Auditing database-interacting code
- Reviewing raw SQL queries and ORM usage
- Checking for string concatenation/interpolation in queries
- Scanning for second-order injection vectors

## Workflow

### Step 1: Static Scan with Semgrep

` ` `bash
semgrep --config p/sql-injection --config p/python-sql-injection \
  --severity WARNING --severity ERROR \
  --json --output /tmp/semgrep-sqli.json \
  $PROJECT_PATH
` ` `

### Step 2: Python-specific scan with Bandit

` ` `bash
bandit -r $PROJECT_PATH -t B608,B610,B611 -f json -o /tmp/bandit-sqli.json 2>/dev/null || true
` ` `

### Step 3: Pattern-based detection

` ` `bash
# Raw SQL with string concatenation/interpolation
grep -rn "execute.*f\"\|execute.*format\|execute.*%s\|execute.*+" \
  --include='*.py' --include='*.java' --include='*.php' \
  --include='*.js' --include='*.ts' --include='*.rb' \
  $PROJECT_PATH | grep -iv 'test\|mock\|example'

# ORM raw query methods
grep -rn "raw_query\|RawSQL\|text(\|nativeQuery\|createNativeQuery\|raw(" \
  --include='*.py' --include='*.java' --include='*.js' \
  $PROJECT_PATH
` ` `

### Step 4: AI Deep Analysis

Focus on:
- Functions that build SQL queries from user input
- Data flow from request parameters to query execution
- ORM `.extra()`, `.raw()`, `RawSQL()` usage
- Stored procedure calls with dynamic parameters
- Second-order injection (data stored → later used in query)

For each finding, report:
- File path and line number
- The vulnerable code snippet
- How user input reaches the query (data flow)
- Severity: critical (direct concatenation), high (indirect), medium (ORM bypass)
- Specific remediation using parameterized queries

## Output Format

Each finding should include:
- severity: critical | high | medium
- file_path, line_start
- code_snippet
- description
- suggestion (parameterized query example)
- dataflow_path (if traceable)
```

> 注：上面示例中的三个反引号已转义显示，实际 SKILL.md 中使用标准 Markdown 代码围栏。

### 4.5 pipeline.yaml 完整示例（VulnHunter 扩展）

```yaml
phases:
  - name: static_analysis
    description: "使用 SAST 工具进行静态扫描"
    parallel: false
    steps:
      - tool: semgrep
        config:
          rulesets:
            - p/sql-injection
            - p/python-sql-injection
          severity: [WARNING, ERROR]
      - tool: bandit
        config:
          tests: [B608, B610, B611]
        when: "language == 'python'"

  - name: ai_deep_analysis
    description: "AI Agent 深度分析"
    parallel: false
    agent:
      type: analysis
      knowledge_modules:
        - sql_injection
      focus_patterns:
        - "cursor.execute"
        - "raw_query"
        - "text\\("
        - "format.*SELECT"
        - "f\".*SELECT"
        - "\\$_GET\\["
        - "\\$_POST\\["
        - "request\\.args"
      max_iterations: 15

  - name: verification
    description: "沙箱环境验证"
    parallel: false
    when: "config.verification_level in ['poc', 'exploit']"
    sandbox:
      tools:
        - test_sql_injection
        - sandbox_http
      timeout_seconds: 120

output:
  finding_type: sql_injection
  required_fields:
    - file_path
    - line_start
    - code_snippet
    - description
    - severity
  optional_fields:
    - poc_code
    - dataflow_path
    - fix_code
    - source
    - sink

dependencies:
  - skill: code-recon
    reason: "需要项目结构和数据库入口点信息"

parameters:
  - name: scan_depth
    type: enum
    values: [shallow, normal, deep]
    default: normal
  - name: include_orm
    type: boolean
    default: true
  - name: verification_level
    type: enum
    values: [none, basic, poc, exploit]
    default: basic
```

### 4.6 metadata.yaml 示例

```yaml
category: injection
subcategory: sql_injection

cwe_ids:
  - CWE-89
  - CWE-564

owasp_ids:
  - "A03:2021"

severity_range: [medium, critical]

supported_languages:
  - python
  - java
  - php
  - javascript
  - go
  - ruby

supported_frameworks:
  - django
  - flask
  - fastapi
  - spring
  - laravel
  - express
  - rails

tags:
  - sql
  - injection
  - database
  - query
  - orm

icon: database
color: "#e74c3c"
```

### 4.7 内置 Skill 清单

| ID | 名称 | 类别 | 主要工具/方法 | 语言 |
|----|------|------|-------------|------|
| `code-recon` | 代码侦查 | recon | file_tool, search_code | All |
| `dependency-audit` | 依赖审计 | supply-chain | npm_audit, safety, osv-scan | All |
| `secret-detection` | 密钥泄漏检测 | credential | gitleaks, trufflehog | All |
| `sql-injection` | SQL 注入 | injection | semgrep, bandit, AI, sandbox | Py/Java/PHP/JS/Go |
| `xss-detection` | XSS 检测 | injection | semgrep, AI, sandbox | JS/TS/Py/PHP |
| `csrf-detection` | CSRF 检测 | session | AI analysis | Py/Java/PHP |
| `ssrf-detection` | SSRF 检测 | ssrf | AI, sandbox | All |
| `path-traversal` | 路径穿越 | file | semgrep, AI, sandbox | All |
| `auth-bypass` | 认证绕过 | auth | AI analysis | All |
| `insecure-deser` | 不安全反序列化 | deserialization | semgrep, AI | Java/PHP/Py |
| `crypto-weakness` | 加密弱点 | crypto | bandit, AI | All |
| `api-security` | API 安全 | api | AI analysis | All |
| `full-audit` | 全面审计 (组合) | composite | 组合以上所有 | All |

### 4.8 Skill Profile

Skill Profile 是绑定到项目的 Skill 组合方案。

```yaml
name: "Python Web 全栈审计"
description: "适用于 Django / Flask / FastAPI 项目的全面安全审计"
target_languages: [python]
target_frameworks: [django, flask, fastapi]

skills:
  - skill: code-recon
    priority: 1
    enabled: true

  - skill: dependency-audit
    priority: 2
    enabled: true

  - skill: secret-detection
    priority: 3
    enabled: true

  - skill: sql-injection
    priority: 4
    enabled: true
    config:
      scan_depth: deep
      include_orm: true

  - skill: xss-detection
    priority: 5
    enabled: true

  - skill: csrf-detection
    priority: 6
    enabled: true

  - skill: ssrf-detection
    priority: 7
    enabled: true

  - skill: auth-bypass
    priority: 8
    enabled: true

  - skill: api-security
    priority: 9
    enabled: true

verification_level: poc
```

### 4.9 Skill 推荐引擎

```
项目创建/导入
     │
     ▼
┌──────────────────────────┐
│    项目特征提取            │
│    language(s)            │
│    framework(s)           │
│    package manifest       │
│    file patterns          │
└────────────┬─────────────┘
             │
     ┌───────▼────────┐
     │ 匹配规则引擎     │
     │                 │
     │ 1. 语言匹配     │
     │ 2. 框架匹配     │
     │ 3. 文件模式     │
     │ 4. 依赖分析     │
     └───────┬────────┘
             │
     ┌───────▼────────┐
     │ 输出推荐 Profile│
     │                 │
     │ ✅ 必选 Skills   │
     │ ⭐ 推荐 Skills   │
     │ ➕ 可选 Skills   │
     └─────────────────┘
```

---

## 5. 数据模型设计

### 5.1 ER 总图

```
users
  │
  ├──< projects ──< audit_tasks ──< skill_executions
  │       │              │                │
  │       │              │                ├──< findings ──< finding_comments
  │       │              │                │        │
  │       │              │                │        └──< finding_history
  │       │              │                │
  │       │              └──< audit_events
  │       │              │
  │       │              └──< reports
  │       │
  │       └──< project_skill_profiles ──> skill_profiles
  │
  ├──< skills ──< skill_executions
  │
  └──< report_templates

finding_categories (self-referencing tree)
```

### 5.2 表定义

#### users

```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    hashed_pwd    VARCHAR(255) NOT NULL,
    full_name     VARCHAR(100),
    role          VARCHAR(20) NOT NULL DEFAULT 'auditor',
                  -- admin | auditor | developer | viewer
    avatar_url    VARCHAR(500),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    llm_config    JSONB DEFAULT '{}',
    preferences   JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### projects

```sql
CREATE TABLE projects (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(200) NOT NULL,
    description           TEXT,
    source_type           VARCHAR(20) NOT NULL DEFAULT 'repository',
                          -- repository | zip
    repository_url        VARCHAR(500),
    repository_type       VARCHAR(20),
                          -- github | gitlab | gitea | bitbucket | other
    default_branch        VARCHAR(100) DEFAULT 'main',
    detected_languages    JSONB DEFAULT '[]',
    detected_frameworks   JSONB DEFAULT '[]',

    -- Skill Profile 绑定
    default_profile_id    UUID REFERENCES skill_profiles(id),
    auto_recommend        BOOLEAN DEFAULT true,

    -- 安全态势快照（每次审计结束更新）
    security_score        REAL DEFAULT 0,
    open_findings_count   INTEGER DEFAULT 0,
    total_findings_count  INTEGER DEFAULT 0,
    total_audits_count    INTEGER DEFAULT 0,
    last_audit_at         TIMESTAMPTZ,

    owner_id              UUID NOT NULL REFERENCES users(id),
    is_active             BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_owner ON projects(owner_id);
```

#### skills

```sql
CREATE TABLE skills (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                  VARCHAR(120) NOT NULL UNIQUE,
    name                  VARCHAR(200) NOT NULL,
    version               VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    description           TEXT,

    -- OpenClaw 兼容层（完整保留原始数据）
    openclaw_skill_md     TEXT,           -- 原始 SKILL.md 完整内容
    openclaw_meta_json    JSONB,          -- 原始 _meta.json
    openclaw_manifest     JSONB,          -- 原始 skill.yaml (如有,仅 <1% 使用)
    openclaw_source       VARCHAR(20),    -- builtin | clawhub | github | local
    openclaw_author       VARCHAR(100),
    openclaw_skill_type   VARCHAR(10),    -- type_a | type_b | type_c

    -- 运行时依赖（从 SKILL.md metadata + 文件中提取）
    required_bins         JSONB DEFAULT '[]',  -- ["npm","pip","semgrep"]
    supported_os          JSONB DEFAULT '[]',  -- ["linux","darwin"]
    python_deps           TEXT,                 -- requirements.txt 原始内容
    node_deps             JSONB,                -- package.json 原始内容

    -- 脚本文件
    script_files          JSONB DEFAULT '[]',  -- [{path,language,size}]
    embedded_scripts      JSONB DEFAULT '[]',  -- [{language,code,context}] 从 MD 提取

    -- VulnHunter 管线
    pipeline_config       JSONB NOT NULL DEFAULT '{}',

    -- 元数据
    category              VARCHAR(50) NOT NULL,
    cwe_ids               JSONB DEFAULT '[]',
    owasp_ids             JSONB DEFAULT '[]',
    tags                  JSONB DEFAULT '[]',
    supported_languages   JSONB DEFAULT '[]',
    supported_frameworks  JSONB DEFAULT '[]',
    severity_range        JSONB DEFAULT '[]',
    icon                  VARCHAR(50),
    color                 VARCHAR(7),

    -- 可配置参数 schema
    parameters_schema     JSONB DEFAULT '[]',
    -- Skill 依赖
    dependencies          JSONB DEFAULT '[]',

    -- 状态
    status                VARCHAR(20) NOT NULL DEFAULT 'active',
                          -- draft | active | deprecated | archived
    is_builtin            BOOLEAN DEFAULT false,

    -- 统计
    usage_count           INTEGER DEFAULT 0,
    avg_exec_time_ms      REAL DEFAULT 0,
    avg_findings          REAL DEFAULT 0,

    author_id             UUID REFERENCES users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_skills_slug ON skills(slug);
CREATE INDEX idx_skills_category ON skills(category);
```

#### skill_profiles

```sql
CREATE TABLE skill_profiles (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(200) NOT NULL,
    description           TEXT,
    target_languages      JSONB DEFAULT '[]',
    target_frameworks     JSONB DEFAULT '[]',
    skills_config         JSONB NOT NULL,
                          -- [{skill_slug, priority, enabled, config:{}}]
    verification_level    VARCHAR(20) DEFAULT 'basic',
    is_builtin            BOOLEAN DEFAULT false,
    usage_count           INTEGER DEFAULT 0,
    created_by            UUID REFERENCES users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### project_skill_profiles

```sql
CREATE TABLE project_skill_profiles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    profile_id  UUID NOT NULL REFERENCES skill_profiles(id),
    is_default  BOOLEAN DEFAULT false,
    overrides   JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, profile_id)
);
```

#### audit_tasks

```sql
CREATE TABLE audit_tasks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES projects(id),
    profile_id        UUID REFERENCES skill_profiles(id),
    name              VARCHAR(200),
    task_type         VARCHAR(20) DEFAULT 'skill_based',
                      -- skill_based | quick_scan | instant
    branch_name       VARCHAR(200),
    exclude_patterns  JSONB DEFAULT '[]',
    target_files      JSONB DEFAULT '[]',
    llm_config        JSONB DEFAULT '{}',
    verification_lvl  VARCHAR(20) DEFAULT 'basic',

    -- 状态
    status            VARCHAR(20) NOT NULL DEFAULT 'pending',
                      -- pending | running | completed | failed | cancelled
    current_phase     VARCHAR(50),
    progress_pct      REAL DEFAULT 0,
    error_message     TEXT,

    -- 统计
    total_files       INTEGER DEFAULT 0,
    scanned_files     INTEGER DEFAULT 0,
    findings_count    INTEGER DEFAULT 0,
    critical_count    INTEGER DEFAULT 0,
    high_count        INTEGER DEFAULT 0,
    medium_count      INTEGER DEFAULT 0,
    low_count         INTEGER DEFAULT 0,
    info_count        INTEGER DEFAULT 0,
    security_score    REAL DEFAULT 0,
    tokens_used       INTEGER DEFAULT 0,
    duration_ms       INTEGER DEFAULT 0,

    created_by        UUID NOT NULL REFERENCES users(id),
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_project ON audit_tasks(project_id);
CREATE INDEX idx_tasks_status ON audit_tasks(status);
```

#### skill_executions

```sql
CREATE TABLE skill_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID NOT NULL REFERENCES audit_tasks(id) ON DELETE CASCADE,
    skill_id        UUID NOT NULL REFERENCES skills(id),
    status          VARCHAR(20) DEFAULT 'pending',
    current_phase   VARCHAR(50),
    config_snapshot JSONB,
    findings_count  INTEGER DEFAULT 0,
    exec_time_ms    INTEGER DEFAULT 0,
    tokens_used     INTEGER DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_skillexec_task ON skill_executions(task_id);
```

#### finding_categories

```sql
CREATE TABLE finding_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(20) NOT NULL UNIQUE,  -- e.g. INJ-SQL
    name            VARCHAR(200) NOT NULL,
    name_en         VARCHAR(200),
    description     TEXT,
    parent_id       UUID REFERENCES finding_categories(id),
    depth           SMALLINT DEFAULT 0,
    sort_order      SMALLINT DEFAULT 0,
    cwe_id          VARCHAR(20),
    owasp_id        VARCHAR(20),
    remediation     TEXT,               -- Markdown
    references      JSONB DEFAULT '[]',
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_parent ON finding_categories(parent_id);
```

#### findings

```sql
CREATE TABLE findings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id             UUID NOT NULL REFERENCES audit_tasks(id) ON DELETE CASCADE,
    skill_execution_id  UUID REFERENCES skill_executions(id),
    category_id         UUID REFERENCES finding_categories(id),

    -- 基本
    title               VARCHAR(500) NOT NULL,
    description         TEXT,
    vulnerability_type  VARCHAR(100) NOT NULL,
    severity            VARCHAR(20) NOT NULL,
                        -- critical | high | medium | low | info

    -- 位置
    file_path           VARCHAR(500) NOT NULL,
    line_start          INTEGER,
    line_end            INTEGER,
    column_start        INTEGER,
    column_end          INTEGER,
    function_name       VARCHAR(200),
    class_name          VARCHAR(200),
    code_snippet        TEXT,

    -- 数据流
    source_point        TEXT,
    sink_point          TEXT,
    dataflow_path       JSONB,

    -- 检测
    detected_by         VARCHAR(50),     -- skill slug / tool name
    confidence          REAL DEFAULT 0,

    -- 验证
    is_verified         BOOLEAN DEFAULT false,
    verification_method VARCHAR(50),
    verification_result TEXT,
    has_poc             BOOLEAN DEFAULT false,
    poc_code            TEXT,

    -- AI 解释
    ai_explanation      TEXT,
    ai_confidence       REAL DEFAULT 0,

    -- 修复
    suggestion          TEXT,
    fix_code            TEXT,

    -- CWE / CVSS
    cwe_id              VARCHAR(20),
    cvss_score          REAL,
    cvss_vector         VARCHAR(100),

    -- 生命周期
    status              VARCHAR(20) NOT NULL DEFAULT 'open',
                        -- open | confirmed | fixing | resolved
                        -- | false_positive | accepted_risk | duplicate
    resolution_note     TEXT,
    resolved_by         UUID REFERENCES users(id),
    resolved_at         TIMESTAMPTZ,

    -- 去重
    fingerprint         VARCHAR(64),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_findings_task ON findings(task_id);
CREATE INDEX idx_findings_severity ON findings(severity);
CREATE INDEX idx_findings_status ON findings(status);
CREATE INDEX idx_findings_fingerprint ON findings(fingerprint);
```

#### finding_comments

```sql
CREATE TABLE finding_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id  UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_finding ON finding_comments(finding_id);
```

#### finding_history

```sql
CREATE TABLE finding_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id  UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id),
    action      VARCHAR(50) NOT NULL,
    old_value   VARCHAR(200),
    new_value   VARCHAR(200),
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_history_finding ON finding_history(finding_id);
```

#### audit_events

```sql
CREATE TABLE audit_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID NOT NULL REFERENCES audit_tasks(id) ON DELETE CASCADE,
    event_type      VARCHAR(50) NOT NULL,
                    -- thinking | tool_call | tool_result | finding
                    -- | phase_start | phase_end | error | warning
    phase           VARCHAR(50),
    message         TEXT,
    tool_name       VARCHAR(50),
    tool_input      TEXT,
    tool_output     TEXT,
    tool_duration   INTEGER,
    tokens_used     INTEGER DEFAULT 0,
    metadata        JSONB DEFAULT '{}',
    seq             INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_task ON audit_events(task_id);
```

#### reports

```sql
CREATE TABLE reports (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id           UUID NOT NULL REFERENCES audit_tasks(id),
    title             VARCHAR(500) NOT NULL,
    report_type       VARCHAR(20) DEFAULT 'full',
                      -- full | executive | technical | compliance | delta
    format            VARCHAR(10) DEFAULT 'pdf',
                      -- pdf | markdown | html | json
    version           INTEGER DEFAULT 1,
    status            VARCHAR(20) DEFAULT 'draft',
                      -- draft | review | approved | published
    content           TEXT,
    executive_summary TEXT,
    template_id       UUID REFERENCES report_templates(id),
    stats_snapshot    JSONB,
    file_path         VARCHAR(500),
    file_size         INTEGER,
    generated_by      UUID NOT NULL REFERENCES users(id),
    approved_by       UUID REFERENCES users(id),
    approved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_task ON reports(task_id);
```

#### report_templates

```sql
CREATE TABLE report_templates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              VARCHAR(200) NOT NULL,
    description       TEXT,
    template_type     VARCHAR(20) DEFAULT 'full',
    content_template  TEXT NOT NULL,      -- Jinja2
    style_config      JSONB DEFAULT '{}',
    is_builtin        BOOLEAN DEFAULT false,
    is_active         BOOLEAN DEFAULT true,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 6. 后端 API 设计

### 6.1 总览

基础路径 `/api/v1`，认证方式 Bearer JWT。

| 模块 | 前缀 | 方法数 | 说明 |
|------|------|-------|------|
| **Auth** | `/auth` | 2 | 登录、注册 |
| **Users** | `/users` | 6 | 用户 CRUD、个人信息 |
| **Projects** | `/projects` | 12 | 项目 CRUD、文件、分支、ZIP |
| **Skills** | `/skills` | 10 | Skill CRUD、导入导出、测试 |
| **Skill Profiles** | `/skill-profiles` | 6 | Profile CRUD、推荐 |
| **Audits** | `/audits` | 10 | 审计任务执行与结果 |
| **Findings** | `/findings` | 14 | 问题全生命周期管理 |
| **Categories** | `/categories` | 5 | 分类树 CRUD |
| **Reports** | `/reports` | 9 | 报告生成、版本、审批 |
| **Dashboard** | `/dashboard` | 8 | 全局/项目/Skill 数据 |
| **Config** | `/config` | 4 | LLM 配置、系统设置 |

### 6.2 Auth

```
POST /auth/login              # 登录 → JWT
POST /auth/register           # 注册
```

### 6.3 Users

```
GET    /users/me               # 当前用户信息
PUT    /users/me               # 更新个人信息
GET    /users                  # 用户列表 (admin)
POST   /users                  # 创建用户 (admin)
PUT    /users/{id}             # 更新用户 (admin)
DELETE /users/{id}             # 删除用户 (admin)
```

### 6.4 Projects

```
POST   /projects                          # 创建项目
GET    /projects                          # 项目列表
GET    /projects/{id}                     # 项目详情
PUT    /projects/{id}                     # 更新项目
DELETE /projects/{id}                     # 软删除
GET    /projects/{id}/files               # 获取文件树
GET    /projects/{id}/branches            # 获取分支列表
POST   /projects/{id}/zip                 # 上传 ZIP
GET    /projects/{id}/dashboard           # 项目级 Dashboard

# Profile 绑定
GET    /projects/{id}/profile             # 获取绑定的 Profile
PUT    /projects/{id}/profile             # 绑定/更新 Profile
POST   /projects/{id}/recommend-profile   # 智能推荐 Profile
```

### 6.5 Skills

```
GET    /skills                            # Skill 列表 (过滤/排序/分页)
GET    /skills/{id}                       # Skill 详情
POST   /skills                            # 创建自定义 Skill
PUT    /skills/{id}                       # 更新 Skill
DELETE /skills/{id}                       # 删除 Skill

# 导入导出
POST   /skills/import                     # 从 YAML/JSON/OpenClaw 导入
GET    /skills/{id}/export                # 导出为 YAML

# OpenClaw 集成
POST   /skills/import-openclaw            # 从 ClawHub URL 或本地路径导入
POST   /skills/{id}/test                  # 测试 Skill (干跑)

GET    /skills/categories                 # Skill 类别列表
```

#### POST /skills/import-openclaw

从 ClawHub 导入（最常见）：

```json
{
  "source": "clawhub",
  "url": "https://github.com/openclaw/skills/tree/main/skills/aviclaw/slither-audit",
  "options": {
    "auto_generate_pipeline": true,
    "execution_mode": "hybrid"
  }
}
```

从粘贴内容导入（支持 SKILL.md + 附带脚本文件）：

```json
{
  "source": "paste",
  "skill_md": "---\nname: my-scanner\ndescription: Scan for vulns\n---\n# My Scanner\n...",
  "files": {
    "scan.py": "#!/usr/bin/env python3\nimport sys\n...",
    "requirements.txt": "requests>=2.28.0\nbandit>=1.7.0"
  }
}
```

响应会包含安全扫描结果和自动生成的管线：

```json
{
  "id": "uuid",
  "slug": "slither-audit",
  "openclaw_skill_type": "type_b",
  "script_files": [
    {"path": "slither-audit.py", "language": "python", "size": 4184}
  ],
  "required_bins": ["pip", "slither"],
  "pipeline_config": {"phases": [...]},
  "security_scan": {"status": "passed", "checks": {"no_exfiltration": true}},
  "import_warnings": ["Requires 'slither' binary in sandbox"]
}
```

> 完整导入/导出/执行细节见 [SKILL_COMPATIBILITY.md](./SKILL_COMPATIBILITY.md)

### 6.6 Skill Profiles

```
GET    /skill-profiles                    # Profile 列表
GET    /skill-profiles/{id}               # Profile 详情
POST   /skill-profiles                    # 创建 Profile
PUT    /skill-profiles/{id}               # 更新 Profile
DELETE /skill-profiles/{id}               # 删除 Profile
POST   /skill-profiles/{id}/clone         # 克隆 Profile
```

### 6.7 Audits

```
POST   /audits                            # 创建审计任务
GET    /audits                            # 审计列表 (过滤/分页)
GET    /audits/{id}                       # 审计详情
POST   /audits/{id}/cancel                # 取消任务
DELETE /audits/{id}                       # 删除任务

# 实时
GET    /audits/{id}/stream                # SSE 实时事件流
GET    /audits/{id}/events                # 事件列表 (分页)
GET    /audits/{id}/progress              # 进度概览

# 结果
GET    /audits/{id}/summary               # 审计摘要
GET    /audits/{id}/skill-executions      # Skill 执行明细
```

#### POST /audits

```json
{
  "project_id": "uuid",
  "name": "Sprint 42 审计",
  "profile_id": "uuid",
  "branch_name": "main",
  "exclude_patterns": ["**/test/**"],
  "verification_level": "poc",
  "llm_config": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "skill_overrides": [
    {
      "skill_slug": "sql-injection",
      "config": { "scan_depth": "deep" }
    }
  ]
}
```

### 6.8 Findings

```
# 查询
GET    /findings                          # 全局 Finding 列表 (跨项目/任务)
GET    /findings/{id}                     # Finding 详情
GET    /findings/stats                    # 全局统计

# 生命周期
PATCH  /findings/{id}/status              # 更新状态
POST   /findings/{id}/confirm             # open → confirmed
POST   /findings/{id}/resolve             # → resolved
POST   /findings/{id}/false-positive      # → false_positive
POST   /findings/{id}/accept-risk         # → accepted_risk
POST   /findings/{id}/reopen             # → open
POST   /findings/{id}/duplicate           # → duplicate (+ reference_id)

# 批量
POST   /findings/bulk-status              # 批量更新状态

# 交互
GET    /findings/{id}/comments            # 获取评论
POST   /findings/{id}/comments            # 发表评论
GET    /findings/{id}/history             # 变更历史

# AI
POST   /findings/{id}/ai-explain          # AI 深度解释
POST   /findings/{id}/ai-fix              # AI 生成修复
```

#### Finding 状态机

```
        ┌─────────┐
        │  open   │
        └────┬────┘
             │
    ┌────────┼────────────┐
    ▼        ▼            ▼
confirmed  false_pos  accepted_risk
    │
    ▼
  fixing
    │
    ▼
 resolved  ←── reopen ──→ open

 ※ 任意状态 → duplicate (需指定原始 finding)
```

### 6.9 Categories

```
GET    /categories                        # 分类树 (含子节点)
GET    /categories/{id}                   # 分类详情
POST   /categories                        # 创建分类 (admin)
PUT    /categories/{id}                   # 更新分类 (admin)
DELETE /categories/{id}                   # 删除分类 (admin)
```

### 6.10 Reports

```
POST   /reports                           # 生成报告
GET    /reports                           # 报告列表
GET    /reports/{id}                      # 报告详情
DELETE /reports/{id}                      # 删除报告
GET    /reports/{id}/download             # 下载文件
POST   /reports/{id}/regenerate           # 重新生成 (新版本)
POST   /reports/{id}/approve              # 审批

# 模板
GET    /report-templates                  # 模板列表
POST   /report-templates                  # 创建模板
PUT    /report-templates/{id}             # 更新模板
```

#### POST /reports

```json
{
  "task_id": "uuid",
  "title": "webapp 安全审计报告",
  "report_type": "full",
  "format": "pdf",
  "template_id": "uuid",
  "options": {
    "include_executive_summary": true,
    "include_code_snippets": true,
    "severity_filter": ["critical", "high", "medium"],
    "language": "zh-CN"
  }
}
```

### 6.11 Dashboard

```
# 全局
GET /dashboard/overview                   # 核心指标卡片
GET /dashboard/trends                     # 趋势折线 (按天/周/月)
GET /dashboard/severity-distribution      # 严重程度分布
GET /dashboard/category-distribution      # 分类分布
GET /dashboard/top-vulnerabilities        # Top 漏洞类型
GET /dashboard/recent-activity            # 最近活动

# Skill 维度
GET /dashboard/skills                     # Skill 效果概览
GET /dashboard/skills/comparison          # Skill 对比
```

#### GET /dashboard/overview 响应

```json
{
  "total_projects": 42,
  "active_audits": 3,
  "total_audits": 256,
  "audits_this_month": 23,
  "total_findings": 1847,
  "open_findings": 342,
  "resolved_findings": 1205,
  "avg_security_score": 72.5,
  "score_trend_pct": 3.2,
  "skills_active": 15
}
```

### 6.12 Config

```
GET /config/me                            # 获取用户配置 (LLM 等)
PUT /config/me                            # 更新用户配置
POST /config/test-llm                     # 测试 LLM 连接
GET /config/llm-providers                 # 可用 LLM 列表
```

---

## 7. Agent 编排引擎

### 7.1 总体架构

```
┌──────────────────────────────────────────────────────────┐
│                   Agent 编排引擎                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │             Skill-Driven Orchestrator               │  │
│  │                                                     │  │
│  │  Input: AuditTask + SkillProfile                   │  │
│  │                                                     │  │
│  │  1. SkillResolver.resolve(profile)                 │  │
│  │     → 依赖解析 → 拓扑排序 → ExecutionPlan          │  │
│  │                                                     │  │
│  │  2. 按 Phase 执行:                                  │  │
│  │     Phase 1 (serial):  Recon Skills                │  │
│  │     Phase 2 (parallel): Detection Skills           │  │
│  │     Phase 3 (serial):  Verification                │  │
│  │                                                     │  │
│  │  3. 每个 Skill → SkillExecutor                     │  │
│  │     → 按 pipeline.yaml 的 phases 逐步执行           │  │
│  │                                                     │  │
│  │  4. FindingAggregator                              │  │
│  │     → 合并、去重、分类、评分                         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │           SkillExecutor (单个 Skill 执行)           │  │
│  │                                                     │  │
│  │  pipeline phase: static_analysis                   │  │
│  │    └─ 调用 ToolRunner (Semgrep/Bandit/Gitleaks)    │  │
│  │                                                     │  │
│  │  pipeline phase: ai_deep_analysis                  │  │
│  │    └─ 构建 Agent (ReAct loop)                      │  │
│  │       ├─ System Prompt = Skill entryPoint.prompt   │  │
│  │       │                + knowledge modules         │  │
│  │       ├─ Tools = file_read + search + RAG          │  │
│  │       └─ Max iterations from pipeline config       │  │
│  │                                                     │  │
│  │  pipeline phase: verification                      │  │
│  │    └─ Docker Sandbox                               │  │
│  │       ├─ test_sql_injection / test_xss / ...       │  │
│  │       └─ run_code (PoC 脚本)                       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │           OpenClaw Skill Adapter                    │  │
│  │                                                     │  │
│  │  对于从 OpenClaw 导入的 Skill:                      │  │
│  │  entryPoint.type=natural → 注入 Agent system prompt │  │
│  │  entryPoint.type=shell   → Sandbox 执行脚本         │  │
│  │  entryPoint.type=ts      → Node Sandbox 执行        │  │
│  │                                                     │  │
│  │  SKILL.md 指令 → 解析为 Agent 步骤                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Agent 内部:                                             │
│  Thought → Action → Observation (ReAct)                 │
│  LLM: OpenAI / Claude / Gemini / DeepSeek / Ollama     │
│  RAG: ChromaDB 代码语义检索                              │
│  Tools: file I/O, Semgrep, Bandit, Sandbox, ...         │
└──────────────────────────────────────────────────────────┘
```

### 7.2 Skill 执行流程（伪代码）

```python
async def run_audit(task: AuditTask):
    profile = load_profile(task.profile_id)
    plan = SkillResolver(profile).resolve()

    for phase in plan.phases:
        if phase.is_parallel:
            await gather(*[run_skill(task, s) for s in phase.skills])
        else:
            for s in phase.skills:
                await run_skill(task, s)

    await aggregate_findings(task)
    await update_project_score(task.project_id)
    task.status = "completed"

async def run_skill(task: AuditTask, skill_conf: SkillConfig):
    skill = load_skill(skill_conf.slug)
    execution = create_skill_execution(task, skill)

    pipeline = skill.pipeline_config
    for phase in pipeline["phases"]:
        if not evaluate_condition(phase.get("when"), task):
            continue

        if phase["name"] == "static_analysis":
            results = await run_static_tools(task, phase["steps"])
            save_findings(execution, results)

        elif phase["name"] == "ai_deep_analysis":
            agent = build_agent(
                skill=skill,
                agent_config=phase["agent"],
                project_files=task.project_files,
            )
            results = await agent.run()
            save_findings(execution, results)

        elif phase["name"] == "verification":
            await verify_findings(execution, phase["sandbox"])

    execution.status = "completed"
```

### 7.3 Agent 与 LLM

| 特性 | 实现 |
|------|------|
| LLM 抽象 | LiteLLM 统一接口，支持 OpenAI/Claude/Gemini/DeepSeek/Ollama |
| ReAct 循环 | LangGraph 状态机或自研 executor |
| 流式输出 | SSE (sse-starlette) 将 thinking / tool_call / finding 实时推送到前端 |
| RAG | ChromaDB + Tree-sitter 代码分块 + 语义检索 |
| Token 管理 | 按 Skill 设置 token budget，自动压缩历史 |
| 知识注入 | Skill 的 knowledge/ 目录 + OpenClaw SKILL.md 指令 |

### 7.4 工具清单

| 工具 | 作用 | 使用场景 |
|------|------|---------|
| `list_files` | 列出目录 | Recon |
| `read_file` | 读取文件 | All |
| `search_code` | 关键字搜索 | All |
| `rag_query` | 语义检索 | AI Analysis |
| `semgrep_scan` | Semgrep 扫描 | Static |
| `bandit_scan` | Bandit 扫描 | Static (Python) |
| `gitleaks_scan` | 密钥扫描 | Static |
| `npm_audit` | npm 依赖审计 | Static (JS) |
| `safety_scan` | Python 依赖审计 | Static (Python) |
| `sandbox_exec` | 沙箱执行命令 | Verification |
| `sandbox_http` | 沙箱 HTTP 请求 | Verification |
| `run_code` | 执行 PoC 代码 | Verification |

---

## 8. 审计问题分类体系

### 8.1 分类树

```
ROOT
├── INJ  — 注入 (Injection)
│   ├── INJ-SQL   SQL 注入           CWE-89    A03:2021
│   ├── INJ-XSS   跨站脚本           CWE-79    A03:2021
│   ├── INJ-CMD   命令注入           CWE-78    A03:2021
│   ├── INJ-XXE   XML 外部实体       CWE-611   A05:2021
│   ├── INJ-LDAP  LDAP 注入          CWE-90    A03:2021
│   └── INJ-SSTI  模板注入           CWE-1336  A03:2021
│
├── AUTH — 认证与授权
│   ├── AUTH-BYP   认证绕过           CWE-287   A07:2021
│   ├── AUTH-WEAK  弱认证             CWE-306   A07:2021
│   ├── AUTH-SESS  会话管理           CWE-384   A07:2021
│   ├── AUTH-IDOR  IDOR              CWE-639   A01:2021
│   └── AUTH-PRIV  权限提升           CWE-269   A01:2021
│
├── CRYPTO — 加密
│   ├── CRYPTO-ALG   弱算法           CWE-327   A02:2021
│   ├── CRYPTO-KEY   硬编码密钥       CWE-798   A07:2021
│   └── CRYPTO-RAND  不安全随机数     CWE-330   A02:2021
│
├── DATA — 数据安全
│   ├── DATA-LEAK  信息泄漏           CWE-200   A01:2021
│   ├── DATA-LOG   日志敏感数据       CWE-532   A09:2021
│   └── DATA-STORE 不安全存储         CWE-922   A04:2021
│
├── FILE — 文件安全
│   ├── FILE-TRAV  路径穿越           CWE-22    A01:2021
│   ├── FILE-UPLOAD 文件上传          CWE-434   A04:2021
│   └── FILE-INCL  文件包含           CWE-98    A03:2021
│
├── NET — 网络
│   ├── NET-SSRF   SSRF              CWE-918   A10:2021
│   ├── NET-CORS   CORS 误配         CWE-942   A05:2021
│   └── NET-REDIR  开放重定向         CWE-601   A01:2021
│
├── LOGIC — 业务逻辑
│   ├── LOGIC-RACE 竞态条件           CWE-362   A04:2021
│   └── LOGIC-FLOW 流程绕过           CWE-840   A04:2021
│
├── SUPPLY — 供应链
│   ├── SUPPLY-DEP  已知漏洞依赖      CWE-1104  A06:2021
│   └── SUPPLY-LIC  许可证风险        —         —
│
├── CONFIG — 配置
│   ├── CONFIG-DEBUG 调试模式          CWE-489   A05:2021
│   ├── CONFIG-DEFAULT 默认配置       CWE-1188  A05:2021
│   └── CONFIG-HEADER 安全头缺失      CWE-693   A05:2021
│
└── DESER — 反序列化
    └── DESER-OBJ  不安全反序列化     CWE-502   A08:2021
```

### 8.2 种子数据

系统初始化时自动加载上述分类树。每个节点包含：

- `code`：唯一编码
- `name` / `name_en`：中英文名称
- `cwe_id`：关联 CWE 编号
- `owasp_id`：关联 OWASP Top 10 编号
- `remediation`：Markdown 格式的修复指南

---

## 9. 报告管理系统

### 9.1 报告类型

| 类型 | 目标受众 | 内容 |
|------|---------|------|
| **Full** | 安全工程师 | 所有 Finding 详情、代码片段、修复建议、数据流 |
| **Executive** | 管理层 | 安全评分、风险概况、趋势、Top 问题（无代码） |
| **Technical** | 渗透测试员 | PoC 详情、利用路径、CVSS 评分 |
| **Compliance** | 合规审计 | OWASP/CWE 映射、合规差距分析 |
| **Delta** | 开发团队 | 两次审计之间的新增/修复/未修复对比 |

### 9.2 报告生成流程

```
选择模板 → 收集数据(Task + Findings + Stats)
         → AI 生成 Executive Summary (LLM)
         → Jinja2 模板渲染
         → 输出 PDF / Markdown / HTML / JSON
         → 存储文件 + 创建 Report 记录
```

### 9.3 报告版本管理

- 每次 `regenerate` 生成新版本（version + 1）
- 保留所有历史版本
- 支持两个版本之间的 diff 对比

### 9.4 审批流程

```
Draft → Review → Approved → Published
  ↑                 │
  └─── Rejected ────┘
```

---

## 10. Dashboard 数据体系

### 10.1 全局 Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  VulnHunter Dashboard                     [本月 ▼] [刷新]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐  │
│  │  项目      │ │  审计      │ │  待处理    │ │  安全评分  │  │
│  │  42       │ │  256      │ │  342      │ │  72.5     │  │
│  │  +3 本月  │ │  23 本月  │ │  ↓ 5.1%  │ │  ↑ 3.2%  │  │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘  │
│                                                             │
│  ┌──────────────────────────┐ ┌────────────────────────┐   │
│  │ 发现趋势 (Area Chart)    │ │ 严重程度 (Donut)       │   │
│  │                          │ │                        │   │
│  │    新发现 ── 已修复       │ │  ● Critical  45       │   │
│  │   /\    /\               │ │  ● High     128       │   │
│  │  /  \  /  \──            │ │  ● Medium   356       │   │
│  │ /    \/                  │ │  ● Low      813       │   │
│  │ Jan Feb Mar              │ │  ○ Info     505       │   │
│  └──────────────────────────┘ └────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────┐ ┌────────────────────────┐   │
│  │ Top 漏洞类型 (Bar)       │ │ 最近审计               │   │
│  │                          │ │                        │   │
│  │ SQL 注入    ████████ 89  │ │ webapp    ✓ 12 issues │   │
│  │ XSS        ███████  76  │ │ api-srv   ✓  8 issues │   │
│  │ 认证绕过    █████   45  │ │ mobile    ● running   │   │
│  │ SSRF       ████    34  │ │ admin     ✓  3 issues │   │
│  │ 路径穿越    ███     28  │ │                        │   │
│  └──────────────────────────┘ └────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Skill 效果 (Table)                                   │   │
│  │ ┌───────────────┬──────┬──────┬──────┬───────────┐  │   │
│  │ │ Skill         │ 使用 │ 发现 │ 确认 │ 有效率     │  │   │
│  │ ├───────────────┼──────┼──────┼──────┼───────────┤  │   │
│  │ │ 依赖审计      │ 201  │ 156  │ 144  │ 92.3%     │  │   │
│  │ │ SQL 注入      │ 128  │  89  │  76  │ 85.4%     │  │   │
│  │ │ 密钥泄漏      │ 195  │ 112  │ 108  │ 96.4%     │  │   │
│  │ │ XSS          │ 115  │  76  │  60  │ 78.9%     │  │   │
│  │ └───────────────┴──────┴──────┴──────┴───────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 项目级 Dashboard

```
┌─────────────────────────────────────────────────────────┐
│  Project: webapp-frontend > Dashboard                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  安全评分                                                │
│  ┌──────────────────────────────────────┐               │
│  │           78.5 / 100                 │               │
│  │     ████████████████████░░░░░░       │               │
│  │     ↑ 5.2 vs 上次审计                │               │
│  └──────────────────────────────────────┘               │
│                                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ C: 3 │ │ H: 8 │ │ M:15 │ │ L:24 │ │ I:12 │        │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
│                                                         │
│  ┌────────────────────┐ ┌──────────────────────┐       │
│  │ Finding 状态        │ │ Skill 覆盖           │       │
│  │ ● Open:      12   │ │ ☑ SQL 注入    3 找到  │       │
│  │ ● Confirmed:  5   │ │ ☑ XSS        2 找到  │       │
│  │ ● Fixing:     3   │ │ ☑ CSRF       0 找到  │       │
│  │ ✓ Resolved:  42   │ │ ☑ 依赖审计    8 找到  │       │
│  └────────────────────┘ │ ☐ SSRF       未启用  │       │
│                         └──────────────────────┘       │
│                                                         │
│  审计历史 (Timeline Chart)                               │
│  ┌──────────────────────────────────────────────┐      │
│  │  #5  3/12  Score: 78.5  12 findings         │      │
│  │  #4  2/28  Score: 73.3  18 findings         │      │
│  │  #3  2/15  Score: 68.1  25 findings         │      │
│  │  #2  2/01  Score: 62.0  32 findings         │      │
│  │  (安全评分持续提升 ↗)                         │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### 10.3 缓存策略

| 数据 | 缓存键 | TTL | 更新触发 |
|------|--------|-----|---------|
| 全局 overview | `dash:overview:{user}` | 5 min | 审计完成 |
| 趋势数据 | `dash:trends:{range}` | 1 hr | 定时任务 |
| 严重程度分布 | `dash:severity` | 5 min | Finding 变更 |
| 项目 dashboard | `dash:project:{id}` | 5 min | 审计完成 |
| Skill 统计 | `dash:skills` | 1 hr | 审计完成 |

---

## 11. 前端页面与交互设计

### 11.1 路由结构

```
/login                          登录
/register                       注册

/ (MainLayout: Sidebar + Content)
├── /dashboard                  全局 Dashboard (默认首页)
│
├── /projects                   项目列表
│   └── /projects/:id           项目详情 (Tabs)
│       ├── overview            概览 + 项目 Dashboard
│       ├── audits              审计任务列表
│       ├── findings            项目 Finding 列表
│       ├── reports             项目报告列表
│       ├── skills              Skill Profile 配置
│       └── settings            项目设置
│
├── /audits                     全局审计列表
│   └── /audits/:id             审计详情 (实时流 + 结果)
│
├── /findings                   全局 Finding 管理
│
├── /reports                    全局报告管理
│
├── /skills                     Skill 管理
│   └── /skills/:id             Skill 详情
│
├── /skill-profiles             Skill Profile 管理
│
├── /admin                      管理后台
│   ├── users                   用户管理
│   ├── categories              分类管理
│   ├── report-templates        报告模板
│   └── system                  系统配置
│
└── /account                    个人设置
```

### 11.2 核心页面清单

| 页面 | 路由 | 关键组件 | 数据源 API |
|------|------|---------|-----------|
| **Dashboard** | `/dashboard` | OverviewCards, TrendAreaChart, SeverityDonut, TopVulnBar, RecentAudits, SkillStatsTable | `/dashboard/*` |
| **项目列表** | `/projects` | ProjectGrid, CreateProjectDialog, ImportRepoDialog, UploadZipDialog | `GET /projects` |
| **项目详情** | `/projects/:id` | TabView (Overview/Audits/Findings/Reports/Skills/Settings) | `GET /projects/:id/*` |
| **审计列表** | `/audits` | AuditTable, FilterBar, StatusBadge | `GET /audits` |
| **审计详情** | `/audits/:id` | LiveStreamPanel (SSE), SkillExecutionCards, FindingList, AgentTree | `GET /audits/:id/stream` |
| **Finding 列表** | `/findings` | FindingTable, MultiFilter, BulkActionBar, SeverityBadge, StatusBadge | `GET /findings` |
| **Finding 详情** | (Side Panel) | CodeSnippet, AIExplanation, DataflowView, CommentThread, HistoryTimeline, ActionButtons | `GET /findings/:id` |
| **报告列表** | `/reports` | ReportGrid, GenerateReportDialog, VersionHistory | `GET /reports` |
| **Skill 管理** | `/skills` | SkillGrid, SkillCard, ImportSkillDialog, SkillFilter | `GET /skills` |
| **Skill 详情** | `/skills/:id` | PipelineVisualizer, ParameterEditor, UsageStats, OpenClawBadge | `GET /skills/:id` |
| **Skill Profile** | `/skill-profiles` | ProfileEditor, SkillDragList, VerificationConfig | `GET /skill-profiles` |
| **管理后台** | `/admin` | UserTable, CategoryTree, TemplateEditor, SystemForm | Various admin APIs |

### 11.3 关键交互流程

#### 创建审计任务

```
[开始审计] 按钮
     │
     ▼
┌──────────────────────────────────┐
│  创建审计任务                     │
│                                  │
│  项目: [webapp-frontend ▼]       │
│  分支: [main ▼]                  │
│                                  │
│  Skill Profile:                  │
│  [● Python Web 全栈审计  ]       │
│  [○ 快速扫描             ]       │
│  [○ 自定义               ]       │
│  [★ 智能推荐             ]  ← 调用推荐 API
│                                  │
│  启用的 Skills:                   │
│  ☑ 代码侦查        [默认]        │
│  ☑ 依赖审计        [默认]        │
│  ☑ 密钥泄漏        [默认]        │
│  ☑ SQL 注入        [配置 ▼]      │
│    scan_depth: [deep ▼]          │
│  ☑ XSS 检测       [默认]        │
│  ☐ SSRF 检测      [未启用]      │
│                                  │
│  验证级别: [● 无 ○ 基础 ○ PoC]   │
│                                  │
│  排除: [**/test/** ]             │
│                                  │
│  LLM: [GPT-4o ▼]                │
│                                  │
│           [取消]  [开始审计]      │
└──────────────────────────────────┘
```

#### 审计实时流页面

```
┌─────────────────────────────────────────────────────────┐
│  审计: Sprint 42 审计                     ● Running      │
│  项目: webapp │ 分支: main │ Profile: Python Web 全栈    │
├───────────────────────────────────┬─────────────────────┤
│  实时日志                         │ Skill 执行          │
│                                   │                     │
│  ▶ 代码侦查 ✓ 完成 (12s)         │ ☑ code-recon    ✓  │
│    发现 342 个文件, Python 项目    │ ☑ dependency    ✓  │
│    Framework: FastAPI             │ ☑ secret-detect ✓  │
│                                   │ ● sql-injection ◔  │
│  ▶ 依赖审计 ✓ 完成 (8s)          │ ○ xss-detection    │
│    npm audit: 3 issues            │ ○ csrf-detection   │
│    safety: 2 issues               │                     │
│                                   │                     │
│  ▶ SQL 注入检测 ◔ 进行中          │─────────────────────│
│    💭 分析 app/models/user.py...  │ 进度: 45%          │
│    🔧 semgrep_scan ✓ (3 results)  │ 已发现: 8          │
│    💭 检查 f-string SQL 拼接...    │ Tokens: 12,340     │
│    🚨 [Critical] SQL 注入         │ 耗时: 2m 34s       │
│       app/models/user.py:45       │                     │
│                                   │                     │
│  ▶ ...                            │                     │
├───────────────────────────────────┴─────────────────────┤
│  已发现问题                                              │
│  🔴 SQL 注入: user_id 未过滤    app/models/user.py:45   │
│  🔴 SQL 注入: order_by 拼接     app/api/orders.py:89    │
│  🟠 存储型 XSS: comment 字段   app/handlers/comment.py  │
│  🟡 弱密码哈希: MD5            app/auth/password.py:12  │
│  ...                                                     │
└─────────────────────────────────────────────────────────┘
```

### 11.4 设计规范

| 项目 | 选择 |
|------|------|
| UI 框架 | React 18 + TypeScript 5 |
| 组件库 | shadcn/ui + Radix UI |
| 样式 | TailwindCSS |
| 图表 | Recharts |
| 图标 | Lucide React |
| 状态管理 | React Context + 页面级 useState |
| 路由 | React Router v7 |
| HTTP | Axios (interceptors for JWT) |
| 实时 | SSE (EventSource) |
| 国际化 | i18next (中/英) |
| 构建 | Vite 5 |
| 主题 | 暗色为主 + 亮色切换 |
| Toast | Sonner |

---

## 12. 安全与权限

### 12.1 认证

- JWT (access_token 30min + refresh_token 7d)
- bcrypt 密码哈希
- CORS 白名单

### 12.2 授权 (RBAC)

```
Admin    → 全部权限
Auditor  → 项目 CRUD、审计执行、Finding 管理、报告生成、Skill 管理
Developer → 查看项目、查看 Finding、添加评论、标记已修复
Viewer   → 只读 Dashboard + 报告
```

### 12.3 沙箱安全

- PoC 验证在 Docker 容器中执行
- 网络隔离（无外部访问）
- CPU/内存/时间限制
- 执行结果清理

---

## 13. 技术栈与基础设施

### 13.1 完整技术栈

| 层 | 技术 |
|----|------|
| **前端** | React 18, TypeScript 5, Vite 5, TailwindCSS, shadcn/ui, Recharts, i18next |
| **后端** | Python 3.11+, FastAPI, Uvicorn, Pydantic v2 |
| **ORM** | SQLAlchemy 2 (async) + Alembic |
| **数据库** | PostgreSQL 15 |
| **缓存** | Redis 7 |
| **LLM** | LiteLLM (OpenAI/Claude/Gemini/DeepSeek/Ollama) |
| **Agent** | LangChain + LangGraph (或自研 ReAct executor) |
| **RAG** | ChromaDB + Tree-sitter 代码分块 |
| **安全工具** | Semgrep, Bandit, Gitleaks, TruffleHog, npm-audit, Safety |
| **沙箱** | Docker (自定义镜像) |
| **报告** | Jinja2 + WeasyPrint (PDF) |
| **SSE** | sse-starlette |

### 13.2 目录结构（全新）

```
vulnhunter/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── router.py
│   │   │       └── endpoints/
│   │   │           ├── auth.py
│   │   │           ├── users.py
│   │   │           ├── projects.py
│   │   │           ├── skills.py
│   │   │           ├── skill_profiles.py
│   │   │           ├── audits.py
│   │   │           ├── findings.py
│   │   │           ├── categories.py
│   │   │           ├── reports.py
│   │   │           ├── dashboard.py
│   │   │           └── config.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── project.py
│   │   │   ├── skill.py
│   │   │   ├── skill_profile.py
│   │   │   ├── audit_task.py
│   │   │   ├── finding.py
│   │   │   ├── category.py
│   │   │   ├── report.py
│   │   │   └── base.py
│   │   ├── schemas/
│   │   │   └── (mirrors models/)
│   │   ├── services/
│   │   │   ├── skill_engine/
│   │   │   │   ├── registry.py
│   │   │   │   ├── resolver.py
│   │   │   │   ├── executor.py
│   │   │   │   ├── recommender.py
│   │   │   │   └── openclaw_importer.py
│   │   │   ├── audit_engine/
│   │   │   │   ├── orchestrator.py
│   │   │   │   ├── agent_builder.py
│   │   │   │   └── event_manager.py
│   │   │   ├── agent/
│   │   │   │   ├── base.py
│   │   │   │   ├── recon.py
│   │   │   │   ├── analysis.py
│   │   │   │   └── verification.py
│   │   │   ├── tools/
│   │   │   │   ├── file_tool.py
│   │   │   │   ├── semgrep_tool.py
│   │   │   │   ├── sandbox_tool.py
│   │   │   │   └── rag_tool.py
│   │   │   ├── llm/
│   │   │   │   ├── service.py
│   │   │   │   └── adapters/
│   │   │   ├── rag/
│   │   │   │   ├── indexer.py
│   │   │   │   ├── retriever.py
│   │   │   │   └── splitter.py
│   │   │   ├── report_engine/
│   │   │   │   ├── generator.py
│   │   │   │   └── renderers/
│   │   │   └── dashboard/
│   │   │       └── aggregator.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── deps.py
│   │   └── db/
│   │       ├── session.py
│   │       └── init_db.py
│   ├── alembic/
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx
│   │   │   ├── routes.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard/
│   │   │   ├── Projects/
│   │   │   ├── ProjectDetail/
│   │   │   ├── Audits/
│   │   │   ├── AuditDetail/
│   │   │   ├── Findings/
│   │   │   ├── Reports/
│   │   │   ├── Skills/
│   │   │   ├── SkillProfiles/
│   │   │   ├── Admin/
│   │   │   └── Account/
│   │   ├── components/
│   │   │   ├── ui/           # shadcn
│   │   │   ├── dashboard/
│   │   │   ├── findings/
│   │   │   ├── skills/
│   │   │   ├── audit/
│   │   │   ├── reports/
│   │   │   └── layout/
│   │   ├── shared/
│   │   │   ├── api/
│   │   │   ├── types/
│   │   │   ├── hooks/
│   │   │   └── context/
│   │   └── assets/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── Dockerfile
│
├── skills/
│   ├── builtin/
│   │   ├── code-recon/
│   │   ├── sql-injection/
│   │   ├── xss-detection/
│   │   └── ...
│   └── imported/
│
├── docker/
│   └── sandbox/
│       └── Dockerfile
│
├── docker-compose.yml
├── docker-compose.prod.yml
└── README.md
```

---

## 14. 部署方案

### 14.1 docker-compose.yml

```yaml
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: vulnhunter
      POSTGRES_USER: vulnhunter
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  chromadb:
    image: chromadb/chroma:latest
    volumes:
      - chromadata:/chroma/chroma
    ports:
      - "8100:8000"

  sandbox:
    build: ./docker/sandbox
    privileged: true
    ports:
      - "8080:8080"

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    depends_on:
      - db
      - redis
      - chromadb
    environment:
      DATABASE_URL: postgresql+asyncpg://vulnhunter:${DB_PASSWORD}@db/vulnhunter
      REDIS_URL: redis://redis:6379
      CHROMA_HOST: chromadb
      CHROMA_PORT: 8000
      SANDBOX_URL: http://sandbox:8080
      JWT_SECRET: ${JWT_SECRET}

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  pgdata:
  chromadata:
```

### 14.2 环境变量

```env
# Database
DATABASE_URL=postgresql+asyncpg://vulnhunter:password@db/vulnhunter

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=your-secret-key
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=30

# LLM (用户也可在 UI 中配置)
DEFAULT_LLM_PROVIDER=openai
DEFAULT_LLM_MODEL=gpt-4o
OPENAI_API_KEY=sk-...

# Sandbox
SANDBOX_URL=http://sandbox:8080

# ChromaDB
CHROMA_HOST=chromadb
CHROMA_PORT=8000
```

---

*本文档为 VulnHunter 项目技术规格说明书初稿。*  
*Copyright (c) 2026 VulnHunter Contributors. AGPL-3.0.*
