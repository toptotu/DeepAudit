"""
MCP 服务管理 API 端点
支持 MCP 服务的增删改查及健康检查
"""

from typing import Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func as sql_func

from app.api import deps
from app.db.session import get_db
from app.models.mcp_server import McpServer
from app.models.user import User
from app.schemas.mcp_server import (
    McpServerCreate,
    McpServerUpdate,
    McpServerResponse,
    McpServerListResponse,
)

router = APIRouter()


@router.get("", response_model=McpServerListResponse)
async def list_mcp_servers(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    server_type: Optional[str] = Query(None, description="服务类型过滤"),
    is_active: Optional[bool] = Query(None, description="是否启用"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """获取 MCP 服务列表"""
    query = select(McpServer)

    if server_type:
        query = query.where(McpServer.server_type == server_type)
    if is_active is not None:
        query = query.where(McpServer.is_active == is_active)
    if search:
        query = query.where(McpServer.name.ilike(f"%{search}%"))

    count_query = select(sql_func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    query = query.order_by(McpServer.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    servers = result.scalars().all()

    items = [_to_response(s) for s in servers]
    return McpServerListResponse(items=items, total=total)


@router.get("/{server_id}", response_model=McpServerResponse)
async def get_mcp_server(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """获取单个 MCP 服务详情"""
    result = await db.execute(select(McpServer).where(McpServer.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="MCP 服务不存在")
    return _to_response(server)


@router.post("", response_model=McpServerResponse)
async def create_mcp_server(
    server_in: McpServerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """创建 MCP 服务"""
    server = McpServer(
        name=server_in.name,
        description=server_in.description,
        server_type=server_in.server_type,
        command=server_in.command,
        args=server_in.args,
        env=server_in.env,
        url=server_in.url,
        api_key=server_in.api_key,
        headers=server_in.headers,
        is_active=server_in.is_active,
        config=server_in.config,
        timeout_seconds=server_in.timeout_seconds,
        max_retries=server_in.max_retries,
        created_by=current_user.id,
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return _to_response(server)


@router.put("/{server_id}", response_model=McpServerResponse)
async def update_mcp_server(
    server_id: str,
    server_in: McpServerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """更新 MCP 服务"""
    result = await db.execute(select(McpServer).where(McpServer.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="MCP 服务不存在")
    if server.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权修改此 MCP 服务")

    update_data = server_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(server, field, value)

    await db.commit()
    await db.refresh(server)
    return _to_response(server)


@router.delete("/{server_id}")
async def delete_mcp_server(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """删除 MCP 服务"""
    result = await db.execute(select(McpServer).where(McpServer.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="MCP 服务不存在")
    if server.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权删除此 MCP 服务")

    await db.delete(server)
    await db.commit()
    return {"message": "MCP 服务已删除"}


@router.put("/{server_id}/toggle")
async def toggle_mcp_server(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """切换 MCP 服务启用状态"""
    result = await db.execute(select(McpServer).where(McpServer.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="MCP 服务不存在")

    server.is_active = not server.is_active
    await db.commit()
    return {"is_active": server.is_active, "message": f"MCP 服务已{'启用' if server.is_active else '禁用'}"}


@router.post("/{server_id}/health-check")
async def health_check_mcp_server(
    server_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """检查 MCP 服务健康状态"""
    result = await db.execute(select(McpServer).where(McpServer.id == server_id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="MCP 服务不存在")

    health_status = "healthy"
    error_msg = None

    try:
        if server.server_type in ("sse", "streamable-http") and server.url:
            import httpx
            async with httpx.AsyncClient(timeout=server.timeout_seconds) as client:
                resp = await client.get(server.url)
                if resp.status_code >= 400:
                    health_status = "unhealthy"
                    error_msg = f"HTTP {resp.status_code}"
        elif server.server_type == "stdio" and server.command:
            import subprocess
            proc = subprocess.run(
                ["which", server.command.split()[0]],
                capture_output=True, text=True, timeout=5
            )
            if proc.returncode != 0:
                health_status = "unhealthy"
                error_msg = f"命令 {server.command.split()[0]} 不存在"
        else:
            health_status = "unknown"
            error_msg = "无法检测此类型服务"
    except Exception as e:
        health_status = "unhealthy"
        error_msg = str(e)

    server.health_status = health_status
    server.last_health_check = datetime.now(timezone.utc)
    await db.commit()

    return {
        "server_id": server_id,
        "health_status": health_status,
        "error": error_msg,
        "checked_at": server.last_health_check.isoformat(),
    }


def _to_response(server: McpServer) -> McpServerResponse:
    return McpServerResponse(
        id=server.id, name=server.name, description=server.description,
        server_type=server.server_type, command=server.command,
        args=server.args, env=server.env, url=server.url,
        api_key=server.api_key, headers=server.headers,
        is_active=server.is_active, config=server.config,
        timeout_seconds=server.timeout_seconds, max_retries=server.max_retries,
        tools=server.tools, resources=server.resources,
        prompts_config=server.prompts_config,
        health_status=server.health_status,
        last_health_check=server.last_health_check,
        created_by=server.created_by, created_at=server.created_at,
        updated_at=server.updated_at,
    )
