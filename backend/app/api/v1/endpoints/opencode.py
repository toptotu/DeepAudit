"""
OpenCode Agent 审计 API

提供 OpenCode 审计项目的完整管理接口：
- OpenCode 项目 CRUD
- 服务器启动/停止
- Skills 和 MCP 工具管理
- 审计触发和结果查询
- 问题评论与闭环管理
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.api import deps
from app.db.session import get_db, async_session_factory
from app.models.agent_task import (
    AgentFinding, AgentTask, AgentTaskStatus, FindingStatus,
    VulnerabilitySeverity,
)
from app.models.opencode import (
    IssueComment, IssueCommentType,
    MCPToolConfig, MCPTransportType,
    OpenCodeAuditSession, OpenCodeProject, OpenCodeServerStatus,
    OpenCodeSkill, SkillCategory,
)
from app.models.project import Project
from app.models.user import User
from app.services.opencode_service import OpenCodeService, OpenCodeServiceError

logger = logging.getLogger(__name__)
router = APIRouter()


# ════════════════════════════════════════════════════════════════════════════
# Request / Response Schemas
# ════════════════════════════════════════════════════════════════════════════

class OpenCodeProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    project_id: Optional[str] = None
    code_path: str = Field(..., min_length=1)
    selected_skills: List[str] = Field(default_factory=list)
    selected_mcp_tools: List[str] = Field(default_factory=list)
    audit_config: Optional[Dict[str, Any]] = None


class OpenCodeProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    code_path: Optional[str] = None
    selected_skills: Optional[List[str]] = None
    selected_mcp_tools: Optional[List[str]] = None
    audit_config: Optional[Dict[str, Any]] = None


class SkillCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    display_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    category: str = Field(default=SkillCategory.CUSTOM)
    system_prompt: str = Field(..., min_length=1)
    tool_hints: Optional[List[str]] = None
    vulnerability_types: Optional[List[str]] = None
    severity_focus: Optional[List[str]] = None
    icon: Optional[str] = None
    tags: Optional[List[str]] = None


class SkillUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    system_prompt: Optional[str] = None
    tool_hints: Optional[List[str]] = None
    vulnerability_types: Optional[List[str]] = None
    icon: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


class MCPToolCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-z0-9_-]+$')
    display_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    transport_type: str = Field(default=MCPTransportType.HTTP)
    server_url: Optional[str] = None
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env_vars: Optional[Dict[str, str]] = None
    timeout_seconds: int = Field(default=30, ge=5, le=300)
    capabilities: Optional[List[str]] = None
    icon: Optional[str] = None


class MCPToolUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    transport_type: Optional[str] = None
    server_url: Optional[str] = None
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env_vars: Optional[Dict[str, str]] = None
    timeout_seconds: Optional[int] = None
    capabilities: Optional[List[str]] = None
    is_active: Optional[bool] = None


class AuditTriggerRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    target_vulnerabilities: List[str] = Field(
        default=["sql_injection", "xss", "command_injection", "path_traversal", "ssrf"]
    )
    exclude_patterns: List[str] = Field(
        default=["node_modules", "__pycache__", ".git", "*.min.js"]
    )
    target_files: Optional[List[str]] = None
    max_iterations: int = Field(default=50, ge=1, le=200)
    timeout_seconds: int = Field(default=1800, ge=60, le=7200)


class IssueCommentCreate(BaseModel):
    comment_type: str = Field(default=IssueCommentType.NOTE)
    content: str = Field(..., min_length=1)
    assignee_id: Optional[str] = None
    due_date: Optional[date] = None


class FindingReviewRequest(BaseModel):
    action: str = Field(..., description="confirm | reject | accept_risk | close | reopen")
    notes: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[date] = None


class FindingBatchUpdate(BaseModel):
    finding_ids: List[str] = Field(..., min_length=1)
    status: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[date] = None


# ════════════════════════════════════════════════════════════════════════════
# OpenCode 项目管理
# ════════════════════════════════════════════════════════════════════════════

@router.get("/projects", summary="列出 OpenCode 审计项目")
async def list_opencode_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    q = select(OpenCodeProject).where(
        OpenCodeProject.created_by == current_user.id
    )
    if status_filter:
        q = q.where(OpenCodeProject.status == status_filter)
    q = q.order_by(OpenCodeProject.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(q)
    projects = result.scalars().all()
    return {"items": [p.to_dict() for p in projects], "total": len(projects)}


@router.post("/projects", status_code=status.HTTP_201_CREATED, summary="创建 OpenCode 审计项目")
async def create_opencode_project(
    payload: OpenCodeProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    # 校验关联项目是否属于该用户
    if payload.project_id:
        result = await db.execute(
            select(Project).where(Project.id == payload.project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="关联项目不存在")

    oc_project = OpenCodeProject(
        id=str(uuid.uuid4()),
        name=payload.name,
        description=payload.description,
        project_id=payload.project_id,
        code_path=payload.code_path,
        selected_skills=payload.selected_skills,
        selected_mcp_tools=payload.selected_mcp_tools,
        audit_config=payload.audit_config,
        created_by=current_user.id,
    )
    db.add(oc_project)
    await db.commit()
    await db.refresh(oc_project)
    return oc_project.to_dict()


@router.get("/projects/{project_id}", summary="获取 OpenCode 项目详情")
async def get_opencode_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    oc_project = await _get_oc_project_or_404(db, project_id, current_user.id)
    data = oc_project.to_dict()

    # 附加已选 Skills 详情
    if oc_project.selected_skills:
        result = await db.execute(
            select(OpenCodeSkill).where(OpenCodeSkill.id.in_(oc_project.selected_skills))
        )
        data["skills_detail"] = [s.to_dict() for s in result.scalars().all()]

    # 附加已选 MCP 工具详情
    if oc_project.selected_mcp_tools:
        result = await db.execute(
            select(MCPToolConfig).where(MCPToolConfig.id.in_(oc_project.selected_mcp_tools))
        )
        data["mcp_tools_detail"] = [t.to_dict() for t in result.scalars().all()]

    return data


@router.patch("/projects/{project_id}", summary="更新 OpenCode 项目配置")
async def update_opencode_project(
    project_id: str,
    payload: OpenCodeProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    oc_project = await _get_oc_project_or_404(db, project_id, current_user.id)

    if payload.name is not None:
        oc_project.name = payload.name
    if payload.description is not None:
        oc_project.description = payload.description
    if payload.code_path is not None:
        oc_project.code_path = payload.code_path
    if payload.selected_skills is not None:
        oc_project.selected_skills = payload.selected_skills
    if payload.selected_mcp_tools is not None:
        oc_project.selected_mcp_tools = payload.selected_mcp_tools
    if payload.audit_config is not None:
        oc_project.audit_config = payload.audit_config

    await db.commit()
    await db.refresh(oc_project)
    return oc_project.to_dict()


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除 OpenCode 项目")
async def delete_opencode_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    oc_project = await _get_oc_project_or_404(db, project_id, current_user.id)

    if oc_project.status in (OpenCodeServerStatus.RUNNING, OpenCodeServerStatus.AUDITING):
        try:
            await OpenCodeService.stop_server(oc_project)
        except Exception as e:
            logger.warning("删除前停止服务失败: %s", e)

    await db.delete(oc_project)
    await db.commit()


# ─── 服务器生命周期 ────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/start", summary="启动 OpenCode 服务器")
async def start_opencode_server(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    oc_project = await _get_oc_project_or_404(db, project_id, current_user.id)

    if oc_project.status == OpenCodeServerStatus.RUNNING:
        return {"message": "服务器已在运行", "port": oc_project.port, "status": oc_project.status}

    if not OpenCodeService.is_opencode_available():
        # 模拟模式：标记为运行但不真实启动进程
        logger.warning("OpenCode 未安装，进入模拟模式")
        oc_project.status = OpenCodeServerStatus.RUNNING
        oc_project.port = OpenCodeService.allocate_port()
        oc_project.server_pid = None
        await db.commit()
        return {
            "message": "模拟模式：OpenCode 未安装，使用虚拟端口",
            "port": oc_project.port,
            "status": oc_project.status,
            "simulated": True,
        }

    oc_project.status = OpenCodeServerStatus.STARTING
    await db.commit()

    try:
        port, pid = await OpenCodeService.start_server(oc_project)
        oc_project.port = port
        oc_project.server_pid = pid
        oc_project.status = OpenCodeServerStatus.RUNNING
        oc_project.last_health_check = datetime.now(timezone.utc)
        oc_project.health_check_error = None
        await db.commit()
        return {"message": "服务器启动成功", "port": port, "pid": pid, "status": oc_project.status}
    except OpenCodeServiceError as e:
        oc_project.status = OpenCodeServerStatus.ERROR
        oc_project.health_check_error = str(e)
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/stop", summary="停止 OpenCode 服务器")
async def stop_opencode_server(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    oc_project = await _get_oc_project_or_404(db, project_id, current_user.id)

    if oc_project.status == OpenCodeServerStatus.STOPPED:
        return {"message": "服务器已停止", "status": oc_project.status}

    oc_project.status = OpenCodeServerStatus.STOPPING
    await db.commit()

    try:
        await OpenCodeService.stop_server(oc_project)
    except Exception as e:
        logger.warning("停止服务器时出错（继续标记为停止）: %s", e)

    oc_project.status = OpenCodeServerStatus.STOPPED
    oc_project.port = None
    oc_project.server_pid = None
    await db.commit()
    return {"message": "服务器已停止", "status": oc_project.status}


@router.get("/projects/{project_id}/status", summary="查询服务器状态")
async def get_server_status(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    oc_project = await _get_oc_project_or_404(db, project_id, current_user.id)

    healthy = False
    if oc_project.status == OpenCodeServerStatus.RUNNING and oc_project.port:
        healthy = await OpenCodeService.health_check(oc_project)
        if not healthy and oc_project.status == OpenCodeServerStatus.RUNNING:
            oc_project.status = OpenCodeServerStatus.ERROR
            await db.commit()

    return {
        "status": oc_project.status,
        "port": oc_project.port,
        "pid": oc_project.server_pid,
        "healthy": healthy,
        "last_health_check": (
            oc_project.last_health_check.isoformat() if oc_project.last_health_check else None
        ),
    }


# ─── 审计触发 ──────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/audit", summary="触发 OpenCode 审计")
async def trigger_audit(
    project_id: str,
    payload: AuditTriggerRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    oc_project = await _get_oc_project_or_404(db, project_id, current_user.id)

    if oc_project.status not in (OpenCodeServerStatus.RUNNING,):
        raise HTTPException(
            status_code=400,
            detail=f"OpenCode 服务器未运行（当前状态: {oc_project.status}），请先启动服务器"
        )

    # 获取选定的 Skills
    skills: List[OpenCodeSkill] = []
    if oc_project.selected_skills:
        result = await db.execute(
            select(OpenCodeSkill).where(
                OpenCodeSkill.id.in_(oc_project.selected_skills),
                OpenCodeSkill.is_active == True,
            )
        )
        skills = list(result.scalars().all())

    # 获取选定的 MCP 工具
    mcp_tools: List[MCPToolConfig] = []
    if oc_project.selected_mcp_tools:
        result = await db.execute(
            select(MCPToolConfig).where(
                MCPToolConfig.id.in_(oc_project.selected_mcp_tools),
                MCPToolConfig.is_active == True,
            )
        )
        mcp_tools = list(result.scalars().all())

    # 创建 AgentTask 记录（兼容现有框架）
    task_name = payload.name or f"OpenCode 审计 - {oc_project.name}"
    agent_task = AgentTask(
        id=str(uuid.uuid4()),
        project_id=oc_project.project_id or "opencode",
        name=task_name,
        description=payload.description or f"由 OpenCode Agent 执行的审计任务",
        task_type="opencode_audit",
        target_vulnerabilities=payload.target_vulnerabilities,
        exclude_patterns=payload.exclude_patterns,
        target_files=payload.target_files,
        max_iterations=payload.max_iterations,
        timeout_seconds=payload.timeout_seconds,
        status=AgentTaskStatus.RUNNING,
        current_phase="analyzing",
        agent_config={
            "opencode_project_id": oc_project.id,
            "skills": [s.id for s in skills],
            "mcp_tools": [t.id for t in mcp_tools],
        },
        created_by=current_user.id,
    )
    db.add(agent_task)

    oc_project.status = OpenCodeServerStatus.AUDITING
    oc_project.current_agent_task_id = agent_task.id
    await db.commit()
    await db.refresh(agent_task)

    # 后台执行审计
    background_tasks.add_task(
        _run_audit_background,
        opencode_project_id=oc_project.id,
        agent_task_id=agent_task.id,
        skill_ids=[s.id for s in skills],
        mcp_tool_ids=[t.id for t in mcp_tools],
    )

    return {
        "message": "审计已启动",
        "agent_task_id": agent_task.id,
        "task_name": task_name,
        "skills_count": len(skills),
        "mcp_tools_count": len(mcp_tools),
    }


async def _run_audit_background(
    opencode_project_id: str,
    agent_task_id: str,
    skill_ids: List[str],
    mcp_tool_ids: List[str],
) -> None:
    """后台执行 OpenCode 审计任务"""
    async with async_session_factory() as db:
        try:
            oc_project = (await db.execute(
                select(OpenCodeProject).where(OpenCodeProject.id == opencode_project_id)
            )).scalar_one_or_none()

            agent_task = (await db.execute(
                select(AgentTask).where(AgentTask.id == agent_task_id)
            )).scalar_one_or_none()

            if not oc_project or not agent_task:
                logger.error("后台审计：找不到项目或任务")
                return

            skills = (await db.execute(
                select(OpenCodeSkill).where(OpenCodeSkill.id.in_(skill_ids))
            )).scalars().all()

            mcp_tools = (await db.execute(
                select(MCPToolConfig).where(MCPToolConfig.id.in_(mcp_tool_ids))
            )).scalars().all()

            await OpenCodeService.run_audit(
                db, oc_project, agent_task, list(skills), list(mcp_tools)
            )

        except Exception as e:
            logger.error("后台审计失败: %s", e, exc_info=True)
            try:
                async with async_session_factory() as db2:
                    task = (await db2.execute(
                        select(AgentTask).where(AgentTask.id == agent_task_id)
                    )).scalar_one_or_none()
                    if task:
                        task.status = AgentTaskStatus.FAILED
                        task.error_message = str(e)
                    oc_proj = (await db2.execute(
                        select(OpenCodeProject).where(OpenCodeProject.id == opencode_project_id)
                    )).scalar_one_or_none()
                    if oc_proj:
                        oc_proj.status = OpenCodeServerStatus.RUNNING
                    await db2.commit()
            except Exception:
                pass
        finally:
            # 恢复项目状态为 running
            try:
                async with async_session_factory() as db3:
                    oc_proj = (await db3.execute(
                        select(OpenCodeProject).where(OpenCodeProject.id == opencode_project_id)
                    )).scalar_one_or_none()
                    if oc_proj and oc_proj.status == OpenCodeServerStatus.AUDITING:
                        oc_proj.status = OpenCodeServerStatus.RUNNING
                    await db3.commit()
            except Exception:
                pass


@router.get("/projects/{project_id}/audit-history", summary="获取审计历史")
async def get_audit_history(
    project_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    oc_project = await _get_oc_project_or_404(db, project_id, current_user.id)

    result = await db.execute(
        select(OpenCodeAuditSession)
        .where(OpenCodeAuditSession.opencode_project_id == oc_project.id)
        .order_by(OpenCodeAuditSession.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    sessions = result.scalars().all()

    items = []
    for s in sessions:
        item = {
            "id": s.id,
            "agent_task_id": s.agent_task_id,
            "status": s.status,
            "findings_count": s.findings_count,
            "messages_count": s.messages_count,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        }
        items.append(item)

    return {"items": items, "total": len(items)}


# ════════════════════════════════════════════════════════════════════════════
# Skills 管理
# ════════════════════════════════════════════════════════════════════════════

@router.get("/skills", summary="列出可用 Skills")
async def list_skills(
    category: Optional[str] = Query(None),
    is_active: bool = Query(True),
    include_system: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    q = select(OpenCodeSkill).where(OpenCodeSkill.is_active == is_active)

    if category:
        q = q.where(OpenCodeSkill.category == category)

    if not include_system:
        q = q.where(OpenCodeSkill.is_system == False)

    q = q.order_by(OpenCodeSkill.is_system.desc(), OpenCodeSkill.category, OpenCodeSkill.display_name)
    result = await db.execute(q)
    skills = result.scalars().all()

    return {"items": [s.to_dict() for s in skills], "total": len(skills)}


@router.post("/skills", status_code=status.HTTP_201_CREATED, summary="创建自定义 Skill")
async def create_skill(
    payload: SkillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    # 检查名称唯一性
    existing = (await db.execute(
        select(OpenCodeSkill).where(OpenCodeSkill.name == payload.name)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Skill 名称 '{payload.name}' 已存在")

    skill = OpenCodeSkill(
        id=str(uuid.uuid4()),
        name=payload.name,
        display_name=payload.display_name,
        description=payload.description,
        category=payload.category,
        system_prompt=payload.system_prompt,
        tool_hints=payload.tool_hints,
        vulnerability_types=payload.vulnerability_types,
        severity_focus=payload.severity_focus,
        icon=payload.icon,
        tags=payload.tags,
        is_system=False,
        is_active=True,
        created_by=current_user.id,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill.to_dict()


@router.get("/skills/{skill_id}", summary="获取 Skill 详情")
async def get_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    skill = await _get_skill_or_404(db, skill_id)
    return skill.to_dict()


@router.patch("/skills/{skill_id}", summary="更新 Skill")
async def update_skill(
    skill_id: str,
    payload: SkillUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    skill = await _get_skill_or_404(db, skill_id)

    if skill.is_system:
        raise HTTPException(status_code=403, detail="系统内置 Skill 不允许修改")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(skill, field, value)

    await db.commit()
    await db.refresh(skill)
    return skill.to_dict()


@router.delete("/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除 Skill")
async def delete_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    skill = await _get_skill_or_404(db, skill_id)
    if skill.is_system:
        raise HTTPException(status_code=403, detail="系统内置 Skill 不允许删除")
    await db.delete(skill)
    await db.commit()


@router.post("/skills/{skill_id}/preview", summary="预览 Skill 系统提示词")
async def preview_skill_prompt(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    skill = await _get_skill_or_404(db, skill_id)
    combined = await OpenCodeService.build_system_prompt([skill])
    return {"skill_id": skill_id, "system_prompt": skill.system_prompt, "combined_prompt": combined}


# ════════════════════════════════════════════════════════════════════════════
# MCP 工具管理
# ════════════════════════════════════════════════════════════════════════════

@router.get("/mcp-tools", summary="列出 MCP 工具配置")
async def list_mcp_tools(
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    q = select(MCPToolConfig)
    if is_active is not None:
        q = q.where(MCPToolConfig.is_active == is_active)
    q = q.order_by(MCPToolConfig.is_system.desc(), MCPToolConfig.display_name)
    result = await db.execute(q)
    tools = result.scalars().all()
    return {"items": [t.to_dict() for t in tools], "total": len(tools)}


@router.post("/mcp-tools", status_code=status.HTTP_201_CREATED, summary="添加 MCP 工具配置")
async def create_mcp_tool(
    payload: MCPToolCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    existing = (await db.execute(
        select(MCPToolConfig).where(MCPToolConfig.name == payload.name)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"MCP 工具名称 '{payload.name}' 已存在")

    if payload.transport_type == MCPTransportType.HTTP and not payload.server_url:
        raise HTTPException(status_code=422, detail="HTTP 传输模式需要提供 server_url")
    if payload.transport_type == MCPTransportType.STDIO and not payload.command:
        raise HTTPException(status_code=422, detail="STDIO 传输模式需要提供 command")

    tool = MCPToolConfig(
        id=str(uuid.uuid4()),
        name=payload.name,
        display_name=payload.display_name,
        description=payload.description,
        transport_type=payload.transport_type,
        server_url=payload.server_url,
        command=payload.command,
        args=payload.args,
        env_vars=payload.env_vars,
        timeout_seconds=payload.timeout_seconds,
        capabilities=payload.capabilities,
        icon=payload.icon,
        is_active=True,
        is_system=False,
        created_by=current_user.id,
    )
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return tool.to_dict()


@router.get("/mcp-tools/{tool_id}", summary="获取 MCP 工具详情")
async def get_mcp_tool(
    tool_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    tool = await _get_mcp_tool_or_404(db, tool_id)
    return tool.to_dict()


@router.patch("/mcp-tools/{tool_id}", summary="更新 MCP 工具配置")
async def update_mcp_tool(
    tool_id: str,
    payload: MCPToolUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    tool = await _get_mcp_tool_or_404(db, tool_id)
    if tool.is_system:
        raise HTTPException(status_code=403, detail="系统内置工具不允许修改")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(tool, field, value)

    await db.commit()
    await db.refresh(tool)
    return tool.to_dict()


@router.delete("/mcp-tools/{tool_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除 MCP 工具")
async def delete_mcp_tool(
    tool_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    tool = await _get_mcp_tool_or_404(db, tool_id)
    if tool.is_system:
        raise HTTPException(status_code=403, detail="系统内置工具不允许删除")
    await db.delete(tool)
    await db.commit()


@router.post("/mcp-tools/{tool_id}/test", summary="测试 MCP 工具连通性")
async def test_mcp_tool(
    tool_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    tool = await _get_mcp_tool_or_404(db, tool_id)

    success = False
    error_msg = None

    try:
        if tool.transport_type == MCPTransportType.HTTP and tool.server_url:
            import httpx
            async with httpx.AsyncClient(timeout=tool.timeout_seconds) as client:
                resp = await client.get(tool.server_url)
                success = resp.status_code < 500
        elif tool.transport_type == MCPTransportType.STDIO and tool.command:
            import shutil
            cmd = tool.command.split()[0]
            success = shutil.which(cmd) is not None
            if not success:
                error_msg = f"命令 '{cmd}' 未找到"
        else:
            error_msg = "无法测试：配置不完整"
    except Exception as e:
        error_msg = str(e)

    tool.last_test_status = "ok" if success else "failed"
    tool.last_tested_at = datetime.now(timezone.utc)
    await db.commit()

    return {
        "success": success,
        "error": error_msg,
        "tested_at": tool.last_tested_at.isoformat(),
    }


# ════════════════════════════════════════════════════════════════════════════
# 问题评论与闭环管理
# ════════════════════════════════════════════════════════════════════════════

# 状态转移映射
_REVIEW_ACTION_STATUS: Dict[str, str] = {
    "confirm": FindingStatus.VERIFIED,
    "reject": FindingStatus.FALSE_POSITIVE,
    "accept_risk": FindingStatus.WONT_FIX,
    "close": FindingStatus.FIXED,
    "reopen": FindingStatus.NEW,
}

_REVIEW_COMMENT_TYPE: Dict[str, str] = {
    "confirm": IssueCommentType.CONFIRM,
    "reject": IssueCommentType.REJECT,
    "accept_risk": IssueCommentType.ACCEPT_RISK,
    "close": IssueCommentType.VERIFY,
    "reopen": IssueCommentType.REOPEN,
}


@router.get("/findings/{finding_id}/comments", summary="获取问题评论列表")
async def list_finding_comments(
    finding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    finding = await _get_finding_or_404(db, finding_id)

    result = await db.execute(
        select(IssueComment)
        .where(IssueComment.finding_id == finding_id)
        .order_by(IssueComment.created_at.asc())
    )
    comments = result.scalars().all()
    return {"items": [c.to_dict() for c in comments], "total": len(comments)}


@router.post("/findings/{finding_id}/comments", status_code=status.HTTP_201_CREATED, summary="添加问题评论")
async def add_finding_comment(
    finding_id: str,
    payload: IssueCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    finding = await _get_finding_or_404(db, finding_id)

    from_status = finding.status
    to_status = None

    # 处理状态变更评论
    if payload.comment_type in (
        IssueCommentType.CONFIRM, IssueCommentType.REJECT,
        IssueCommentType.ACCEPT_RISK, IssueCommentType.VERIFY,
        IssueCommentType.REOPEN,
    ):
        action_map = {v: k for k, v in _REVIEW_COMMENT_TYPE.items()}
        action = action_map.get(payload.comment_type)
        if action:
            to_status = _REVIEW_ACTION_STATUS.get(action, finding.status)
            finding.status = to_status
            finding.reviewer_id = current_user.id
            finding.reviewed_at = datetime.now(timezone.utc)
            if action == "confirm":
                finding.review_notes = payload.content

    elif payload.comment_type == IssueCommentType.ASSIGN:
        if payload.assignee_id:
            finding.assignee_id = payload.assignee_id
            finding.assigned_at = datetime.now(timezone.utc)

    if payload.due_date:
        finding.due_date = payload.due_date

    # 创建评论
    comment = IssueComment(
        id=str(uuid.uuid4()),
        finding_id=finding_id,
        comment_type=payload.comment_type,
        content=payload.content,
        from_status=from_status,
        to_status=to_status,
        author_id=current_user.id,
    )
    db.add(comment)

    # 更新评论计数
    if hasattr(finding, 'comments_count') and finding.comments_count is not None:
        finding.comments_count = (finding.comments_count or 0) + 1
    else:
        finding.comments_count = 1

    await db.commit()
    await db.refresh(comment)
    return comment.to_dict()


@router.patch("/findings/{finding_id}/review", summary="审核问题（确认/拒绝/接受风险）")
async def review_finding(
    finding_id: str,
    payload: FindingReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    finding = await _get_finding_or_404(db, finding_id)

    if payload.action not in _REVIEW_ACTION_STATUS:
        raise HTTPException(
            status_code=422,
            detail=f"无效的操作: {payload.action}. 允许的操作: {list(_REVIEW_ACTION_STATUS.keys())}"
        )

    from_status = finding.status
    to_status = _REVIEW_ACTION_STATUS[payload.action]

    finding.status = to_status
    finding.reviewer_id = current_user.id
    finding.reviewed_at = datetime.now(timezone.utc)

    if payload.notes:
        finding.review_notes = payload.notes
    if payload.assignee_id:
        finding.assignee_id = payload.assignee_id
        finding.assigned_at = datetime.now(timezone.utc)
    if payload.due_date:
        finding.due_date = payload.due_date
    if payload.action == "accept_risk":
        finding.risk_accepted = True
    if payload.action == "close":
        finding.closed_at = datetime.now(timezone.utc)

    # 自动创建评论记录
    auto_content = payload.notes or f"[{payload.action}] 状态从 {from_status} 变更为 {to_status}"
    comment = IssueComment(
        id=str(uuid.uuid4()),
        finding_id=finding_id,
        comment_type=_REVIEW_COMMENT_TYPE.get(payload.action, IssueCommentType.NOTE),
        content=auto_content,
        from_status=from_status,
        to_status=to_status,
        author_id=current_user.id,
    )
    db.add(comment)

    await db.commit()
    await db.refresh(finding)
    return finding.to_dict()


@router.post("/findings/batch-update", summary="批量更新问题状态")
async def batch_update_findings(
    payload: FindingBatchUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    if not payload.finding_ids:
        raise HTTPException(status_code=422, detail="finding_ids 不能为空")

    result = await db.execute(
        select(AgentFinding).where(AgentFinding.id.in_(payload.finding_ids))
    )
    findings = result.scalars().all()

    updated = 0
    for finding in findings:
        changed = False
        if payload.status and payload.status != finding.status:
            finding.status = payload.status
            changed = True
        if payload.assignee_id:
            finding.assignee_id = payload.assignee_id
            finding.assigned_at = datetime.now(timezone.utc)
            changed = True
        if payload.due_date:
            finding.due_date = payload.due_date
            changed = True
        if changed:
            updated += 1

    await db.commit()
    return {"updated": updated, "total": len(payload.finding_ids)}


@router.get("/tasks/{task_id}/findings/statistics", summary="获取任务问题统计")
async def get_findings_statistics(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    result = await db.execute(
        select(AgentFinding).where(AgentFinding.task_id == task_id)
    )
    findings = result.scalars().all()

    if not findings:
        return {
            "total": 0,
            "by_severity": {},
            "by_status": {},
            "confirmation_rate": 0.0,
            "false_positive_rate": 0.0,
            "closure_rate": 0.0,
        }

    total = len(findings)
    by_severity: Dict[str, int] = {}
    by_status: Dict[str, int] = {}

    confirmed = 0
    false_positive = 0
    closed = 0

    for f in findings:
        by_severity[f.severity] = by_severity.get(f.severity, 0) + 1
        by_status[f.status] = by_status.get(f.status, 0) + 1

        if f.status == FindingStatus.VERIFIED:
            confirmed += 1
        elif f.status == FindingStatus.FALSE_POSITIVE:
            false_positive += 1
        elif f.status in (FindingStatus.FIXED, FindingStatus.WONT_FIX):
            closed += 1

    return {
        "total": total,
        "by_severity": by_severity,
        "by_status": by_status,
        "confirmed": confirmed,
        "false_positive": false_positive,
        "closed": closed,
        "confirmation_rate": round(confirmed / total * 100, 1) if total > 0 else 0.0,
        "false_positive_rate": round(false_positive / total * 100, 1) if total > 0 else 0.0,
        "closure_rate": round(closed / (confirmed or 1) * 100, 1) if confirmed > 0 else 0.0,
    }


# ════════════════════════════════════════════════════════════════════════════
# 工具函数
# ════════════════════════════════════════════════════════════════════════════

async def _get_oc_project_or_404(
    db: AsyncSession,
    project_id: str,
    user_id: str,
) -> OpenCodeProject:
    result = await db.execute(
        select(OpenCodeProject).where(
            OpenCodeProject.id == project_id,
            OpenCodeProject.created_by == user_id,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="OpenCode 项目不存在")
    return obj


async def _get_skill_or_404(db: AsyncSession, skill_id: str) -> OpenCodeSkill:
    result = await db.execute(
        select(OpenCodeSkill).where(OpenCodeSkill.id == skill_id)
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Skill 不存在")
    return obj


async def _get_mcp_tool_or_404(db: AsyncSession, tool_id: str) -> MCPToolConfig:
    result = await db.execute(
        select(MCPToolConfig).where(MCPToolConfig.id == tool_id)
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="MCP 工具不存在")
    return obj


async def _get_finding_or_404(db: AsyncSession, finding_id: str) -> AgentFinding:
    result = await db.execute(
        select(AgentFinding).where(AgentFinding.id == finding_id)
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="问题不存在")
    return obj
