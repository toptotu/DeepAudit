"""
OpenCode Agent 审计集成模型

支持:
- OpenCode 审计项目管理（进程级隔离）
- Skills 库（可注入的审计技能）
- MCP 工具配置
- 问题评论与闭环流程
"""

import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, String, Integer, Boolean, Text, DateTime,
    ForeignKey, JSON, Date
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class OpenCodeServerStatus:
    """OpenCode 服务器状态"""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    AUDITING = "auditing"
    STOPPING = "stopping"
    ERROR = "error"


class OpenCodeProject(Base):
    """
    OpenCode 审计项目

    每个项目对应一个独立的 OpenCode 服务进程，
    通过端口隔离实现多项目并行审计。
    """
    __tablename__ = "opencode_projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # OpenCode 服务器配置
    code_path = Column(String(500), nullable=False)
    port = Column(Integer, nullable=True)
    status = Column(String(30), default=OpenCodeServerStatus.STOPPED, index=True)
    server_pid = Column(Integer, nullable=True)
    last_health_check = Column(DateTime(timezone=True), nullable=True)
    health_check_error = Column(Text, nullable=True)

    # 审计配置
    selected_skills = Column(JSON, nullable=True, default=list)
    selected_mcp_tools = Column(JSON, nullable=True, default=list)
    audit_config = Column(JSON, nullable=True)

    # 当前/最近审计任务
    current_agent_task_id = Column(
        String(36),
        ForeignKey("agent_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )

    # 元数据
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关联关系
    project = relationship("Project", foreign_keys=[project_id])
    creator = relationship("User", foreign_keys=[created_by])
    audit_sessions = relationship(
        "OpenCodeAuditSession",
        back_populates="opencode_project",
        cascade="all, delete-orphan",
        order_by="OpenCodeAuditSession.created_at.desc()",
    )

    def __repr__(self):
        return f"<OpenCodeProject {self.name} [{self.status}]>"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "name": self.name,
            "description": self.description,
            "code_path": self.code_path,
            "port": self.port,
            "status": self.status,
            "server_pid": self.server_pid,
            "selected_skills": self.selected_skills or [],
            "selected_mcp_tools": self.selected_mcp_tools or [],
            "audit_config": self.audit_config,
            "current_agent_task_id": self.current_agent_task_id,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class OpenCodeAuditSession(Base):
    """OpenCode 审计会话记录"""
    __tablename__ = "opencode_audit_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    opencode_project_id = Column(
        String(36),
        ForeignKey("opencode_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agent_task_id = Column(
        String(36),
        ForeignKey("agent_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # 会话配置快照（审计时使用的 skills 和 MCP）
    skills_snapshot = Column(JSON, nullable=True)
    mcp_snapshot = Column(JSON, nullable=True)
    audit_config_snapshot = Column(JSON, nullable=True)

    # 会话状态
    status = Column(String(30), default="pending")
    opencode_session_id = Column(String(255), nullable=True)

    # 统计
    messages_count = Column(Integer, default=0)
    findings_count = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # 关联关系
    opencode_project = relationship("OpenCodeProject", back_populates="audit_sessions")

    def __repr__(self):
        return f"<OpenCodeAuditSession {self.id} [{self.status}]>"


class SkillCategory:
    """Skill 分类"""
    OWASP = "owasp"
    FRAMEWORK = "framework"
    BUSINESS = "business"
    COMPLIANCE = "compliance"
    CUSTOM = "custom"


class OpenCodeSkill(Base):
    """
    OpenCode 审计技能

    Skill 是可注入到 OpenCode 的结构化审计能力描述，
    通过系统提示词告诉 AI 关注哪类安全问题。
    """
    __tablename__ = "opencode_skills"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False, unique=True)
    display_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), default=SkillCategory.CUSTOM, index=True)

    # Skill 核心内容
    system_prompt = Column(Text, nullable=False)
    tool_hints = Column(JSON, nullable=True)
    vulnerability_types = Column(JSON, nullable=True)
    severity_focus = Column(JSON, nullable=True)

    # 显示信息
    icon = Column(String(50), nullable=True)
    tags = Column(JSON, nullable=True, default=list)

    # 状态
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<OpenCodeSkill {self.name}>"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "category": self.category,
            "system_prompt": self.system_prompt,
            "tool_hints": self.tool_hints,
            "vulnerability_types": self.vulnerability_types or [],
            "severity_focus": self.severity_focus,
            "icon": self.icon,
            "tags": self.tags or [],
            "is_system": self.is_system,
            "is_active": self.is_active,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class MCPTransportType:
    """MCP 传输类型"""
    HTTP = "http"
    STDIO = "stdio"
    SSE = "sse"


class MCPToolConfig(Base):
    """
    MCP 工具配置

    支持通过 Model Context Protocol 扩展 OpenCode 的工具能力。
    """
    __tablename__ = "mcp_tool_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False, unique=True)
    display_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # 连接配置
    transport_type = Column(String(20), default=MCPTransportType.HTTP)
    server_url = Column(String(500), nullable=True)
    command = Column(String(500), nullable=True)
    args = Column(JSON, nullable=True, default=list)
    env_vars = Column(JSON, nullable=True, default=dict)
    timeout_seconds = Column(Integer, default=30)

    # 工具能力描述
    capabilities = Column(JSON, nullable=True, default=list)
    icon = Column(String(50), nullable=True)

    # 状态
    is_active = Column(Boolean, default=True)
    is_system = Column(Boolean, default=False)
    last_test_status = Column(String(20), nullable=True)
    last_tested_at = Column(DateTime(timezone=True), nullable=True)

    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<MCPToolConfig {self.name} [{self.transport_type}]>"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "transport_type": self.transport_type,
            "server_url": self.server_url,
            "command": self.command,
            "args": self.args or [],
            "env_vars": self.env_vars or {},
            "timeout_seconds": self.timeout_seconds,
            "capabilities": self.capabilities or [],
            "icon": self.icon,
            "is_active": self.is_active,
            "is_system": self.is_system,
            "last_test_status": self.last_test_status,
            "last_tested_at": self.last_tested_at.isoformat() if self.last_tested_at else None,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class IssueCommentType:
    """问题评论类型（同时驱动状态机）"""
    NOTE = "note"
    CONFIRM = "confirm"
    REJECT = "reject"
    ASSIGN = "assign"
    FIX = "fix"
    VERIFY = "verify"
    REOPEN = "reopen"
    ACCEPT_RISK = "accept_risk"


class IssueComment(Base):
    """
    问题评论

    支持对 AgentFinding 的评论、确认、分配、关闭等操作，
    构建完整的问题闭环管理流程。
    """
    __tablename__ = "issue_comments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    finding_id = Column(
        String(36),
        ForeignKey("agent_findings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # 评论内容
    comment_type = Column(String(30), default=IssueCommentType.NOTE)
    content = Column(Text, nullable=False)

    # 状态变更记录
    from_status = Column(String(30), nullable=True)
    to_status = Column(String(30), nullable=True)

    # 作者信息
    author_id = Column(String(36), ForeignKey("users.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关联关系
    author = relationship("User", foreign_keys=[author_id])
    finding = relationship("AgentFinding", foreign_keys=[finding_id])

    def __repr__(self):
        return f"<IssueComment {self.comment_type} on {self.finding_id}>"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "finding_id": self.finding_id,
            "comment_type": self.comment_type,
            "content": self.content,
            "from_status": self.from_status,
            "to_status": self.to_status,
            "author_id": self.author_id,
            "author_name": self.author.full_name if self.author else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
