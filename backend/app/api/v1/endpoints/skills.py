"""
Skills 管理 API 端点
支持上传(ZIP)、下载、新增、修改、删除
"""

import os
import hashlib
import shutil
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func as sql_func

from app.api import deps
from app.db.session import get_db
from app.models.skill import Skill
from app.models.user import User
from app.schemas.skill import (
    SkillCreate,
    SkillUpdate,
    SkillResponse,
    SkillListResponse,
)
from app.core.config import settings

router = APIRouter()

SKILLS_STORAGE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))),
    "uploads", "skills"
)


def ensure_skills_dir():
    os.makedirs(SKILLS_STORAGE_PATH, exist_ok=True)


def compute_file_hash(file_path: str) -> str:
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


@router.get("", response_model=SkillListResponse)
async def list_skills(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    category: Optional[str] = Query(None, description="分类过滤"),
    is_active: Optional[bool] = Query(None, description="是否启用"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """获取技能包列表"""
    query = select(Skill)

    if category:
        query = query.where(Skill.category == category)
    if is_active is not None:
        query = query.where(Skill.is_active == is_active)
    if search:
        query = query.where(Skill.name.ilike(f"%{search}%"))

    count_query = select(sql_func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    query = query.order_by(Skill.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    skills = result.scalars().all()

    items = [
        SkillResponse(
            id=s.id, name=s.name, description=s.description,
            version=s.version, category=s.category, tags=s.tags,
            config=s.config, entry_point=s.entry_point,
            is_active=s.is_active, file_path=s.file_path,
            file_size=s.file_size, file_hash=s.file_hash,
            original_filename=s.original_filename,
            is_system=s.is_system, download_count=s.download_count,
            source=s.source, source_url=s.source_url,
            created_by=s.created_by, created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in skills
    ]

    return SkillListResponse(items=items, total=total)


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """获取单个技能包详情"""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能包不存在")

    return SkillResponse(
        id=skill.id, name=skill.name, description=skill.description,
        version=skill.version, category=skill.category, tags=skill.tags,
        config=skill.config, entry_point=skill.entry_point,
        is_active=skill.is_active, file_path=skill.file_path,
        file_size=skill.file_size, file_hash=skill.file_hash,
        original_filename=skill.original_filename,
        is_system=skill.is_system, download_count=skill.download_count,
        source=skill.source, source_url=skill.source_url,
        created_by=skill.created_by, created_at=skill.created_at,
        updated_at=skill.updated_at,
    )


@router.post("", response_model=SkillResponse)
async def create_skill(
    skill_in: SkillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """创建技能包（不含文件上传）"""
    skill = Skill(
        name=skill_in.name,
        description=skill_in.description,
        version=skill_in.version,
        category=skill_in.category,
        tags=skill_in.tags,
        config=skill_in.config,
        entry_point=skill_in.entry_point,
        is_active=skill_in.is_active,
        is_system=False,
        source="local",
        created_by=current_user.id,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)

    return SkillResponse(
        id=skill.id, name=skill.name, description=skill.description,
        version=skill.version, category=skill.category, tags=skill.tags,
        config=skill.config, entry_point=skill.entry_point,
        is_active=skill.is_active, file_path=skill.file_path,
        file_size=skill.file_size or 0, file_hash=skill.file_hash,
        original_filename=skill.original_filename,
        is_system=skill.is_system, download_count=skill.download_count or 0,
        source=skill.source, source_url=skill.source_url,
        created_by=skill.created_by, created_at=skill.created_at,
        updated_at=skill.updated_at,
    )


@router.post("/upload", response_model=SkillResponse)
async def upload_skill(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    version: str = Form("1.0.0"),
    category: str = Form("general"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """上传技能包（ZIP 压缩包）"""
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="仅支持 ZIP 压缩包格式")

    ensure_skills_dir()

    import uuid
    skill_id = str(uuid.uuid4())
    skill_dir = os.path.join(SKILLS_STORAGE_PATH, skill_id)
    os.makedirs(skill_dir, exist_ok=True)

    file_path = os.path.join(skill_dir, file.filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    file_size = os.path.getsize(file_path)
    file_hash = compute_file_hash(file_path)

    skill = Skill(
        id=skill_id,
        name=name,
        description=description or None,
        version=version,
        category=category,
        file_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        original_filename=file.filename,
        is_active=True,
        is_system=False,
        source="upload",
        created_by=current_user.id,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)

    return SkillResponse(
        id=skill.id, name=skill.name, description=skill.description,
        version=skill.version, category=skill.category, tags=skill.tags,
        config=skill.config, entry_point=skill.entry_point,
        is_active=skill.is_active, file_path=skill.file_path,
        file_size=skill.file_size, file_hash=skill.file_hash,
        original_filename=skill.original_filename,
        is_system=skill.is_system, download_count=skill.download_count or 0,
        source=skill.source, source_url=skill.source_url,
        created_by=skill.created_by, created_at=skill.created_at,
        updated_at=skill.updated_at,
    )


@router.get("/{skill_id}/download")
async def download_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """下载技能包 ZIP 文件"""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能包不存在")
    if not skill.file_path or not os.path.exists(skill.file_path):
        raise HTTPException(status_code=404, detail="技能包文件不存在")

    skill.download_count = (skill.download_count or 0) + 1
    await db.commit()

    filename = skill.original_filename or f"{skill.name}.zip"
    return FileResponse(
        path=skill.file_path,
        filename=filename,
        media_type="application/zip",
    )


@router.put("/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: str,
    skill_in: SkillUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """更新技能包信息"""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能包不存在")
    if skill.is_system:
        raise HTTPException(status_code=403, detail="系统内置技能包不允许修改")
    if skill.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权修改此技能包")

    update_data = skill_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(skill, field, value)

    await db.commit()
    await db.refresh(skill)

    return SkillResponse(
        id=skill.id, name=skill.name, description=skill.description,
        version=skill.version, category=skill.category, tags=skill.tags,
        config=skill.config, entry_point=skill.entry_point,
        is_active=skill.is_active, file_path=skill.file_path,
        file_size=skill.file_size or 0, file_hash=skill.file_hash,
        original_filename=skill.original_filename,
        is_system=skill.is_system, download_count=skill.download_count or 0,
        source=skill.source, source_url=skill.source_url,
        created_by=skill.created_by, created_at=skill.created_at,
        updated_at=skill.updated_at,
    )


@router.delete("/{skill_id}")
async def delete_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """删除技能包"""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能包不存在")
    if skill.is_system:
        raise HTTPException(status_code=403, detail="系统内置技能包不允许删除")
    if skill.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权删除此技能包")

    if skill.file_path:
        skill_dir = os.path.dirname(skill.file_path)
        if os.path.exists(skill_dir) and SKILLS_STORAGE_PATH in skill_dir:
            shutil.rmtree(skill_dir, ignore_errors=True)

    await db.delete(skill)
    await db.commit()

    return {"message": "技能包已删除"}


@router.put("/{skill_id}/toggle")
async def toggle_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """切换技能包启用状态"""
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="技能包不存在")

    skill.is_active = not skill.is_active
    await db.commit()

    return {"is_active": skill.is_active, "message": f"技能包已{'启用' if skill.is_active else '禁用'}"}
