"""Add OpenCode agent audit tables and issue management enhancements

Revision ID: 009_add_opencode_tables
Revises: 008_add_files_with_findings
Create Date: 2026-03-13

"""
from alembic import op
import sqlalchemy as sa

revision = '009_add_opencode_tables'
down_revision = '008_add_files_with_findings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # ─── opencode_skills ─────────────────────────────────────────
    if 'opencode_skills' not in existing_tables:
        op.create_table(
            'opencode_skills',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('name', sa.String(100), nullable=False, unique=True),
            sa.Column('display_name', sa.String(255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('category', sa.String(50), default='custom'),
            sa.Column('system_prompt', sa.Text(), nullable=False),
            sa.Column('tool_hints', sa.JSON(), nullable=True),
            sa.Column('vulnerability_types', sa.JSON(), nullable=True),
            sa.Column('severity_focus', sa.JSON(), nullable=True),
            sa.Column('icon', sa.String(50), nullable=True),
            sa.Column('tags', sa.JSON(), nullable=True),
            sa.Column('is_system', sa.Boolean(), default=False),
            sa.Column('is_active', sa.Boolean(), default=True),
            sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_opencode_skills_category', 'opencode_skills', ['category'])

    # ─── mcp_tool_configs ────────────────────────────────────────
    if 'mcp_tool_configs' not in existing_tables:
        op.create_table(
            'mcp_tool_configs',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('name', sa.String(100), nullable=False, unique=True),
            sa.Column('display_name', sa.String(255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('transport_type', sa.String(20), default='http'),
            sa.Column('server_url', sa.String(500), nullable=True),
            sa.Column('command', sa.String(500), nullable=True),
            sa.Column('args', sa.JSON(), nullable=True),
            sa.Column('env_vars', sa.JSON(), nullable=True),
            sa.Column('timeout_seconds', sa.Integer(), default=30),
            sa.Column('capabilities', sa.JSON(), nullable=True),
            sa.Column('icon', sa.String(50), nullable=True),
            sa.Column('is_active', sa.Boolean(), default=True),
            sa.Column('is_system', sa.Boolean(), default=False),
            sa.Column('last_test_status', sa.String(20), nullable=True),
            sa.Column('last_tested_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )

    # ─── opencode_projects ───────────────────────────────────────
    if 'opencode_projects' not in existing_tables:
        op.create_table(
            'opencode_projects',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=True),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('code_path', sa.String(500), nullable=False),
            sa.Column('port', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(30), default='stopped'),
            sa.Column('server_pid', sa.Integer(), nullable=True),
            sa.Column('last_health_check', sa.DateTime(timezone=True), nullable=True),
            sa.Column('health_check_error', sa.Text(), nullable=True),
            sa.Column('selected_skills', sa.JSON(), nullable=True),
            sa.Column('selected_mcp_tools', sa.JSON(), nullable=True),
            sa.Column('audit_config', sa.JSON(), nullable=True),
            sa.Column('current_agent_task_id', sa.String(36), sa.ForeignKey('agent_tasks.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_opencode_projects_project_id', 'opencode_projects', ['project_id'])
        op.create_index('ix_opencode_projects_status', 'opencode_projects', ['status'])

    # ─── opencode_audit_sessions ─────────────────────────────────
    if 'opencode_audit_sessions' not in existing_tables:
        op.create_table(
            'opencode_audit_sessions',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('opencode_project_id', sa.String(36), sa.ForeignKey('opencode_projects.id', ondelete='CASCADE'), nullable=False),
            sa.Column('agent_task_id', sa.String(36), sa.ForeignKey('agent_tasks.id', ondelete='SET NULL'), nullable=True),
            sa.Column('skills_snapshot', sa.JSON(), nullable=True),
            sa.Column('mcp_snapshot', sa.JSON(), nullable=True),
            sa.Column('audit_config_snapshot', sa.JSON(), nullable=True),
            sa.Column('status', sa.String(30), default='pending'),
            sa.Column('opencode_session_id', sa.String(255), nullable=True),
            sa.Column('messages_count', sa.Integer(), default=0),
            sa.Column('findings_count', sa.Integer(), default=0),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_opencode_audit_sessions_project', 'opencode_audit_sessions', ['opencode_project_id'])

    # ─── issue_comments ──────────────────────────────────────────
    if 'issue_comments' not in existing_tables:
        op.create_table(
            'issue_comments',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('finding_id', sa.String(36), sa.ForeignKey('agent_findings.id', ondelete='CASCADE'), nullable=False),
            sa.Column('comment_type', sa.String(30), default='note'),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('from_status', sa.String(30), nullable=True),
            sa.Column('to_status', sa.String(30), nullable=True),
            sa.Column('author_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index('ix_issue_comments_finding_id', 'issue_comments', ['finding_id'])

    # ─── agent_findings 增强字段 ──────────────────────────────────
    findings_cols = [col['name'] for col in inspector.get_columns('agent_findings')]

    new_finding_cols = [
        ('reviewer_id', sa.String(36), {'nullable': True}),
        ('reviewed_at', sa.DateTime(timezone=True), {'nullable': True}),
        ('review_notes', sa.Text(), {'nullable': True}),
        ('assignee_id', sa.String(36), {'nullable': True}),
        ('assigned_at', sa.DateTime(timezone=True), {'nullable': True}),
        ('due_date', sa.Date(), {'nullable': True}),
        ('closed_at', sa.DateTime(timezone=True), {'nullable': True}),
        ('risk_accepted', sa.Boolean(), {'nullable': True, 'default': False}),
        ('external_id', sa.String(255), {'nullable': True}),
        ('external_url', sa.String(500), {'nullable': True}),
        ('comments_count', sa.Integer(), {'nullable': True, 'default': 0}),
    ]

    for col_name, col_type, col_kwargs in new_finding_cols:
        if col_name not in findings_cols:
            op.add_column('agent_findings', sa.Column(col_name, col_type, **col_kwargs))

    # Seed built-in skills
    _seed_builtin_skills(conn)


def _seed_builtin_skills(conn):
    """插入内置 Skills"""
    from sqlalchemy import text
    import json

    skills = [
        {
            "id": "skill-owasp-a01",
            "name": "owasp-a01-broken-access-control",
            "display_name": "OWASP A01: 访问控制缺陷检测",
            "description": "检测权限绕过、IDOR（不安全直接对象引用）、水平越权、垂直越权等访问控制漏洞",
            "category": "owasp",
            "system_prompt": """# OWASP A01: 访问控制缺陷 (Broken Access Control) 审计

## 审计目标
全面检测应用程序中的访问控制缺陷，包括：
- 未授权的功能访问（垂直越权）
- 访问其他用户数据（水平越权/IDOR）
- 不安全的直接对象引用
- CORS 配置不当
- 特权功能暴露

## 检测重点
1. **IDOR 漏洞**: 检查 URL/参数中的对象 ID 是否验证了所有权
   - 模式: `/api/users/{id}`, `/api/orders/{order_id}`, 文件路径等
   - 危险信号: 直接使用用户输入的 ID 查询数据库，未检查 owner
   
2. **权限检查缺失**: 敏感端点/函数是否有权限装饰器/中间件
   - 查找: `@require_auth`, `@login_required`, 中间件链等
   - 危险信号: 管理员功能无权限检查
   
3. **路径遍历**: 文件访问时是否限制在允许目录内

4. **CORS 配置**: `Access-Control-Allow-Origin: *` 与凭据组合

## 输出格式
每个发现报告包含:
- 漏洞类型和严重程度
- 具体文件路径和代码行号
- 易受攻击的代码片段
- 攻击场景说明
- 具体修复代码示例""",
            "vulnerability_types": json.dumps(["idor", "auth_bypass", "path_traversal"]),
            "icon": "Shield",
            "is_system": True,
            "is_active": True,
        },
        {
            "id": "skill-owasp-a03",
            "name": "owasp-a03-injection",
            "display_name": "OWASP A03: 注入漏洞检测",
            "description": "全面检测 SQL 注入、NoSQL 注入、命令注入、代码注入、SSTI 等注入类漏洞",
            "category": "owasp",
            "system_prompt": """# OWASP A03: 注入漏洞全面检测

## 审计目标
系统性检测所有形式的注入漏洞：
- SQL 注入（Classic, Blind, Time-based, OOB）
- NoSQL 注入（MongoDB, Redis 等）
- 命令注入（OS Command Injection）
- 代码注入（eval, exec, 动态代码执行）
- SSTI（服务端模板注入）
- LDAP/XPath/CRLF 注入

## SQL 注入检测策略
1. **字符串拼接**: `f"SELECT * WHERE id={user_input}"` → 直接拼接
2. **格式化字符串**: `"SELECT %s" % value` → Python %格式化
3. **ORM 原生查询**: `session.execute(text(query))` → 原始 SQL
4. **参数化不足**: 检查所有 WHERE 条件的参数绑定

## 命令注入检测策略  
1. **subprocess.call/run/Popen**: 检查 `shell=True` 与用户输入组合
2. **os.system/os.popen**: 直接传入用户输入
3. **模板引擎**: Jinja2/Mako/Velocity 的 `{{}}`、`<%` 等与用户数据

## 输出格式
- 漏洞类型: 具体注入类型
- 严重程度: 基于可利用性评估
- 数据流: 从用户输入到危险函数的完整路径
- PoC 示例: 演示如何触发漏洞
- 修复方案: 参数化查询/命令白名单等""",
            "vulnerability_types": json.dumps(["sql_injection", "nosql_injection", "command_injection", "code_injection", "ssti"]),
            "icon": "Database",
            "is_system": True,
            "is_active": True,
        },
        {
            "id": "skill-owasp-a07",
            "name": "owasp-a07-auth-failures",
            "display_name": "OWASP A07: 认证失效检测",
            "description": "检测认证绕过、弱密码策略、会话管理缺陷、JWT 漏洞等认证相关问题",
            "category": "owasp",
            "system_prompt": """# OWASP A07: 认证与会话管理失效检测

## 审计目标
检测身份认证和会话管理中的缺陷：
- 认证逻辑绕过
- 弱密码/默认凭据
- JWT 配置错误（弱密钥、算法混淆）
- 会话固定/劫持
- 密码重置流程缺陷
- 多因素认证绕过

## 检测重点
1. **JWT 安全性**
   - `algorithm="none"` 或不验证签名
   - 弱密钥（< 256 bits）
   - 缺少过期时间验证
   
2. **密码处理**
   - 明文存储或弱哈希（MD5/SHA1）
   - 密码强度未验证
   - 密码重置令牌可预测
   
3. **会话管理**
   - 登录后未更新 Session ID
   - 注销时未销毁服务端 Session
   - Session 超时设置不合理""",
            "vulnerability_types": json.dumps(["auth_bypass", "weak_crypto", "sensitive_data_exposure"]),
            "icon": "Lock",
            "is_system": True,
            "is_active": True,
        },
        {
            "id": "skill-owasp-a02",
            "name": "owasp-a02-crypto-failures",
            "display_name": "OWASP A02: 加密失效检测",
            "description": "检测弱加密算法、硬编码密钥、明文传输敏感数据等加密相关漏洞",
            "category": "owasp",
            "system_prompt": """# OWASP A02: 加密失效检测

## 审计目标
发现加密和敏感数据保护中的缺陷：
- 弱加密算法（DES, MD5, SHA1）
- 硬编码密钥/密码/API Key
- 不安全的随机数生成
- 明文存储/传输敏感数据

## 检测重点
1. **硬编码机密**: 在代码中搜索 API_KEY, PASSWORD, SECRET, TOKEN 等
2. **弱哈希**: hashlib.md5(), hashlib.sha1() 用于密码
3. **弱加密**: DES, 3DES, RC4, ECB 模式
4. **不安全随机**: random.random() 用于安全场景
5. **HTTP 传输**: 敏感数据通过 HTTP 而非 HTTPS 传输""",
            "vulnerability_types": json.dumps(["hardcoded_secret", "weak_crypto", "sensitive_data_exposure"]),
            "icon": "Key",
            "is_system": True,
            "is_active": True,
        },
        {
            "id": "skill-owasp-a10",
            "name": "owasp-a10-ssrf",
            "display_name": "OWASP A10: SSRF 检测",
            "description": "检测服务端请求伪造（SSRF）漏洞，包括内网探测、云元数据访问等",
            "category": "owasp",
            "system_prompt": """# OWASP A10: 服务端请求伪造（SSRF）检测

## 审计目标
全面检测 SSRF 漏洞：
- 基础 SSRF（直接访问内网）
- 盲 SSRF（通过 DNS/时序判断）
- 云元数据 SSRF（AWS/GCP/Azure metadata）

## 检测重点
1. **HTTP 请求触发点**: requests.get(user_url), urllib.urlopen(url) 等
2. **URL 验证缺失**: 未校验目标地址的协议/域名/IP
3. **内网地址访问**: 允许请求 10.x, 172.16.x, 192.168.x, localhost
4. **文件协议**: file://, dict://, gopher:// 等危险协议
5. **重定向跟随**: 允许重定向到内网地址""",
            "vulnerability_types": json.dumps(["ssrf"]),
            "icon": "Globe",
            "is_system": True,
            "is_active": True,
        },
        {
            "id": "skill-framework-django",
            "name": "framework-django-security",
            "display_name": "Django 框架安全审计",
            "description": "针对 Django 框架的专项安全审计：ORM 注入、CSRF、settings 配置、中间件安全",
            "category": "framework",
            "system_prompt": """# Django 框架专项安全审计

## 审计目标
检测 Django 应用特有的安全问题：
- Django ORM 原始查询注入
- CSRF 保护缺失/绕过
- settings.py 危险配置
- 模板注入（Django Templates）
- 权限装饰器使用不当

## Django 特定检测点
1. **ORM 安全**: extra(), raw(), RawSQL() 的不安全使用
2. **CSRF**: @csrf_exempt 的过度使用，自定义 exempt 逻辑
3. **settings 配置**: DEBUG=True, ALLOWED_HOSTS=*, SECRET_KEY 硬编码
4. **认证**: @login_required 缺失，permission_required 配置
5. **文件上传**: FileField 的 MEDIA 目录服务、文件类型验证""",
            "vulnerability_types": json.dumps(["sql_injection", "xss", "auth_bypass"]),
            "icon": "Code2",
            "is_system": True,
            "is_active": True,
        },
        {
            "id": "skill-framework-fastapi",
            "name": "framework-fastapi-security",
            "display_name": "FastAPI 框架安全审计",
            "description": "针对 FastAPI 框架的专项安全审计：Pydantic 验证、依赖注入权限、路由安全",
            "category": "framework",
            "system_prompt": """# FastAPI 框架专项安全审计

## 审计目标
检测 FastAPI 应用特有的安全问题：
- 依赖注入认证/授权缺失
- Pydantic 模型过宽松验证
- 路由级别的权限控制
- OpenAPI 文档信息泄露

## FastAPI 特定检测点
1. **依赖注入安全**: Depends() 中的认证依赖是否完整
2. **Pydantic 验证**: 字段类型过宽、缺少 validator
3. **路由权限**: 敏感路由是否有 dependencies=[Depends(get_current_user)]
4. **CORS 配置**: allow_origins=["*"] 与 allow_credentials=True 组合
5. **文件上传**: UploadFile 的大小限制、类型验证""",
            "vulnerability_types": json.dumps(["auth_bypass", "idor", "sensitive_data_exposure"]),
            "icon": "Zap",
            "is_system": True,
            "is_active": True,
        },
        {
            "id": "skill-biz-hardcoded-secrets",
            "name": "business-hardcoded-secrets",
            "display_name": "硬编码机密信息检测",
            "description": "深度搜索代码中的 API Key、密码、Token、私钥等硬编码机密信息",
            "category": "business",
            "system_prompt": """# 硬编码机密信息深度检测

## 审计目标
在代码库中发现所有形式的硬编码机密：
- API Keys（OpenAI, AWS, GitHub 等）
- 数据库密码
- JWT Secret Keys
- 私钥/证书
- OAuth 客户端机密

## 检测策略
1. **高熵字符串**: 长度 > 20 的随机字符串
2. **模式匹配**: sk-xxx, AKIA, ghp_, eyJ 等已知前缀
3. **变量名提示**: password, secret, key, token, credential 相关变量
4. **配置文件**: .env, config.py, settings.py 中的硬编码值
5. **测试代码**: 测试中泄露的真实凭据

## 排除假阳性
- 示例/占位符值（your-api-key-here）
- 测试用的已知弱密码（test123）
- 注释中的说明""",
            "vulnerability_types": json.dumps(["hardcoded_secret", "sensitive_data_exposure"]),
            "icon": "KeyRound",
            "is_system": True,
            "is_active": True,
        },
    ]

    existing = set(row[0] for row in conn.execute(text("SELECT id FROM opencode_skills")).fetchall())

    for skill in skills:
        if skill["id"] not in existing:
            conn.execute(
                text("""
                    INSERT INTO opencode_skills
                        (id, name, display_name, description, category,
                         system_prompt, vulnerability_types, icon, is_system, is_active)
                    VALUES
                        (:id, :name, :display_name, :description, :category,
                         :system_prompt, :vulnerability_types, :icon, :is_system, :is_active)
                """),
                {
                    "id": skill["id"],
                    "name": skill["name"],
                    "display_name": skill["display_name"],
                    "description": skill["description"],
                    "category": skill["category"],
                    "system_prompt": skill["system_prompt"],
                    "vulnerability_types": skill["vulnerability_types"],
                    "icon": skill["icon"],
                    "is_system": skill["is_system"],
                    "is_active": skill["is_active"],
                }
            )


def downgrade() -> None:
    op.drop_table('issue_comments')
    op.drop_table('opencode_audit_sessions')
    op.drop_table('opencode_projects')
    op.drop_table('mcp_tool_configs')
    op.drop_table('opencode_skills')

    for col in ['reviewer_id', 'reviewed_at', 'review_notes', 'assignee_id',
                'assigned_at', 'due_date', 'closed_at', 'risk_accepted',
                'external_id', 'external_url', 'comments_count']:
        try:
            op.drop_column('agent_findings', col)
        except Exception:
            pass
