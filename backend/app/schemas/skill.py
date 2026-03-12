"""
Skills 管理 Schema
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class SkillBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="技能包名称")
    description: Optional[str] = Field(None, description="技能包描述")
    version: str = Field("1.0.0", max_length=50, description="版本号")
    category: str = Field("general", max_length=50, description="分类")
    tags: Optional[List[str]] = Field(None, description="标签列表")
    config: Optional[Dict[str, Any]] = Field(None, description="技能包配置")
    entry_point: Optional[str] = Field(None, max_length=255, description="入口文件")
    is_active: bool = Field(True, description="是否启用")


class SkillCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="技能包名称")
    description: Optional[str] = Field(None, description="技能包描述")
    version: str = Field("1.0.0", max_length=50, description="版本号")
    category: str = Field("general", max_length=50, description="分类")
    tags: Optional[List[str]] = Field(None, description="标签列表")
    config: Optional[Dict[str, Any]] = Field(None, description="技能包配置")
    entry_point: Optional[str] = Field(None, max_length=255, description="入口文件")
    is_active: bool = Field(True, description="是否启用")


class SkillUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    version: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = Field(None, max_length=50)
    tags: Optional[List[str]] = None
    config: Optional[Dict[str, Any]] = None
    entry_point: Optional[str] = None
    is_active: Optional[bool] = None


class SkillResponse(SkillBase):
    id: str
    file_path: Optional[str] = None
    file_size: int = 0
    file_hash: Optional[str] = None
    original_filename: Optional[str] = None
    is_system: bool = False
    download_count: int = 0
    source: str = "local"
    source_url: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SkillListResponse(BaseModel):
    items: List[SkillResponse]
    total: int
