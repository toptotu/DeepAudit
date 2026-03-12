"""
Skills 管理模型 - 存储和管理审计技能包
"""

import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, Integer, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class Skill(Base):
    """技能包表"""
    __tablename__ = "skills"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    version = Column(String(50), default="1.0.0")

    category = Column(String(50), default="general")
    tags = Column(JSON, nullable=True)

    file_path = Column(String(500), nullable=True)
    file_size = Column(Integer, default=0)
    file_hash = Column(String(64), nullable=True)
    original_filename = Column(String(255), nullable=True)

    config = Column(JSON, nullable=True)
    entry_point = Column(String(255), nullable=True)

    is_active = Column(Boolean, default=True)
    is_system = Column(Boolean, default=False)
    download_count = Column(Integer, default=0)

    source = Column(String(50), default="local")
    source_url = Column(String(500), nullable=True)

    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by])
