"""
CodeCode 对接配置 API 端点
支持配置 CodeCode 连接以从远程 GoDeepAudit 实例下载 Skills
"""

import os
import json
import hashlib
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, Field

from app.api import deps
from app.db.session import get_db
from app.models.user_config import UserConfig
from app.models.user import User
from app.models.skill import Skill

router = APIRouter()

CODECODE_CONFIG_KEY = "codecode_config"


class CodeCodeConfig(BaseModel):
    server_url: str = Field(..., description="GoDeepAudit 服务器地址")
    api_key: Optional[str] = Field(None, description="API Key")
    auto_sync: bool = Field(False, description="是否自动同步 Skills")
    sync_interval_minutes: int = Field(60, ge=5, le=1440, description="同步间隔(分钟)")


class CodeCodeConfigResponse(CodeCodeConfig):
    is_connected: bool = False
    last_sync_at: Optional[str] = None


class RemoteSkillItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    version: str
    category: str
    file_size: int = 0
    download_count: int = 0


class RemoteSkillListResponse(BaseModel):
    items: list[RemoteSkillItem]
    total: int
    server_url: str


def _get_codecode_data(config_row: Optional[UserConfig]) -> dict:
    if not config_row or not config_row.other_config:
        return {}
    try:
        other = json.loads(config_row.other_config)
        return other.get(CODECODE_CONFIG_KEY, {})
    except Exception:
        return {}


def _set_codecode_data(config_row: UserConfig, data: dict):
    try:
        other = json.loads(config_row.other_config or "{}")
    except Exception:
        other = {}
    other[CODECODE_CONFIG_KEY] = data
    config_row.other_config = json.dumps(other)


@router.get("/config", response_model=CodeCodeConfigResponse)
async def get_codecode_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """获取 CodeCode 对接配置"""
    result = await db.execute(
        select(UserConfig).where(UserConfig.user_id == current_user.id)
    )
    config_row = result.scalar_one_or_none()
    data = _get_codecode_data(config_row)

    return CodeCodeConfigResponse(
        server_url=data.get("server_url", ""),
        api_key=data.get("api_key"),
        auto_sync=data.get("auto_sync", False),
        sync_interval_minutes=data.get("sync_interval_minutes", 60),
        is_connected=data.get("is_connected", False),
        last_sync_at=data.get("last_sync_at"),
    )


@router.put("/config", response_model=CodeCodeConfigResponse)
async def update_codecode_config(
    config_in: CodeCodeConfig,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """更新 CodeCode 对接配置"""
    result = await db.execute(
        select(UserConfig).where(UserConfig.user_id == current_user.id)
    )
    config_row = result.scalar_one_or_none()

    config_data = {
        "server_url": config_in.server_url,
        "api_key": config_in.api_key,
        "auto_sync": config_in.auto_sync,
        "sync_interval_minutes": config_in.sync_interval_minutes,
        "is_connected": False,
    }

    if config_row:
        _set_codecode_data(config_row, config_data)
    else:
        config_row = UserConfig(
            user_id=current_user.id,
            other_config=json.dumps({CODECODE_CONFIG_KEY: config_data}),
        )
        db.add(config_row)

    await db.commit()

    return CodeCodeConfigResponse(
        server_url=config_data["server_url"],
        api_key=config_data["api_key"],
        auto_sync=config_data["auto_sync"],
        sync_interval_minutes=config_data["sync_interval_minutes"],
        is_connected=False,
    )


@router.post("/test-connection")
async def test_codecode_connection(
    config_in: CodeCodeConfig,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """测试 CodeCode 连接"""
    try:
        import httpx

        url = config_in.server_url.rstrip("/")
        headers = {}
        if config_in.api_key:
            headers["Authorization"] = f"Bearer {config_in.api_key}"

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{url}/health", headers=headers)
            if resp.status_code == 200:
                return {"success": True, "message": "连接成功"}
            return {"success": False, "message": f"连接失败: HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}


@router.get("/remote-skills", response_model=RemoteSkillListResponse)
async def list_remote_skills(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """获取远程 GoDeepAudit 实例的 Skills 列表"""
    result = await db.execute(
        select(UserConfig).where(UserConfig.user_id == current_user.id)
    )
    config_row = result.scalar_one_or_none()
    data = _get_codecode_data(config_row)

    server_url = data.get("server_url", "").rstrip("/")
    api_key = data.get("api_key")

    if not server_url:
        raise HTTPException(status_code=400, detail="请先配置 CodeCode 连接")

    try:
        import httpx

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{server_url}/api/v1/skills",
                headers=headers,
                params={"limit": 100},
            )
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"远程服务器返回: HTTP {resp.status_code}",
                )

            remote_data = resp.json()
            items = [
                RemoteSkillItem(
                    id=s["id"],
                    name=s["name"],
                    description=s.get("description"),
                    version=s.get("version", "1.0.0"),
                    category=s.get("category", "general"),
                    file_size=s.get("file_size", 0),
                    download_count=s.get("download_count", 0),
                )
                for s in remote_data.get("items", [])
            ]
            return RemoteSkillListResponse(
                items=items,
                total=remote_data.get("total", len(items)),
                server_url=server_url,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"连接远程服务器失败: {str(e)}")


@router.post("/download-skill/{remote_skill_id}")
async def download_remote_skill(
    remote_skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """从远程 GoDeepAudit 实例下载 Skill"""
    import uuid

    result = await db.execute(
        select(UserConfig).where(UserConfig.user_id == current_user.id)
    )
    config_row = result.scalar_one_or_none()
    data = _get_codecode_data(config_row)

    server_url = data.get("server_url", "").rstrip("/")
    api_key = data.get("api_key")

    if not server_url:
        raise HTTPException(status_code=400, detail="请先配置 CodeCode 连接")

    try:
        import httpx

        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        async with httpx.AsyncClient(timeout=60) as client:
            info_resp = await client.get(
                f"{server_url}/api/v1/skills/{remote_skill_id}",
                headers=headers,
            )
            if info_resp.status_code != 200:
                raise HTTPException(status_code=502, detail="获取远程技能包信息失败")
            remote_info = info_resp.json()

            file_resp = await client.get(
                f"{server_url}/api/v1/skills/{remote_skill_id}/download",
                headers=headers,
            )
            if file_resp.status_code != 200:
                raise HTTPException(status_code=502, detail="下载远程技能包文件失败")

            skills_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(
                    os.path.dirname(os.path.dirname(__file__))
                ))),
                "uploads", "skills",
            )
            skill_id = str(uuid.uuid4())
            skill_dir = os.path.join(skills_dir, skill_id)
            os.makedirs(skill_dir, exist_ok=True)

            filename = (
                remote_info.get("original_filename")
                or f"{remote_info.get('name', 'skill')}.zip"
            )
            file_path = os.path.join(skill_dir, filename)
            with open(file_path, "wb") as f:
                f.write(file_resp.content)

            file_size = os.path.getsize(file_path)
            sha256 = hashlib.sha256()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    sha256.update(chunk)
            file_hash = sha256.hexdigest()

            skill = Skill(
                id=skill_id,
                name=remote_info.get("name", "Unknown"),
                description=remote_info.get("description"),
                version=remote_info.get("version", "1.0.0"),
                category=remote_info.get("category", "general"),
                tags=remote_info.get("tags"),
                config=remote_info.get("config"),
                entry_point=remote_info.get("entry_point"),
                file_path=file_path,
                file_size=file_size,
                file_hash=file_hash,
                original_filename=filename,
                is_active=True,
                is_system=False,
                source="codecode",
                source_url=f"{server_url}/api/v1/skills/{remote_skill_id}",
                created_by=current_user.id,
            )
            db.add(skill)
            await db.commit()
            await db.refresh(skill)

            return {
                "success": True,
                "message": f"技能包 '{skill.name}' 下载成功",
                "skill_id": skill.id,
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"下载失败: {str(e)}")
