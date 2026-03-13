# VulnHunter × OpenClaw Skill 兼容性规格

> **Version**: 0.2.0 — 基于 ClawHub 22,614 个 Skill 的实际分析  
> **Date**: 2026-03-13  
> **Related**: [SPEC.md](./SPEC.md)

---

## 1. OpenClaw Skill 真实生态分析

通过分析 `github.com/openclaw/skills` 仓库中的 22,614 个已发布 Skill，我们得出以下数据：

| 文件类型 | 数量 | 占比 |
|---------|------|------|
| 使用 `SKILL.md` 的 Skill | 22,614 | 100% |
| 包含 Python 脚本 (`.py`) | 6,130 | 27.1% |
| 包含 Shell 脚本 (`.sh`) | 3,795 | 16.8% |
| 包含 JS/TS 脚本 | 3,266 | 14.4% |
| 包含 `package.json` | 2,207 | 9.8% |
| 包含 `requirements.txt` | 624 | 2.8% |
| 使用 `skill.yaml` manifest | 214 | **0.9%** |

**结论**: OpenClaw Skill 的事实标准是 `SKILL.md` + 可选的脚本文件，而不是 `skill.yaml` manifest。VulnHunter 必须以 `SKILL.md` 格式为第一优先级兼容。

---

## 2. OpenClaw Skill 的两种实际形态

### Type A: 纯 SKILL.md（Markdown Agent 指令）

**最常见的形态**。只有一个 `SKILL.md` 文件，内容是 AI Agent 的行为指令。

```
skill-directory/
├── SKILL.md        # 核心：Agent 指令 + 嵌入的代码块
└── _meta.json      # ClawHub 注册信息（可选）
```

**SKILL.md 结构**:

```markdown
---
name: security-audit
description: Audit codebases for security issues. Use when scanning for vulnerabilities.
metadata: {"clawdbot":{"emoji":"🔒","requires":{"anyBins":["npm","pip","git"]},"os":["linux","darwin"]}}
---

# Security Audit

## When to Use
- Scanning project dependencies for known vulnerabilities
- Detecting hardcoded secrets

## Workflow
1. 识别项目语言和框架
2. 运行以下检测脚本...

### 依赖扫描

```bash
npm audit --json
pip-audit -r requirements.txt
```

### 密钥检测

```bash
grep -rn 'AKIA[0-9A-Z]{16}' --include='*.py' .
```

## Output Format
- 严重程度: CRITICAL / HIGH / MEDIUM / LOW
- 位置: file:line
- 建议修复方案
```

**关键特征**:
- SKILL.md 本身就是完整的 Skill
- 嵌入的代码块（bash/python/js）是 Agent 在运行时"抄写并执行"的脚本
- 没有独立的可执行文件——Markdown 就是全部
- `metadata.clawdbot.requires.anyBins` 声明运行时需要的外部工具

**真实案例**: `kingrubic/agentic-security-audit`
- 单个 SKILL.md 文件（30KB）
- 包含 10+ 个完整 bash 审计脚本作为 Markdown 代码块
- 覆盖 OWASP Top 10、密钥检测、依赖审计、SSL 验证等
- Agent 阅读 Markdown 指令 → 按指令执行嵌入的脚本

### Type B: SKILL.md + 独立脚本文件

**第二常见的形态**。`SKILL.md` + 实际可执行的脚本文件。

```
skill-directory/
├── SKILL.md            # Agent 指令（如何使用这些脚本）
├── _meta.json          # ClawHub 注册信息
├── slither-audit.py    # 独立 Python 脚本
└── detect.md           # 辅助文档（可选）
```

或带依赖管理：

```
skill-directory/
├── SKILL.md
├── _meta.json
├── package.json        # Node.js 依赖
├── requirements.txt    # Python 依赖
├── scripts/
│   └── audit.js        # 主脚本
└── references/
    └── spec.md         # 参考文档
```

**关键特征**:
- SKILL.md 说明如何使用脚本（`python3 slither-audit.py /path`）
- 脚本是独立可执行的 CLI 工具（接受参数、输出结果）
- 可能有 `package.json` / `requirements.txt` 声明依赖
- 脚本语言：Python（最多 6,130）、Shell（3,795）、JS/TS（3,266）

**真实案例 1**: `aviclaw/slither-audit`
- `SKILL.md`：使用说明
- `slither-audit.py`：125 行 Python 脚本
  - 调用 `slither` CLI 工具
  - 解析 JSON 输出
  - 生成 Markdown 审计报告
  - 支持 `--format json` 和 `--format markdown`

**真实案例 2**: `aviclaw/agent-security-auditor`
- `SKILL.md`：使用说明
- `package.json`：声明依赖 `ethers@^6.13.0`
- `scripts/audit.js`：593 行 Node.js 脚本
  - 使用 ethers.js 查询链上数据
  - 输出分级安全报告

### Type C: skill.yaml Manifest（极少使用）

仅 214 个 Skill（< 1%）使用。本规格仍然兼容此格式，但不以此为设计优先。

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

## 5. Type A Skill 执行引擎（纯 Markdown）

### 5.1 处理流程

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

## 6. Type B Skill 执行引擎（有独立脚本）

### 6.1 处理流程

```
Skill 目录
    │
    ├── 1. 环境准备
    │   ├── 检查 required_bins 是否在 Sandbox 中可用
    │   ├── 安装 Python 依赖 (pip install -r requirements.txt)
    │   ├── 安装 Node 依赖 (npm install / pnpm install)
    │   └── 复制 Skill 文件到 Sandbox
    │
    ├── 2. 解析 SKILL.md 获取执行命令
    │   ├── 从 "Usage" / "Quick Start" 段落提取命令
    │   │   例: "python3 slither-audit.py /path/to/contracts/"
    │   ├── 或从 package.json 的 scripts 字段获取
    │   │   例: "npm run audit"
    │   └── 或基于文件类型推断
    │       .py → python3 {file} {project_path}
    │       .js → node {file} {project_path}
    │       .sh → bash {file} {project_path}
    │
    ├── 3. 在 Sandbox 中执行
    │   ├── 设置工作目录为项目路径
    │   ├── 设置超时（默认 300s）
    │   ├── 捕获 stdout / stderr / exit_code
    │   └── 如果支持 --format json，优先使用
    │
    └── 4. 输出解析
        ├── 尝试 JSON 解析 → structured findings
        ├── 尝试 SARIF 解析
        ├── 尝试结构化文本解析（severity + file:line + message）
        └── fallback: LLM 从自由文本中提取 findings
```

### 6.2 实现

```python
async def execute_type_b(skill, project_context):
    """执行 Type B Skill（带独立脚本文件）"""

    sandbox = await get_sandbox()

    # 1. 复制 Skill 文件到 Sandbox
    skill_dir = f"/skills/{skill.slug}"
    await sandbox.copy_directory(
        src=skill.local_path,
        dst=skill_dir,
    )

    # 2. 安装依赖
    if skill.python_deps:
        await sandbox.exec(
            f"pip install -r {skill_dir}/requirements.txt",
            timeout=120,
        )
    if skill.node_deps:
        await sandbox.exec(
            f"cd {skill_dir} && npm install --production",
            timeout=120,
        )

    # 3. 构造执行命令
    command = build_execution_command(skill, project_context)
    # 例: "python3 /skills/slither-audit/slither-audit.py /project --format json"
    # 例: "cd /skills/agent-security-auditor && node scripts/audit.js 0x..."

    # 4. 执行
    result = await sandbox.exec(
        command=command,
        workdir=project_context.project_path,
        timeout=skill.timeout or 300,
        env={
            "PROJECT_PATH": project_context.project_path,
            **skill.env_vars,
        },
    )

    # 5. 解析输出
    findings = await parse_skill_output(
        stdout=result.stdout,
        stderr=result.stderr,
        exit_code=result.exit_code,
        skill=skill,
    )

    return findings


def build_execution_command(skill, project_context) -> str:
    """
    从 SKILL.md 或文件结构推断执行命令

    优先级:
    1. SKILL.md 中的 Usage/Quick Start 段落里的命令模式
    2. package.json 的 scripts.audit / scripts.scan / scripts.start
    3. 基于主脚本文件的类型推断
    """

    # 1. 从 SKILL.md 解析
    usage_cmd = extract_usage_command(skill.openclaw_instructions)
    if usage_cmd:
        return interpolate_command(usage_cmd, skill, project_context)

    # 2. 从 package.json 解析
    if skill.node_deps:
        pkg = skill.node_deps
        for script_name in ['audit', 'scan', 'start', 'main']:
            if script_name in pkg.get('scripts', {}):
                return f"cd /skills/{skill.slug} && npm run {script_name}"
        if pkg.get('main'):
            return f"node /skills/{skill.slug}/{pkg['main']} {project_context.project_path}"

    # 3. 基于文件类型推断
    main_script = find_main_script(skill.script_files)
    if main_script:
        ext = main_script.rsplit('.', 1)[-1]
        runners = {'py': 'python3', 'js': 'node', 'ts': 'npx tsx', 'sh': 'bash'}
        runner = runners.get(ext, 'bash')
        return f"{runner} /skills/{skill.slug}/{main_script} {project_context.project_path}"

    raise SkillExecutionError(f"Cannot determine execution command for skill {skill.slug}")
```

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
