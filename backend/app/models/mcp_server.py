"""
MCP 服务管理模型 - 管理 Model Context Protocol 服务配置
"""

import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, Integer, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class McpServer(Base):
    """MCP 服务配置表"""
    __tablename__ = "mcp_servers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    server_type = Column(String(50), default="stdio")
    command = Column(String(500), nullable=True)
    args = Column(JSON, nullable=True)
    env = Column(JSON, nullable=True)

    url = Column(String(500), nullable=True)
    api_key = Column(String(500), nullable=True)
    headers = Column(JSON, nullable=True)

    tools = Column(JSON, nullable=True)
    resources = Column(JSON, nullable=True)
    prompts_config = Column(JSON, nullable=True)

    is_active = Column(Boolean, default=True)
    health_status = Column(String(20), default="unknown")
    last_health_check = Column(DateTime(timezone=True), nullable=True)

    config = Column(JSON, nullable=True)
    timeout_seconds = Column(Integer, default=30)
    max_retries = Column(Integer, default=3)

    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by])
