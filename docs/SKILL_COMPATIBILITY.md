# VulnHunter × OpenClaw Skill 兼容性规格

> **Version**: 0.1.0  
> **Date**: 2026-03-13  
> **Related**: [SPEC.md](./SPEC.md) | [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 1. 目标

VulnHunter 的 Skill 系统与 OpenClaw 双向兼容：

- **导入**：从 ClawHub 或本地导入 OpenClaw Skill，自动生成审计管线
- **导出**：将 VulnHunter 原生 Skill 导出为标准 OpenClaw 格式
- **运行**：OpenClaw 原生 Skill 可在 VulnHunter 中直接执行

---

## 2. OpenClaw Skill 格式概览

### 2.1 skill.yaml (Manifest)

```yaml
# OpenClaw 官方格式
name: skill-name                 # REQUIRED: lowercase + hyphens
version: 1.0.0                   # REQUIRED: semver
author: username                 # REQUIRED: ClawHub username
description: "What it does"      # REQUIRED
license: MIT                     # optional, default MIT

permissions:                     # REQUIRED: list
  - filesystem
  - shell
  - network

entryPoint:                      # REQUIRED
  type: natural | shell | typescript
  prompt: "..."                  # for type=natural
  path: "./script.sh"            # for type=shell/typescript

config:                          # optional
  param_name:
    type: string | boolean | number
    required: false
    default: "value"
    description: "..."
    secret: false                # for vault storage

triggers:                        # optional
  keywords: [...]
  schedule: "0 * * * *"
  webhook: "/webhook/path"
```

### 2.2 SKILL.md (Markdown Skill)

```markdown
---
name: skill-name
description: "One-sentence description. Use when X. Also covers Y."
metadata: {"clawdbot":{"emoji":"🔍","requires":{"anyBins":["semgrep"]},"os":["linux","darwin"]}}
---

# Skill Title

## When to Use
- Description of trigger conditions

## Workflow
1. Step one
2. Step two
3. Step three

## Guardrails
- Safety rules

## Examples
- Example usage
```

---

## 3. 字段映射

### 3.1 导入映射: OpenClaw → VulnHunter

| OpenClaw 字段 | VulnHunter 字段 | 转换逻辑 |
|--------------|----------------|---------|
| `name` | `slug` | 直接映射 |
| `name` | `name` | 将 slug 转为可读名（如 `sql-injection` → `SQL Injection`） |
| `version` | `version` | 直接映射 |
| `author` | `openclaw_author` | 直接映射 |
| `description` | `description` | 直接映射 |
| `license` | 存入 `openclaw_manifest` | 保留原始值 |
| `permissions` | 存入 `openclaw_manifest` | 保留，用于安全审查 |
| `entryPoint` | `pipeline_config` | **需要转换**（见 §3.2） |
| `config` | `parameters_schema` | 转换为 VulnHunter 参数格式 |
| `triggers.keywords` | `tags` | 合并到标签 |
| 整个 `skill.yaml` | `openclaw_manifest` | JSONB 存储原始内容 |
| 整个 `SKILL.md` | `openclaw_instructions` | TEXT 存储原始内容 |
| — | `openclaw_source` | 设为 `clawhub` 或 `local` |
| — | `category` | **从 description/tags 推断** |
| — | `cwe_ids` | **从关键字推断** |

### 3.2 entryPoint → pipeline_config 转换

#### type: natural

```yaml
# OpenClaw
entryPoint:
  type: natural
  prompt: "Analyze code for SQL injection vulnerabilities..."

# → VulnHunter pipeline_config
phases:
  - name: ai_deep_analysis
    agent:
      type: analysis
      system_prompt_append: "Analyze code for SQL injection vulnerabilities..."
      # SKILL.md 的 Workflow 段落也会注入到 prompt
      max_iterations: 15
```

#### type: shell

```yaml
# OpenClaw
entryPoint:
  type: shell
  path: "./scan.sh"

# → VulnHunter pipeline_config
phases:
  - name: static_analysis
    steps:
      - tool: sandbox_exec
        config:
          command: "bash ./scan.sh"
          workdir: "/project"
          timeout: 300
          parse_output: true  # 尝试解析 stdout 为 findings
```

#### type: typescript

```yaml
# OpenClaw
entryPoint:
  type: typescript
  path: "./analyzer.ts"

# → VulnHunter pipeline_config
phases:
  - name: static_analysis
    steps:
      - tool: sandbox_exec
        config:
          command: "npx tsx ./analyzer.ts"
          workdir: "/project"
          timeout: 300
          parse_output: true
```

### 3.3 config → parameters_schema 转换

```yaml
# OpenClaw config
config:
  scan_depth:
    type: string
    required: false
    default: normal
    description: "Scan depth"

# → VulnHunter parameters_schema
parameters_schema:
  - name: scan_depth
    type: enum
    values: [shallow, normal, deep]  # 如果 type=string 则为 string
    default: normal
    description: "Scan depth"
```

### 3.4 Category 推断规则

从 `description` 和 `triggers.keywords` 中匹配关键字：

| 关键字 | Category | CWE |
|--------|----------|-----|
| sql injection, sqli, database query | injection | CWE-89 |
| xss, cross-site scripting, script injection | injection | CWE-79 |
| csrf, cross-site request | session | CWE-352 |
| ssrf, server-side request | ssrf | CWE-918 |
| path traversal, directory traversal, file include | file | CWE-22 |
| authentication, auth bypass, login | auth | CWE-287 |
| deserialization, unserialize, pickle | deserialization | CWE-502 |
| cryptography, encryption, hash, random | crypto | CWE-327 |
| secret, credential, api key, token leak | credential | CWE-798 |
| dependency, npm audit, supply chain | supply-chain | CWE-1104 |

如果无法推断，设为 `category: general`。

---

## 4. 导出映射: VulnHunter → OpenClaw

### 4.1 skill.yaml 生成

```python
def export_to_openclaw(skill: Skill) -> dict:
    manifest = {
        "name": skill.slug,
        "version": skill.version,
        "author": skill.openclaw_author or "vulnhunter",
        "description": skill.description,
        "license": "AGPL-3.0",
        "permissions": infer_permissions(skill.pipeline_config),
        "entryPoint": generate_entry_point(skill),
    }

    if skill.parameters_schema:
        manifest["config"] = convert_parameters(skill.parameters_schema)

    if skill.tags:
        manifest["triggers"] = {"keywords": skill.tags}

    return manifest
```

### 4.2 SKILL.md 生成

```python
def export_skill_md(skill: Skill) -> str:
    return f"""---
name: {skill.slug}
description: "{skill.description}"
metadata: {{"clawdbot":{{"emoji":"{skill.icon or '🔍'}","requires":{{"anyBins":{infer_bins(skill)}}},"os":["linux","darwin"]}}}}
---

# {skill.name}

## When to Use
{generate_when_to_use(skill)}

## Workflow
{generate_workflow_from_pipeline(skill.pipeline_config)}

## Guardrails
- Only performs read-only analysis
- Does not modify source code
- Findings require human review

## Configuration
{generate_config_docs(skill.parameters_schema)}
"""
```

### 4.3 权限推断

```python
def infer_permissions(pipeline_config: dict) -> list[str]:
    perms = set()
    for phase in pipeline_config.get("phases", []):
        if phase.get("steps"):
            perms.add("filesystem")
            for step in phase["steps"]:
                if step.get("tool") in ("sandbox_exec", "run_code"):
                    perms.add("shell")
                if step.get("tool") in ("sandbox_http",):
                    perms.add("network")
        if phase.get("agent"):
            perms.add("filesystem")
        if phase.get("sandbox"):
            perms.add("shell")
    return sorted(perms)
```

---

## 5. 运行时适配

### 5.1 OpenClaw Skill 执行流程

```
导入后的 OpenClaw Skill
         │
         ▼
SkillExecutor.run(skill, task)
         │
         ▼
┌─ 检查 openclaw_source ─────────────────────────┐
│                                                  │
│  if entryPoint.type == "natural":                │
│    ┌──────────────────────────────────────────┐  │
│    │ 1. Build Agent                           │  │
│    │    system_prompt = base_security_prompt   │  │
│    │                  + skill.entryPoint.prompt│  │
│    │                  + SKILL.md instructions  │  │
│    │    tools = [file_read, search, rag]       │  │
│    │                                           │  │
│    │ 2. Run ReAct loop (max_iterations=15)     │  │
│    │                                           │  │
│    │ 3. Parse findings from agent output       │  │
│    └──────────────────────────────────────────┘  │
│                                                  │
│  if entryPoint.type == "shell":                  │
│    ┌──────────────────────────────────────────┐  │
│    │ 1. Copy skill files to sandbox            │  │
│    │ 2. Copy project files to sandbox          │  │
│    │ 3. Run: bash {entryPoint.path}            │  │
│    │ 4. Capture stdout/stderr                  │  │
│    │ 5. Parse output → findings                │  │
│    │    (JSON / SARIF / plaintext patterns)     │  │
│    └──────────────────────────────────────────┘  │
│                                                  │
│  if entryPoint.type == "typescript":             │
│    ┌──────────────────────────────────────────┐  │
│    │ 1. Copy to sandbox (Node.js environment)  │  │
│    │ 2. Run: npx tsx {entryPoint.path}          │  │
│    │ 3. Parse output → findings                │  │
│    └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 5.2 输出解析

OpenClaw Skill 可能输出多种格式，VulnHunter 按优先级尝试解析：

1. **JSON**: 标准 findings JSON 数组
2. **SARIF**: Static Analysis Results Interchange Format
3. **Structured text**: `[SEVERITY] file:line message` 格式
4. **Freeform**: 使用 LLM 从自由文本中提取 findings

```python
async def parse_skill_output(stdout: str) -> list[Finding]:
    # 1. Try JSON
    try:
        data = json.loads(stdout)
        if isinstance(data, list):
            return [Finding.from_dict(f) for f in data]
    except json.JSONDecodeError:
        pass

    # 2. Try SARIF
    if '"$schema"' in stdout and 'sarif' in stdout:
        return parse_sarif(stdout)

    # 3. Try structured lines
    findings = parse_structured_lines(stdout)
    if findings:
        return findings

    # 4. LLM extraction
    return await llm_extract_findings(stdout)
```

---

## 6. 安全考量

### 6.1 导入时安全检查

从 OpenClaw 导入 Skill 时执行安全扫描：

| 检查项 | 说明 | 处理 |
|--------|------|------|
| shell 命令注入 | 检查 entryPoint.path 和 config 中的命令 | 沙箱隔离 |
| 网络外联 | 检查是否有 curl/wget/fetch 外联 | 网络隔离 |
| 文件系统逃逸 | 检查是否访问 /etc, /root 等 | 限制挂载 |
| 环境变量窃取 | 检查 process.env 访问 | 清理环境 |
| prompt injection | 检查 SKILL.md 中的指令注入 | LLM 输入审查 |

### 6.2 执行时隔离

- 所有 shell/typescript 类型 Skill 在 Docker Sandbox 中执行
- `natural` 类型 Skill 的 prompt 经过净化后注入 Agent
- 资源限制：CPU 1 core, Memory 512MB, Time 5min
- 无外部网络访问

---

## 7. API 详情

### POST /skills/import-openclaw

```
Request:
{
  "source": "clawhub",           // clawhub | github | local
  "url": "https://github.com/openclaw/skills/tree/main/skills/author/my-skill",
  // OR
  "source": "local",
  "skill_yaml": "name: ...\n...",
  "skill_md": "---\nname: ...\n---\n...",
  // Options
  "auto_generate_pipeline": true,
  "auto_infer_category": true
}

Response:
{
  "id": "uuid",
  "slug": "my-skill",
  "name": "My Skill",
  "version": "1.0.0",
  "openclaw_source": "clawhub",
  "openclaw_author": "author",
  "category": "injection",       // auto-inferred
  "pipeline_config": {...},      // auto-generated
  "status": "active",
  "warnings": [
    "Category inferred as 'injection' from description keywords"
  ]
}
```

### GET /skills/{id}/export?format=openclaw

```
Response:
{
  "skill_yaml": "name: sql-injection-detection\nversion: 1.2.0\n...",
  "skill_md": "---\nname: sql-injection-detection\n---\n# SQL Injection Detection\n..."
}
```

---

## 8. 兼容性矩阵

| OpenClaw 特性 | VulnHunter 支持 | 说明 |
|--------------|----------------|------|
| skill.yaml manifest | ✅ 完全 | 所有 required/optional 字段 |
| SKILL.md frontmatter | ✅ 完全 | name, description, metadata |
| SKILL.md instructions | ✅ 注入 Agent prompt | Workflow/Guardrails 段落 |
| entryPoint: natural | ✅ Agent prompt | 注入 AI Analysis Agent |
| entryPoint: shell | ✅ Sandbox | Docker 隔离执行 |
| entryPoint: typescript | ✅ Node Sandbox | Docker + Node.js |
| config params | ✅ 映射 | → parameters_schema |
| triggers.keywords | ✅ 映射 | → tags |
| triggers.schedule | ⚠️ 计划中 | 定时审计 (Phase 2) |
| triggers.webhook | ⚠️ 计划中 | CI/CD webhook (Phase 2) |
| permissions | ✅ 存储+展示 | 用于安全审查 |
| capabilities (new) | ⚠️ 跟踪中 | 等 OpenClaw 稳定后适配 |

---

*本文档定义 VulnHunter 与 OpenClaw 的 Skill 互操作规格。*
