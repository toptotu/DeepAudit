# VulnHunter × OpenClaw Skill 兼容性规格

> **Version**: 0.3.0 — 基于 ClawHub 22,614 个 Skill 的实际分析  
> **Date**: 2026-03-13  
> **Related**: [SPEC.md](./SPEC.md)

---

## 1. OpenClaw Skill 标准目录结构

**这是 OpenClaw Skill 的事实标准**，VulnHunter 必须完整兼容此结构：

```
my-skill/
├── SKILL.md          # 必选：指令 + 元数据 (YAML frontmatter)
├── scripts/          # 可选：可执行脚本 (Python / Shell / JS / TS / ...)
├── references/       # 可选：参考文档、知识库 (Markdown)
└── assets/           # 可选：模板、配置样例、资源文件
```

附加的可选文件（不属于标准目录，但大量存在）：

```
my-skill/
├── _meta.json          # ClawHub 注册元数据 (owner, slug, version)
├── package.json        # Node.js 依赖声明
├── requirements.txt    # Python 依赖声明
├── *.py / *.sh / *.js  # 根目录下的脚本（部分 Skill 不放在 scripts/ 里）
└── README.md           # 补充说明
```

### ClawHub 生态数据（基于 22,614 个 Skill 分析）

| 目录 / 文件 | 使用数量 | 占比 |
|-------------|---------|------|
| `SKILL.md` | 22,614 | 100% |
| `scripts/` 目录 | 7,282 | 32.2% |
| `references/` 目录 | 4,551 | 20.1% |
| `assets/` 目录 | 614 | 2.7% |
| 包含 `.py` 脚本 | 6,130 | 27.1% |
| 包含 `.sh` 脚本 | 3,795 | 16.8% |
| 包含 `.js` / `.ts` 脚本 | 3,266 | 14.4% |
| `package.json` | 2,207 | 9.8% |
| `requirements.txt` | 624 | 2.8% |
| `skill.yaml` manifest | 214 | **< 1%** |

---

## 2. Skill 的四个组成部分

### 2.1 SKILL.md — 指令核心（必选）

每个 Skill 的唯一必选文件。包含 YAML frontmatter（元数据）和 Markdown body（Agent 指令）。

**Frontmatter**:

```yaml
---
name: skill-security-audit
description: >
  Audit codebases for security issues. Use when scanning for vulnerabilities,
  detecting hardcoded secrets, or reviewing OWASP top 10.
metadata:
  clawdbot:
    emoji: "🔒"
    requires:
      anyBins: ["npm", "pip", "git", "semgrep"]
    os: ["linux", "darwin"]
tags: [security, vulnerability, owasp]
---
```

**Body — 三种内容形态**:

| 内容类型 | 说明 | VulnHunter 处理方式 |
|---------|------|-------------------|
| **自然语言指令** | 工作流步骤、判断逻辑、输出要求 | 注入 Agent system prompt |
| **嵌入代码块** | ` ```bash ` / ` ```python ` 等 | 提取后在 Sandbox 执行 |
| **脚本调用指令** | `python3 {SKILL_DIR}/scripts/scan.py` | 解析 `{SKILL_DIR}` → 调用 `scripts/` |

关键约定：SKILL.md 中使用 **`{SKILL_DIR}`** 作为占位符引用 Skill 自身目录。

### 2.2 scripts/ — 可执行脚本（可选）

存放独立的可执行脚本文件，被 SKILL.md 中的指令引用。

```
scripts/
├── scan_skill.py        # Python 审计扫描器
├── install.sh           # 安装/环境准备脚本
├── audit.js             # Node.js 审计工具
└── helpers.py           # 辅助函数
```

**典型调用方式**（在 SKILL.md 中）:

```markdown
### Step 2: Run Automated Scanner

```bash
python3 {SKILL_DIR}/scripts/scan_skill.py <target-directory>
```

或带参数:

```bash
python3 {SKILL_DIR}/scripts/scan_skill.py --slug <skill-slug> --version <version>
```
```

**真实案例**: `tjefferson/skill-security-audit-2`
- `scripts/scan_skill.py` — 585 行 Python，完整的安全扫描器
  - 定义 80+ 恶意模式正则
  - 扫描文件内容 → 输出 JSON 报告
  - 支持从 ClawHub API 下载并扫描
  - 命令行参数：`--slug`, `--version`, 目标目录

### 2.3 references/ — 参考文档（可选）

存放 Agent 可读的参考文档和知识库，用于增强 Agent 的分析能力。

```
references/
├── threat_knowledge_base.md   # 安全威胁知识库
├── owasp-top10.md             # OWASP Top 10 参考
├── ERC-8004.md                # 规范文档
└── macos-permissions.md       # 平台相关文档
```

**VulnHunter 处理方式**: 将 references/ 下的 Markdown 文件索引到 RAG 知识库，在 Agent 分析时作为上下文检索源。

### 2.4 assets/ — 资源文件（可选）

存放模板、配置样例、数据文件等资源。

```
assets/
├── config.example.yaml   # 配置模板
├── report-template.html  # 报告模板
└── rules.json            # 自定义规则数据
```

**VulnHunter 处理方式**: 原样保留，脚本执行时可通过 `{SKILL_DIR}/assets/` 路径访问。

---

## 3. VulnHunter 对 Skill 各部分的兼容处理

### 3.1 整体架构

```
OpenClaw Skill 目录（来源：ClawHub / GitHub / 本地 / 粘贴）
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                   Skill Loader                          │
│                                                        │
│  1. 检测目录结构                                        │
│     ├── SKILL.md 存在?         → 必须                  │
│     ├── scripts/ 存在?         → 标记 has_scripts       │
│     ├── references/ 存在?      → 标记 has_references    │
│     ├── assets/ 存在?          → 标记 has_assets        │
│     ├── 根目录 *.py / *.sh?    → 收集为 root_scripts   │
│     ├── package.json?          → 记录 node_deps        │
│     └── requirements.txt?      → 记录 python_deps      │
│                                                        │
│  2. 解析 SKILL.md                                      │
│     ├── frontmatter → name, description, metadata      │
│     ├── 提取嵌入代码块 → embedded_scripts[]             │
│     ├── 提取 {SKILL_DIR}/scripts/* 调用 → script_calls[] │
│     └── 提取工作流步骤 → workflow_steps[]               │
│                                                        │
│  3. 清点 scripts/ 目录                                  │
│     ├── 列出所有脚本文件及语言                           │
│     └── 识别入口脚本 (main script)                      │
│                                                        │
│  4. 清点 references/ 目录                               │
│     └── 列出所有 .md 文件 → 待索引到 RAG               │
│                                                        │
│  5. 清点 assets/ 目录                                   │
│     └── 列出资源文件 → 运行时可访问                     │
│                                                        │
│  6. 安全扫描 (全部文件)                                 │
│     └── 30+ 恶意模式检测                               │
│                                                        │
│  7. 自动生成 pipeline_config                            │
│                                                        │
│  8. 推断分类 (category / CWE / OWASP)                  │
│                                                        │
│  9. 存入数据库 + 复制文件到 data/skills/                │
└────────────────────────────────────────────────────────┘
```

### 3.2 文件存储

导入后的 Skill 完整保留原始目录结构：

```
data/skills/{openclaw_author}/{skill_slug}/
├── SKILL.md                       # 原样保留
├── _meta.json                     # 原样保留
├── scripts/                       # 原样保留
│   └── scan_skill.py
├── references/                    # 原样保留
│   └── threat_knowledge_base.md
├── assets/                        # 原样保留
│   └── config.example.yaml
├── package.json                   # 原样保留
├── requirements.txt               # 原样保留
└── .vulnhunter/                   # VulnHunter 自动生成
    ├── pipeline.yaml              # 自动生成的执行管线
    ├── metadata.yaml              # 推断的分类信息
    └── security_report.json       # 安全扫描报告
```

### 3.3 数据库 Skill 表

```sql
CREATE TABLE skills (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                  VARCHAR(120) NOT NULL UNIQUE,
    name                  VARCHAR(200) NOT NULL,
    version               VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    description           TEXT,

    -- OpenClaw 原始数据（完整保留）
    openclaw_skill_md     TEXT,            -- SKILL.md 完整内容
    openclaw_meta_json    JSONB,           -- _meta.json 内容
    openclaw_source       VARCHAR(20),     -- builtin | clawhub | github | local
    openclaw_author       VARCHAR(100),

    -- 目录结构
    has_scripts           BOOLEAN DEFAULT false,
    has_references        BOOLEAN DEFAULT false,
    has_assets            BOOLEAN DEFAULT false,
    skill_dir_path        VARCHAR(500),    -- 文件系统中的完整路径

    -- scripts/ 下的脚本文件
    script_files          JSONB DEFAULT '[]',
    -- [{path:"scripts/scan.py", language:"python", size:4184, is_entry:true}]

    -- SKILL.md 中嵌入的代码块
    embedded_scripts      JSONB DEFAULT '[]',
    -- [{language:"bash", code:"...", context:"Step 1: Scan", is_executable:true}]

    -- references/ 下的文档
    reference_files       JSONB DEFAULT '[]',
    -- [{path:"references/threat_kb.md", size:5200, indexed:true}]

    -- assets/ 下的资源
    asset_files           JSONB DEFAULT '[]',
    -- [{path:"assets/config.yaml", size:1024}]

    -- 运行时依赖
    required_bins         JSONB DEFAULT '[]',   -- ["semgrep","pip","npm"]
    supported_os          JSONB DEFAULT '[]',   -- ["linux","darwin"]
    python_deps           TEXT,                  -- requirements.txt 内容
    node_deps             JSONB,                 -- package.json 内容

    -- VulnHunter 管线 (自动生成 / 手动配置)
    pipeline_config       JSONB NOT NULL DEFAULT '{}',

    -- 分类
    category              VARCHAR(50) NOT NULL,
    cwe_ids               JSONB DEFAULT '[]',
    owasp_ids             JSONB DEFAULT '[]',
    tags                  JSONB DEFAULT '[]',
    supported_languages   JSONB DEFAULT '[]',
    supported_frameworks  JSONB DEFAULT '[]',
    severity_range        JSONB DEFAULT '[]',
    icon                  VARCHAR(50),
    color                 VARCHAR(7),

    -- 可配置参数
    parameters_schema     JSONB DEFAULT '[]',
    dependencies          JSONB DEFAULT '[]',

    -- 状态 / 统计
    status                VARCHAR(20) NOT NULL DEFAULT 'active',
    is_builtin            BOOLEAN DEFAULT false,
    usage_count           INTEGER DEFAULT 0,
    avg_exec_time_ms      REAL DEFAULT 0,
    avg_findings          REAL DEFAULT 0,
    author_id             UUID REFERENCES users(id),

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 3. SKILL.md Frontmatter 字段规范

```yaml
---
# 必填
name: skill-slug                    # 小写字母 + 连字符
description: "描述文字"               # 用于搜索匹配和 Agent 路由

# 可选
metadata:
  clawdbot:
    emoji: "🔒"                      # 显示图标
    requires:
      anyBins: ["npm", "pip", "git"] # 运行时必须存在的 CLI 工具
    os: ["linux", "darwin", "win32"] # 支持的操作系统

# 可选 — 部分 Skill 使用这些字段
auto_trigger: false                  # 是否自动触发
tags: [security, vulnerability]      # 标签
homepage: "https://..."              # 项目主页
repository: "https://..."           # 源码仓库

# 可选 — 极少 Skill 使用
env:
  required: []                       # 必须的环境变量
  optional: []                       # 可选的环境变量
---
```

---

## 4. VulnHunter 如何兼容这两种 Skill

### 4.1 整体架构

```
                 OpenClaw Skill（来源）
                 ├── ClawHub 仓库
                 ├── GitHub URL
                 ├── 本地目录
                 └── 粘贴内容
                        │
                        ▼
          ┌──────────────────────────────┐
          │     OpenClaw Skill Loader     │
          │                              │
          │  1. 检测 Skill 类型           │
          │     └── 有 SKILL.md?         │
          │     └── 有 script 文件?       │
          │     └── 有 skill.yaml?       │
          │                              │
          │  2. 解析 SKILL.md frontmatter │
          │     └── name, description    │
          │     └── metadata.requires    │
          │     └── tags, env            │
          │                              │
          │  3. 解析 SKILL.md body        │
          │     └── 提取嵌入的代码块      │
          │     └── 提取工作流步骤        │
          │     └── 提取使用方法          │
          │                              │
          │  4. 扫描脚本文件              │
          │     └── .py / .sh / .js / .ts│
          │     └── package.json         │
          │     └── requirements.txt     │
          │                              │
          │  5. 安全扫描                  │
          │     └── 检查恶意模式          │
          │     └── 检查权限范围          │
          └──────────────┬───────────────┘
                         │
          ┌──────────────▼───────────────┐
          │   Pipeline Generator          │
          │                              │
          │  根据 Skill 内容自动生成       │
          │  VulnHunter pipeline_config   │
          │                              │
          │  Type A (纯 Markdown):        │
          │   → ai_instruction phase     │
          │   → embedded_scripts phase   │
          │                              │
          │  Type B (有脚本文件):          │
          │   → dependency_install phase │
          │   → script_execution phase   │
          │   → output_parsing phase     │
          └──────────────┬───────────────┘
                         │
          ┌──────────────▼───────────────┐
          │   VulnHunter Skill 记录       │
          │                              │
          │  slug, name, description      │
          │  category (推断)              │
          │  openclaw_manifest (原始)      │
          │  openclaw_instructions (原始)  │
          │  pipeline_config (生成)        │
          │  script_files (复制)           │
          │  required_bins (提取)          │
          │  dependencies (提取)           │
          └──────────────────────────────┘
```

### 4.2 数据库 Skill 表增强

```sql
ALTER TABLE skills ADD COLUMN IF NOT EXISTS
    -- OpenClaw 原始数据（完整保留，不丢失信息）
    openclaw_skill_md      TEXT,           -- 原始 SKILL.md 完整内容
    openclaw_meta_json     JSONB,          -- 原始 _meta.json
    openclaw_source        VARCHAR(20),    -- clawhub | github | local
    openclaw_author        VARCHAR(100),   -- ClawHub author
    openclaw_skill_type    VARCHAR(10),    -- type_a | type_b | type_c

    -- 运行时依赖（从 SKILL.md 和文件中提取）
    required_bins          JSONB DEFAULT '[]',  -- ["npm","pip","semgrep"]
    supported_os           JSONB DEFAULT '[]',  -- ["linux","darwin"]
    python_deps            TEXT,                 -- requirements.txt 内容
    node_deps              JSONB,                -- package.json 内容

    -- 脚本文件清单
    script_files           JSONB DEFAULT '[]',  -- [{path, language, size}]
    -- 嵌入脚本（从 Markdown 代码块提取）
    embedded_scripts       JSONB DEFAULT '[]';  -- [{language, code, context}]
```

### 4.3 Skill 文件存储

导入的 OpenClaw Skill 的实际文件存储在服务端文件系统：

```
data/skills/imported/{openclaw_author}/{skill_slug}/
├── SKILL.md               # 原始 SKILL.md
├── _meta.json             # 原始 _meta.json
├── slither-audit.py       # 原始脚本（如有）
├── scripts/audit.js       # 原始脚本（如有）
├── package.json           # 原始依赖声明（如有）
├── requirements.txt       # 原始依赖声明（如有）
└── .vulnhunter/
    └── pipeline.yaml      # VulnHunter 自动生成的管线
```

---

## 5. 统一 Skill 执行引擎

### 5.1 执行前的环境准备

无论 Skill 结构如何，执行前都需要完成以下准备：

```
┌────────────────────────────────────────────────────────┐
│                 Sandbox 环境准备                        │
│                                                        │
│  1. 挂载 Skill 完整目录到 Sandbox                      │
│     /skills/{slug}/  ← data/skills/{author}/{slug}/    │
│     ├── SKILL.md                                       │
│     ├── scripts/        (原样保留)                      │
│     ├── references/     (原样保留)                      │
│     └── assets/         (原样保留)                      │
│                                                        │
│  2. 挂载目标项目到 Sandbox                              │
│     /project/  ← 项目源码                              │
│                                                        │
│  3. 安装依赖 (如有)                                     │
│     pip install -r /skills/{slug}/requirements.txt     │
│     cd /skills/{slug} && npm install --production      │
│                                                        │
│  4. 检查 required_bins                                  │
│     which semgrep && which bandit && ...               │
│                                                        │
│  5. 索引 references/ 到 RAG (如有)                      │
│     ChromaDB.index(/skills/{slug}/references/*.md)     │
│                                                        │
│  6. 设置环境变量                                        │
│     SKILL_DIR=/skills/{slug}                           │
│     PROJECT_PATH=/project                              │
└────────────────────────────────────────────────────────┘
```

### 5.2 `{SKILL_DIR}` 占位符

SKILL.md 中经常使用 `{SKILL_DIR}` 引用 Skill 自身目录。执行时替换为实际挂载路径：

```python
def resolve_skill_dir(command: str, skill_dir: str) -> str:
    return command.replace("{SKILL_DIR}", skill_dir)
    # python3 {SKILL_DIR}/scripts/scan.py /project
    # → python3 /skills/my-skill/scripts/scan.py /project
```

### 5.3 统一执行路由

```
SKILL.md 解析
    │
    ├── 有 scripts/ & SKILL.md 引用了 {SKILL_DIR}/scripts/*?
    │   └── YES → Script Execution 路径 (§5.4)
    │
    ├── 有嵌入代码块?
    │   └── YES → Embedded Script 路径 (§5.5)
    │
    └── 纯自然语言指令
        └── Pure Agent 路径 (§5.6)

    ※ 三条路径不互斥，可组合为混合模式 (§5.7)
    ※ references/ 始终索引到 RAG 供 Agent 检索
    ※ assets/ 始终可通过 {SKILL_DIR}/assets/ 访问
```

### 5.4 Script Execution 路径（有 scripts/ 目录）

当 Skill 有 `scripts/` 目录且 SKILL.md 中引用了脚本：

```python
async def execute_script_path(skill, project_ctx, sandbox):
    """执行 scripts/ 中的脚本"""

    # 1. 从 SKILL.md 解析执行命令
    command = extract_script_command(skill.openclaw_skill_md)
    # 典型: "python3 {SKILL_DIR}/scripts/scan_skill.py <target>"

    # 2. 替换占位符
    command = command.replace("{SKILL_DIR}", f"/skills/{skill.slug}")
    command = command.replace("<target-directory>", "/project")
    command = command.replace("<target>", "/project")
    command = command.replace("$PROJECT_PATH", "/project")

    # 3. 执行
    result = await sandbox.exec(
        command=command,
        workdir="/project",
        timeout=skill.timeout or 300,
        env={"SKILL_DIR": f"/skills/{skill.slug}", "PROJECT_PATH": "/project"},
    )

    # 4. 解析输出
    return await parse_skill_output(result.stdout, result.stderr, skill)
```

**命令推断优先级**:
1. SKILL.md 中 "Usage" / "Quick Start" / "Step N: Run" 段落中的命令
2. `package.json` 的 `scripts.audit` / `scripts.scan` / `scripts.start`
3. 按 `scripts/` 中的主脚本文件类型推断

### 5.5 Embedded Script 路径（SKILL.md 嵌入代码块）

当 SKILL.md body 中包含可执行的代码块：

```python
async def execute_embedded_path(skill, project_ctx, sandbox):
    """提取并执行 SKILL.md 中嵌入的代码块"""

    embedded = extract_embedded_scripts(skill.openclaw_skill_md)
    all_findings = []

    for script in embedded:
        if not script.is_executable:
            continue

        if script.language in ('bash', 'sh'):
            # 替换变量后直接执行
            code = script.code.replace("$PROJECT_PATH", "/project")
            result = await sandbox.exec(f"bash -c '{code}'", workdir="/project")

        elif script.language == 'python':
            await sandbox.write_file("/tmp/_embedded.py", script.code)
            result = await sandbox.exec("python3 /tmp/_embedded.py /project")

        elif script.language in ('javascript', 'js'):
            await sandbox.write_file("/tmp/_embedded.js", script.code)
            result = await sandbox.exec("node /tmp/_embedded.js /project")

        findings = await parse_script_output(result.stdout, result.stderr, skill)
        all_findings.extend(findings)

    return all_findings
```

### 5.6 Pure Agent 路径（纯自然语言指令）

将 SKILL.md 完整内容注入 Agent system prompt：

```python
async def execute_agent_path(skill, project_ctx, prior_findings=None):
    """Agent 阅读 SKILL.md 指令并自主执行"""

    system_prompt = f"""你是一个安全审计 Agent。
请严格按照以下 Skill 指令对目标项目进行审计：

--- SKILL 指令 ---
{skill.openclaw_skill_md}
--- 指令结束 ---

目标项目: {project_ctx.project_path}
语言: {project_ctx.languages}
框架: {project_ctx.frameworks}
"""
    if prior_findings:
        system_prompt += f"\n已有的初步发现（请在此基础上深入分析）:\n{format_findings(prior_findings)}"

    # references/ 中的文档已索引到 RAG，Agent 可通过 rag_query 检索
    tools = [file_read, search_code, rag_query, sandbox_exec]

    agent = build_analysis_agent(system_prompt=system_prompt, tools=tools, max_iterations=20)
    return await agent.run()
```

### 5.7 混合模式（推荐）

组合多条路径，获得最全面的审计结果：

```python
async def execute_skill(skill, project_ctx):
    """统一入口：根据 Skill 结构自动选择执行路径"""

    sandbox = await get_sandbox()
    await prepare_sandbox(sandbox, skill, project_ctx)  # 环境准备 (§5.1)

    findings = []

    # Phase 1: 执行 scripts/ (如有)
    if skill.has_scripts and has_script_calls(skill.openclaw_skill_md):
        script_results = await execute_script_path(skill, project_ctx, sandbox)
        findings.extend(script_results)

    # Phase 2: 执行嵌入代码块 (如有)
    embedded = extract_embedded_scripts(skill.openclaw_skill_md)
    executable_blocks = [s for s in embedded if s.is_executable]
    if executable_blocks:
        embedded_results = await execute_embedded_path(skill, project_ctx, sandbox)
        findings.extend(embedded_results)

    # Phase 3: Agent 深度分析（始终执行，利用 references/ 知识 + 前序结果）
    agent_results = await execute_agent_path(skill, project_ctx, prior_findings=findings)
    findings.extend(agent_results)

    # 去重
    return deduplicate_findings(findings)
```

### 5.8 references/ 索引到 RAG

```python
async def index_references(skill, rag_indexer):
    """将 references/ 下的文档索引到 ChromaDB"""
    if not skill.has_references:
        return

    for ref_file in skill.reference_files:
        content = read_file(f"{skill.skill_dir_path}/{ref_file['path']}")
        await rag_indexer.index_document(
            content=content,
            metadata={
                "source": f"skill:{skill.slug}",
                "type": "reference",
                "file": ref_file["path"],
            },
            collection=f"skill_{skill.slug}_refs",
        )
```

Agent 在分析时可通过 `rag_query` 工具检索 references/ 中的知识：

```
Agent: 我需要了解 ClawHavoc 攻击模式的详细信息
Tool: rag_query("ClawHavoc attack patterns supply chain")
→ 返回 references/threat_knowledge_base.md 中的相关段落
```

### 5.9 处理流程

```
SKILL.md
    │
    ├── Frontmatter 解析
    │   ├── name → skill slug
    │   ├── description → 用于推荐匹配
    │   ├── metadata.clawdbot.requires.anyBins → 环境检查
    │   └── tags → 分类推断
    │
    └── Body 解析
        ├── 段落文本 → Agent system prompt
        ├── 代码块提取:
        │   ├── ```bash ... ``` → Shell 命令列表
        │   ├── ```python ... ``` → Python 脚本
        │   └── ```javascript ... ``` → JS 脚本
        ├── 工作流步骤（## Workflow / ## Steps）→ Agent 执行计划
        └── 输出格式（## Output）→ Finding 解析规则
```

### 5.2 嵌入代码块提取

```python
import re
from dataclasses import dataclass

@dataclass
class EmbeddedScript:
    language: str       # bash, python, javascript, etc.
    code: str           # 完整代码内容
    context: str        # 代码块前面的段落标题/描述
    is_executable: bool # 是否为完整可执行脚本（vs. 片段示例）

def extract_embedded_scripts(skill_md_body: str) -> list[EmbeddedScript]:
    """从 SKILL.md body 中提取所有代码块"""
    pattern = r'```(\w+)\n(.*?)```'
    blocks = re.findall(pattern, skill_md_body, re.DOTALL)

    scripts = []
    for lang, code in blocks:
        code = code.strip()
        is_executable = (
            lang in ('bash', 'sh', 'shell') and len(code.split('\n')) > 3
        ) or (
            lang == 'python' and ('import ' in code or 'def ' in code)
        ) or (
            lang in ('javascript', 'js') and ('require(' in code or 'import ' in code)
        )

        # 获取代码块前面的标题作为上下文
        # ...

        scripts.append(EmbeddedScript(
            language=lang,
            code=code,
            context=context,
            is_executable=is_executable,
        ))

    return scripts
```

### 5.3 执行策略

对 Type A Skill，VulnHunter 有三种执行模式：

#### 模式 1: Agent 驱动（默认）

将 SKILL.md 的完整内容注入 AI Agent 的 system prompt，让 Agent 按照 Markdown 中的指令行事：

```python
async def execute_type_a_agent_mode(skill, project_context):
    """Agent 阅读 SKILL.md 指令并自主执行"""

    system_prompt = f"""你是一个安全审计 Agent。
请按照以下 Skill 指令对目标项目进行审计：

--- SKILL 指令开始 ---
{skill.openclaw_instructions}
--- SKILL 指令结束 ---

目标项目信息：
- 路径: {project_context.project_path}
- 语言: {project_context.languages}
- 框架: {project_context.frameworks}

请使用提供的工具（file_read, search_code, sandbox_exec 等）执行审计，
并将发现的问题按照以下格式报告：
{{
  "title": "问题标题",
  "severity": "critical|high|medium|low",
  "file_path": "文件路径",
  "line_start": 行号,
  "description": "问题描述",
  "suggestion": "修复建议"
}}
"""

    agent = build_analysis_agent(
        system_prompt=system_prompt,
        tools=[file_read, search_code, sandbox_exec, sandbox_http],
        max_iterations=20,
    )

    findings = await agent.run()
    return findings
```

#### 模式 2: 脚本提取执行

提取 SKILL.md 中嵌入的代码块，在 Sandbox 中逐个执行：

```python
async def execute_type_a_script_mode(skill, project_context):
    """提取并执行 SKILL.md 中嵌入的脚本"""

    embedded = skill.embedded_scripts
    findings = []

    for script in embedded:
        if not script.is_executable:
            continue

        if script.language in ('bash', 'sh', 'shell'):
            result = await sandbox.exec(
                command=f"bash -c '{script.code}'",
                workdir=project_context.project_path,
                timeout=120,
            )
        elif script.language == 'python':
            # 写入临时文件后执行
            result = await sandbox.exec(
                command=f"python3 /tmp/script.py",
                files={"/tmp/script.py": script.code},
                workdir=project_context.project_path,
                timeout=120,
            )
        elif script.language in ('javascript', 'js'):
            result = await sandbox.exec(
                command=f"node /tmp/script.js",
                files={"/tmp/script.js": script.code},
                workdir=project_context.project_path,
                timeout=120,
            )

        # 解析输出为 findings
        parsed = await parse_script_output(result.stdout, script.context)
        findings.extend(parsed)

    return findings
```

#### 模式 3: 混合模式（推荐）

先用脚本模式执行可自动化的检测，再用 Agent 模式做深度分析：

```python
async def execute_type_a_hybrid(skill, project_context):
    """混合执行：先脚本后 Agent"""

    # Phase 1: 执行嵌入的检测脚本
    script_findings = await execute_type_a_script_mode(skill, project_context)

    # Phase 2: Agent 基于脚本结果做深度分析
    agent_findings = await execute_type_a_agent_mode(
        skill, project_context,
        prior_findings=script_findings,
    )

    return merge_findings(script_findings, agent_findings)
```

---

### 6.3 输出解析器

```python
async def parse_skill_output(stdout, stderr, exit_code, skill) -> list[Finding]:
    """
    多级解析策略：JSON → SARIF → 结构化文本 → LLM 提取
    """

    # 1. JSON 解析
    try:
        data = json.loads(stdout)
        if isinstance(data, list):
            return [parse_json_finding(f, skill) for f in data]
        if isinstance(data, dict):
            # 常见 key: findings, vulnerabilities, results, issues
            for key in ['findings', 'vulnerabilities', 'results', 'issues', 'detectors']:
                if key in data and isinstance(data[key], list):
                    return [parse_json_finding(f, skill) for f in data[key]]
    except (json.JSONDecodeError, TypeError):
        pass

    # 2. SARIF 解析
    if '"$schema"' in stdout and 'sarif' in stdout.lower():
        return parse_sarif_output(stdout, skill)

    # 3. 结构化文本行解析
    line_findings = parse_structured_lines(stdout + "\n" + stderr)
    if line_findings:
        return line_findings

    # 4. Markdown 报告解析（很多 Skill 输出 Markdown）
    md_findings = parse_markdown_report(stdout)
    if md_findings:
        return md_findings

    # 5. LLM Fallback
    return await llm_extract_findings(stdout, stderr, skill)


def parse_structured_lines(text: str) -> list[Finding]:
    """
    匹配常见的结构化输出格式：
    - [CRITICAL] path/to/file.py:42 — SQL injection in query()
    - WARNING: path/to/file.js:10 — eval() with user input
    - ✗ High: Reentrancy in Bank.withdraw() (contracts/Bank.sol:15)
    """
    patterns = [
        # [SEVERITY] file:line message
        r'\[?(CRITICAL|HIGH|MEDIUM|LOW|WARNING|ERROR|INFO)\]?\s*[:\-]?\s*(.+?):(\d+)\s*[:\-—]\s*(.+)',
        # severity: message (file:line)
        r'(Critical|High|Medium|Low|Warning)\s*:\s*(.+?)\s*\((.+?):(\d+)\)',
        # ✗/✓ severity: message
        r'[✗✕✘×]\s*(Critical|High|Medium|Low)\s*:\s*(.+?)(?:\s*\((.+?):(\d+)\))?',
    ]
    findings = []
    for line in text.split('\n'):
        for pattern in patterns:
            m = re.search(pattern, line, re.IGNORECASE)
            if m:
                findings.append(build_finding_from_match(m))
                break
    return findings


def parse_markdown_report(text: str) -> list[Finding]:
    """
    解析 Markdown 格式的审计报告
    很多 OpenClaw Skill 输出 Markdown 格式的报告

    例:
    ## Vulnerabilities Found
    - **reentrancy-eth** (High)
      Reentrancy in Bank.withdraw()...
    """
    findings = []
    # 解析 Markdown 列表项中的漏洞
    pattern = r'[-*]\s+\*?\*?(.+?)\*?\*?\s*\((Critical|High|Medium|Low|Info)\)'
    for m in re.finditer(pattern, text, re.IGNORECASE):
        findings.append(Finding(
            title=m.group(1).strip(),
            severity=m.group(2).lower(),
            detected_by="openclaw_skill",
        ))
    return findings
```

---

## 7. Pipeline Config 自动生成

### 7.1 Type A → pipeline_config

```python
def generate_pipeline_for_type_a(skill_md: str, embedded_scripts: list) -> dict:
    """为纯 SKILL.md Skill 生成 pipeline_config"""

    phases = []

    # Phase 1: 嵌入脚本执行（如果有可执行的代码块）
    executable_scripts = [s for s in embedded_scripts if s.is_executable]
    if executable_scripts:
        phases.append({
            "name": "embedded_script_execution",
            "description": "执行 SKILL.md 中嵌入的检测脚本",
            "steps": [
                {
                    "tool": "sandbox_exec_embedded",
                    "config": {
                        "scripts": [
                            {
                                "language": s.language,
                                "code": s.code,
                                "context": s.context,
                            }
                            for s in executable_scripts
                        ]
                    }
                }
            ]
        })

    # Phase 2: AI Agent 按照 SKILL.md 指令深度分析
    phases.append({
        "name": "ai_instruction_following",
        "description": "AI Agent 按照 SKILL.md 指令进行深度分析",
        "agent": {
            "type": "analysis",
            "system_prompt_source": "openclaw_skill_md",
            "max_iterations": 15,
        }
    })

    return {"phases": phases}
```

### 7.2 Type B → pipeline_config

```python
def generate_pipeline_for_type_b(skill, script_files, deps) -> dict:
    """为带脚本的 Skill 生成 pipeline_config"""

    phases = []

    # Phase 1: 依赖安装（如果需要）
    if deps.python or deps.node:
        phases.append({
            "name": "dependency_install",
            "description": "安装 Skill 运行时依赖",
            "steps": [
                *(
                    [{"tool": "sandbox_exec", "config": {"command": "pip install -r requirements.txt"}}]
                    if deps.python else []
                ),
                *(
                    [{"tool": "sandbox_exec", "config": {"command": "npm install --production"}}]
                    if deps.node else []
                ),
            ]
        })

    # Phase 2: 脚本执行
    main_script = find_main_script(script_files)
    phases.append({
        "name": "script_execution",
        "description": f"执行 {main_script}",
        "steps": [{
            "tool": "sandbox_exec_skill_script",
            "config": {
                "script": main_script,
                "language": detect_language(main_script),
                "args": ["$PROJECT_PATH"],
                "timeout": 300,
                "prefer_json_output": True,
            }
        }]
    })

    # Phase 3 (可选): AI 增强分析
    phases.append({
        "name": "ai_enhancement",
        "description": "AI 对脚本发现进行深度分析和补充",
        "agent": {
            "type": "analysis",
            "system_prompt_source": "openclaw_skill_md",
            "max_iterations": 10,
            "enhance_prior_findings": True,
        },
        "when": "config.ai_enhance == true"
    })

    return {"phases": phases}
```

---

## 8. Sandbox 环境

### 8.1 Sandbox Docker 镜像

OpenClaw Skill 需要丰富的运行时环境，Sandbox 镜像必须预装常用工具：

```dockerfile
FROM python:3.11-slim

# 系统工具
RUN apt-get update && apt-get install -y \
    git curl wget jq openssl \
    && rm -rf /var/lib/apt/lists/*

# Node.js (很多 Skill 需要)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Go (部分 Skill 需要)
RUN curl -fsSL https://go.dev/dl/go1.22.0.linux-amd64.tar.gz | tar -C /usr/local -xzf -
ENV PATH="/usr/local/go/bin:$PATH"

# 安全扫描工具（SKILL.md 中最常引用的工具）
RUN pip install --no-cache-dir \
    semgrep \
    bandit \
    safety \
    pip-audit \
    slither-analyzer \
    && npm install -g \
    npm-audit \
    && go install golang.org/x/vuln/cmd/govulncheck@latest

# 运行时限制
RUN useradd -m -s /bin/bash runner
USER runner
WORKDIR /workspace
```

### 8.2 Sandbox 执行 API

```python
class Sandbox:
    async def exec(
        self,
        command: str,
        workdir: str = "/workspace",
        timeout: int = 300,
        env: dict = None,
        files: dict = None,       # {path: content} 临时文件
    ) -> SandboxResult:
        """在 Docker 容器中执行命令"""
        ...

    async def copy_directory(self, src: str, dst: str):
        """将目录复制到容器中"""
        ...

    async def install_deps(self, requirements_txt: str = None, package_json: dict = None):
        """安装 Python/Node 依赖"""
        ...
```

---

## 9. 导入 API

### POST /skills/import-openclaw

支持三种导入源：

#### 从 ClawHub URL 导入

```json
{
  "source": "clawhub",
  "url": "https://github.com/openclaw/skills/tree/main/skills/aviclaw/slither-audit",
  "options": {
    "auto_generate_pipeline": true,
    "ai_enhance": true,
    "execution_mode": "hybrid"
  }
}
```

#### 从本地目录导入

```json
{
  "source": "local",
  "path": "/path/to/skill-directory"
}
```

#### 从粘贴的内容导入

```json
{
  "source": "paste",
  "skill_md": "---\nname: my-scanner\ndescription: ...\n---\n\n# My Scanner\n...",
  "files": {
    "scan.py": "#!/usr/bin/env python3\nimport sys\n...",
    "requirements.txt": "requests>=2.28.0\n"
  }
}
```

#### 响应

```json
{
  "id": "uuid",
  "slug": "slither-audit",
  "name": "Slither Audit",
  "version": "0.4.0",
  "description": "Run slither static analysis on Solidity contracts.",
  "openclaw_source": "clawhub",
  "openclaw_author": "aviclaw",
  "openclaw_skill_type": "type_b",
  "category": "smart-contract",
  "required_bins": ["pip", "slither"],
  "script_files": [
    {"path": "slither-audit.py", "language": "python", "size": 4184}
  ],
  "python_deps": "slither-analyzer",
  "pipeline_config": {
    "phases": [
      {
        "name": "dependency_install",
        "steps": [{"tool": "sandbox_exec", "config": {"command": "pip install slither-analyzer"}}]
      },
      {
        "name": "script_execution",
        "steps": [{
          "tool": "sandbox_exec_skill_script",
          "config": {"script": "slither-audit.py", "language": "python", "args": ["$PROJECT_PATH", "--format", "json"]}
        }]
      }
    ]
  },
  "status": "active",
  "import_warnings": [
    "Category inferred as 'smart-contract' from description",
    "Requires 'slither' binary - ensure sandbox has it installed"
  ],
  "security_scan": {
    "status": "passed",
    "checks": {
      "no_network_exfiltration": true,
      "no_credential_access": true,
      "no_filesystem_escape": true,
      "sandboxed_execution": true
    }
  }
}
```

---

## 10. 导入时安全扫描

```python
class SkillSecurityScanner:
    """导入 OpenClaw Skill 前的安全扫描"""

    DANGEROUS_PATTERNS = [
        # 数据外泄
        (r'curl\s+.*\|.*bash', 'download_and_execute'),
        (r'wget\s+.*-O\s*-\s*\|', 'download_and_execute'),
        (r'fetch\s*\(.*(webhook|exfil)', 'data_exfiltration'),

        # 环境变量窃取
        (r'process\.env', 'env_access'),
        (r'os\.environ', 'env_access'),
        (r'\$[A-Z_]*KEY', 'potential_secret_access'),
        (r'\$[A-Z_]*TOKEN', 'potential_secret_access'),
        (r'\$[A-Z_]*SECRET', 'potential_secret_access'),

        # 文件系统越界
        (r'/etc/shadow', 'sensitive_file_access'),
        (r'~/.ssh/', 'ssh_key_access'),
        (r'~/.aws/', 'cloud_credential_access'),

        # 持久化
        (r'crontab', 'persistence'),
        (r'systemctl\s+enable', 'persistence'),

        # 权限提升
        (r'sudo\s', 'privilege_escalation'),
        (r'chmod\s+777', 'insecure_permissions'),

        # 混淆 / 编码
        (r'base64\s+-d.*\|.*bash', 'obfuscated_execution'),
        (r'eval\s*\(.*atob', 'obfuscated_execution'),
    ]

    async def scan(self, skill_dir: str) -> SecurityReport:
        findings = []

        # 扫描所有文本文件
        for file_path in walk_skill_files(skill_dir):
            content = read_file(file_path)
            for pattern, category in self.DANGEROUS_PATTERNS:
                if re.search(pattern, content, re.IGNORECASE):
                    findings.append(SecurityFinding(
                        file=file_path,
                        pattern=pattern,
                        category=category,
                        severity='high' if category in ('download_and_execute', 'data_exfiltration') else 'medium',
                    ))

        # 检查零宽字符（隐写术）
        findings.extend(check_zero_width_chars(skill_dir))

        # 检查网络外联
        findings.extend(check_network_calls(skill_dir))

        return SecurityReport(
            passed=not any(f.severity == 'high' for f in findings),
            findings=findings,
        )
```

---

## 11. 导出（VulnHunter → OpenClaw）

VulnHunter 原生 Skill 可导出为 OpenClaw 兼容格式：

```python
def export_to_openclaw(skill) -> dict:
    """导出 VulnHunter Skill 为 OpenClaw SKILL.md 格式"""

    # 生成 SKILL.md
    frontmatter = {
        "name": skill.slug,
        "description": skill.description,
    }

    # 从 pipeline 推断 requires
    required_bins = infer_required_bins(skill.pipeline_config)
    if required_bins:
        frontmatter["metadata"] = {
            "clawdbot": {
                "emoji": skill.icon or "🔍",
                "requires": {"anyBins": required_bins},
                "os": ["linux", "darwin"],
            }
        }

    body = generate_skill_md_body(skill)

    skill_md = f"""---
{yaml.dump(frontmatter, allow_unicode=True)}---

# {skill.name}

{body}
"""

    return {
        "SKILL.md": skill_md,
        "script_files": skill.script_files,  # 如果有独立脚本
    }
```

---

## 12. 端到端示例

### 示例: 导入 slither-audit Skill 并执行审计

```
1. 用户点击 "导入 OpenClaw Skill"
   输入: https://github.com/openclaw/skills/tree/main/skills/aviclaw/slither-audit

2. VulnHunter 后端:
   a. Clone skill 目录
   b. 解析 SKILL.md frontmatter → name=slither-audit
   c. 发现 slither-audit.py → Type B Skill
   d. 安全扫描 → 通过
   e. 自动生成 pipeline_config:
      Phase 1: pip install slither-analyzer
      Phase 2: python3 slither-audit.py {project_path} --format json
   f. 推断 category = "smart-contract"
   g. 存入数据库

3. 用户将此 Skill 添加到 "Solidity 审计" Profile

4. 用户对 Solidity 项目启动审计:
   a. Sandbox 容器启动
   b. pip install slither-analyzer
   c. 复制 slither-audit.py 到 Sandbox
   d. python3 slither-audit.py /project --format json
   e. 解析 JSON 输出 → Finding 记录
   f. AI Agent 对 Finding 进行深度分析和补充

5. 用户查看 Finding 列表，生成报告
```

### 示例: 导入纯 Markdown 安全审计 Skill

```
1. 用户导入 kingrubic/agentic-security-audit
   → Type A Skill (30KB SKILL.md, 无独立脚本)

2. VulnHunter 后端:
   a. 解析 SKILL.md
   b. 提取 10+ 个嵌入 bash 脚本块
   c. 提取 metadata.requires = ["npm","pip","git","openssl","curl"]
   d. 生成 pipeline_config:
      Phase 1: 执行嵌入的 bash 检测脚本（密钥扫描、依赖审计等）
      Phase 2: AI Agent 按照 Workflow 段落进行深度分析

3. 执行时:
   a. Sandbox 逐个执行提取的 bash 脚本
      → npm audit
      → pip-audit
      → grep -rn 'AKIA...' (密钥扫描)
      → openssl s_client (SSL 检测)
   b. 收集所有脚本输出
   c. AI Agent 综合分析 → 结构化 Finding
```

---

## 13. 兼容性矩阵

| 特性 | 支持 | 说明 |
|------|------|------|
| SKILL.md (Type A - 纯 Markdown) | ✅ | Agent 指令注入 + 嵌入脚本提取执行 |
| SKILL.md + Python 脚本 (Type B) | ✅ | Sandbox 安装依赖 + 执行脚本 + 解析输出 |
| SKILL.md + Shell 脚本 (Type B) | ✅ | Sandbox 执行 + 解析输出 |
| SKILL.md + JS/TS 脚本 (Type B) | ✅ | Node.js Sandbox 执行 + 解析输出 |
| SKILL.md + package.json | ✅ | npm install + 执行 |
| SKILL.md + requirements.txt | ✅ | pip install + 执行 |
| skill.yaml manifest (Type C) | ✅ | 解析 manifest + 按 entryPoint 类型执行 |
| _meta.json (ClawHub metadata) | ✅ | 读取 owner/slug/version |
| SKILL.md frontmatter.metadata | ✅ | 提取 requires.anyBins / os |
| 嵌入 bash 代码块执行 | ✅ | 提取 + Sandbox 执行 |
| 嵌入 python 代码块执行 | ✅ | 提取 + Sandbox 执行 |
| JSON 输出解析 | ✅ | 自动检测 JSON 数组/对象 |
| SARIF 输出解析 | ✅ | 标准 SARIF 格式 |
| Markdown 报告解析 | ✅ | 解析 `- **type** (severity)` 模式 |
| 纯文本输出解析 | ✅ | 多种 `[SEVERITY] file:line msg` 模式 |
| LLM Fallback 解析 | ✅ | 无法结构化时由 LLM 提取 |
| VulnHunter → OpenClaw 导出 | ✅ | 生成 SKILL.md + 脚本文件 |
| 导入时安全扫描 | ✅ | 30+ 恶意模式检测 |

---

*本文档基于对 ClawHub 22,614 个 Skill 的实际分析编写，确保兼容覆盖真实世界的 OpenClaw Skill 生态。*
