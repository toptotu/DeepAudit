"""
MCP 服务管理 Schema
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class McpServerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="MCP 服务名称")
    description: Optional[str] = Field(None, description="服务描述")
    server_type: str = Field("stdio", description="服务类型: stdio, sse, streamable-http")
    command: Optional[str] = Field(None, max_length=500, description="启动命令 (stdio 类型)")
    args: Optional[List[str]] = Field(None, description="命令参数 (stdio 类型)")
    env: Optional[Dict[str, str]] = Field(None, description="环境变量")
    url: Optional[str] = Field(None, max_length=500, description="服务 URL (sse/http 类型)")
    api_key: Optional[str] = Field(None, max_length=500, description="API Key")
    headers: Optional[Dict[str, str]] = Field(None, description="自定义 HTTP Headers")
    is_active: bool = Field(True, description="是否启用")
    config: Optional[Dict[str, Any]] = Field(None, description="额外配置")
    timeout_seconds: int = Field(30, ge=5, le=300, description="超时时间(秒)")
    max_retries: int = Field(3, ge=0, le=10, description="最大重试次数")


class McpServerCreate(McpServerBase):
    pass


class McpServerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    server_type: Optional[str] = None
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None
    url: Optional[str] = None
    api_key: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    is_active: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None
    timeout_seconds: Optional[int] = Field(None, ge=5, le=300)
    max_retries: Optional[int] = Field(None, ge=0, le=10)


class McpServerResponse(McpServerBase):
    id: str
    tools: Optional[List[Dict[str, Any]]] = None
    resources: Optional[List[Dict[str, Any]]] = None
    prompts_config: Optional[List[Dict[str, Any]]] = None
    health_status: str = "unknown"
    last_health_check: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class McpServerListResponse(BaseModel):
    items: List[McpServerResponse]
    total: int


class McpToolCallRequest(BaseModel):
    server_id: str = Field(..., description="MCP 服务 ID")
    tool_name: str = Field(..., description="工具名称")
    arguments: Optional[Dict[str, Any]] = Field(None, description="调用参数")


class McpToolCallResponse(BaseModel):
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
