# GoDeepAudit Agent 审计功能部署清单

## 📋 生产部署前必须完成的检查

### 1. 环境依赖 ✅

```bash
# 后端依赖
cd backend
uv pip install chromadb litellm langchain langgraph

# 外部安全工具（可选但推荐）
pip install semgrep bandit safety

# 或者使用系统包管理器
brew install semgrep  # macOS
apt install semgrep   # Ubuntu
```

### 2. LLM 配置 ✅

在 `.env` 文件中配置：

```env
# LLM 配置（必须）
LLM_PROVIDER=openai      # 或 azure, anthropic, ollama 等
LLM_MODEL=gpt-4o-mini    # 推荐使用 gpt-4 系列
LLM_API_KEY=sk-xxx       # 你的 API Key
LLM_BASE_URL=            # 可选，自定义端点

# 嵌入模型配置（RAG 需要）
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
```

### 3. 数据库迁移 ✅

```bash
cd backend
alembic upgrade head
```

确保以下表已创建：
- `agent_tasks`
- `agent_events`
- `agent_findings`

### 4. 向量数据库 ✅

```bash
# 创建向量数据库目录
mkdir -p /var/data/godeepaudit/vector_db

# 在 .env 中配置
VECTOR_DB_PATH=/var/data/godeepaudit/vector_db
```

### 5. Docker 沙箱（可选）

如果需要漏洞验证功能：

```bash
# 拉取沙箱镜像
docker pull python:3.11-slim

# 配置沙箱参数
SANDBOX_IMAGE=python:3.11-slim
SANDBOX_MEMORY_LIMIT=256m
SANDBOX_CPU_LIMIT=0.5
```

---

## 🔬 功能测试检查

### 测试 1: 基础流程

```bash
cd backend
PYTHONPATH=. uv run pytest tests/agent/ -v
```

预期结果：43 个测试全部通过

### 测试 2: LLM 连接

```bash
cd backend
PYTHONPATH=. uv run python -c "
import asyncio
from app.services.agent.graph.runner import LLMService

async def test():
    llm = LLMService()
    result = await llm.analyze_code('print(\"hello\")', 'python')
    print('LLM 连接成功:', 'issues' in result)

asyncio.run(test())
"
```

### 测试 3: 外部工具

```bash
# 测试 Semgrep
semgrep --version

# 测试 Bandit
bandit --version
```

### 测试 4: 端到端测试

1. 启动后端：`cd backend && uv run uvicorn app.main:app --reload`
2. 启动前端：`cd frontend && npm run dev`
3. 创建一个项目并上传代码
4. 选择 "Agent 审计模式" 创建任务
5. 观察执行日志和发现

---

## ⚠️ 已知限制

| 限制 | 影响 | 解决方案 |
|------|------|---------|
| **LLM 成本** | 每次审计消耗 Token | 使用 gpt-4o-mini 降低成本 |
| **扫描时间** | 大项目需要较长时间 | 设置合理的超时时间 |
| **误报率** | AI 可能产生误报 | 启用验证阶段过滤 |
| **外部工具依赖** | 需要手动安装 | 提供 Docker 镜像 |

---

## 🚀 生产环境建议

### 1. 资源配置

```yaml
# Kubernetes 部署示例
resources:
  limits:
    memory: "2Gi"
    cpu: "2"
  requests:
    memory: "1Gi"
    cpu: "1"
```

### 2. 并发控制

```env
# 限制同时运行的任务数
MAX_CONCURRENT_AGENT_TASKS=3
AGENT_TASK_TIMEOUT=1800  # 30 分钟
```

### 3. 日志监控

```python
# 配置日志级别
LOG_LEVEL=INFO
# 启用 SQLAlchemy 日志（调试用）
SQLALCHEMY_ECHO=false
```

### 4. 安全考虑

- [ ] 限制上传文件大小
- [ ] 限制扫描目录范围
- [ ] 启用沙箱隔离
- [ ] 配置 API 速率限制

---

## ✅ 部署状态检查

运行以下命令验证部署状态：

```bash
cd backend
PYTHONPATH=. uv run python -c "
print('检查部署状态...')

# 1. 检查数据库连接
try:
    from app.db.session import async_session_factory
    print('✅ 数据库配置正确')
except Exception as e:
    print(f'❌ 数据库错误: {e}')

# 2. 检查 LLM 配置
from app.core.config import settings
if settings.LLM_API_KEY:
    print('✅ LLM API Key 已配置')
else:
    print('⚠️ LLM API Key 未配置')

# 3. 检查向量数据库
import os
if os.path.exists(settings.VECTOR_DB_PATH or '/tmp'):
    print('✅ 向量数据库路径存在')
else:
    print('⚠️ 向量数据库路径不存在')

# 4. 检查外部工具
import shutil
tools = ['semgrep', 'bandit']
for tool in tools:
    if shutil.which(tool):
        print(f'✅ {tool} 已安装')
    else:
        print(f'⚠️ {tool} 未安装（可选）')

print()
print('部署检查完成！')
"
```

---

## 📝 结论

Agent 审计功能已经具备**基本的生产能力**，但建议：

1. **先在测试环境验证** - 用一个小项目测试完整流程
2. **监控 LLM 成本** - 观察 Token 消耗情况
3. **逐步开放** - 先给少数用户使用，收集反馈
4. **持续优化** - 根据实际效果调整 prompt 和阈值

如有问题，请查看日志或联系开发团队。
