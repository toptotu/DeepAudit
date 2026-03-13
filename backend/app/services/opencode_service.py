"""
OpenCode Agent 审计服务

负责:
- OpenCode 进程生命周期管理（启动/停止/健康检查）
- 端口池管理
- Skills 和 MCP 配置注入
- 审计任务编排
- 结果收集与转换为 AgentFinding 格式
"""

import asyncio
import json
import logging
import os
import shutil
import signal
import subprocess
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.agent_task import AgentFinding, AgentTask, AgentTaskStatus, FindingStatus, AgentEvent, AgentEventType
from app.models.opencode import (
    MCPToolConfig,
    OpenCodeAuditSession,
    OpenCodeProject,
    OpenCodeServerStatus,
    OpenCodeSkill,
)

logger = logging.getLogger(__name__)

# ─── 端口池配置 ────────────────────────────────────────────────────────────────
PORT_POOL_START = int(os.getenv("OPENCODE_PORT_POOL_START", "9100"))
PORT_POOL_END = int(os.getenv("OPENCODE_PORT_POOL_END", "9199"))
OPENCODE_BIN = os.getenv("OPENCODE_BIN", "opencode")
OPENCODE_STARTUP_TIMEOUT = int(os.getenv("OPENCODE_STARTUP_TIMEOUT", "30"))
OPENCODE_AUDIT_TIMEOUT = int(os.getenv("OPENCODE_AUDIT_TIMEOUT", "1800"))

# 全局进程注册表 {project_id: subprocess.Popen}
_running_processes: Dict[str, subprocess.Popen] = {}
# 已使用端口集合
_used_ports: set = set()


class OpenCodeServiceError(Exception):
    """OpenCode 服务操作错误"""
    pass


class OpenCodeService:
    """
    OpenCode 服务管理器

    管理 OpenCode 服务进程的完整生命周期，
    并提供 Skills/MCP 注入和审计结果收集能力。
    """

    # ─── 端口管理 ──────────────────────────────────────────────────────────────

    @staticmethod
    def allocate_port() -> int:
        """从端口池中分配一个可用端口"""
        for port in range(PORT_POOL_START, PORT_POOL_END + 1):
            if port not in _used_ports:
                _used_ports.add(port)
                return port
        raise OpenCodeServiceError(
            f"端口池已耗尽 ({PORT_POOL_START}-{PORT_POOL_END})，请停止不再使用的 OpenCode 实例"
        )

    @staticmethod
    def release_port(port: int) -> None:
        """释放端口回端口池"""
        _used_ports.discard(port)

    # ─── 服务器生命周期 ────────────────────────────────────────────────────────

    @staticmethod
    def is_opencode_available() -> bool:
        """检查 OpenCode 二进制文件是否可用"""
        return shutil.which(OPENCODE_BIN) is not None

    @staticmethod
    async def start_server(project: OpenCodeProject) -> Tuple[int, int]:
        """
        启动 OpenCode 服务器

        Returns:
            (port, pid) - 分配的端口和进程 ID
        """
        if not OpenCodeService.is_opencode_available():
            raise OpenCodeServiceError(
                f"未找到 OpenCode 二进制文件 '{OPENCODE_BIN}'，"
                "请先安装 OpenCode: https://opencode.ai"
            )

        if project.id in _running_processes:
            proc = _running_processes[project.id]
            if proc.poll() is None:
                raise OpenCodeServiceError(
                    f"项目 '{project.name}' 的 OpenCode 服务已在运行 (PID: {proc.pid})"
                )
            else:
                del _running_processes[project.id]

        if not os.path.isdir(project.code_path):
            raise OpenCodeServiceError(
                f"代码路径不存在或不是目录: {project.code_path}"
            )

        port = OpenCodeService.allocate_port()

        try:
            cmd = [
                OPENCODE_BIN, "serve",
                "--port", str(port),
                "--cwd", project.code_path,
            ]

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env={**os.environ},
                cwd=project.code_path,
            )

            _running_processes[project.id] = proc

            # 等待服务就绪
            base_url = f"http://localhost:{port}"
            started = False
            for _ in range(OPENCODE_STARTUP_TIMEOUT):
                await asyncio.sleep(1)
                if proc.poll() is not None:
                    stderr = proc.stderr.read().decode() if proc.stderr else ""
                    OpenCodeService.release_port(port)
                    del _running_processes[project.id]
                    raise OpenCodeServiceError(
                        f"OpenCode 进程意外退出: {stderr[:500]}"
                    )
                try:
                    async with httpx.AsyncClient(timeout=2.0) as client:
                        resp = await client.get(f"{base_url}/health")
                        if resp.status_code in (200, 404):
                            started = True
                            break
                except (httpx.ConnectError, httpx.TimeoutException):
                    pass

            if not started:
                proc.terminate()
                OpenCodeService.release_port(port)
                del _running_processes[project.id]
                raise OpenCodeServiceError(
                    f"OpenCode 服务在 {OPENCODE_STARTUP_TIMEOUT}s 内未就绪"
                )

            logger.info(
                "OpenCode 服务已启动: project=%s port=%d pid=%d cwd=%s",
                project.name, port, proc.pid, project.code_path,
            )
            return port, proc.pid

        except OpenCodeServiceError:
            raise
        except Exception as e:
            OpenCodeService.release_port(port)
            _running_processes.pop(project.id, None)
            raise OpenCodeServiceError(f"启动 OpenCode 服务失败: {e}") from e

    @staticmethod
    async def stop_server(project: OpenCodeProject) -> None:
        """停止 OpenCode 服务器"""
        proc = _running_processes.pop(project.id, None)
        if proc is not None:
            try:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
            except Exception as e:
                logger.warning("停止 OpenCode 进程时出错: %s", e)

        if project.port:
            OpenCodeService.release_port(project.port)

        # 尝试通过 PID 终止（容错）
        if project.server_pid:
            try:
                os.kill(project.server_pid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                pass

        logger.info("OpenCode 服务已停止: project=%s", project.name)

    @staticmethod
    async def health_check(project: OpenCodeProject) -> bool:
        """检查 OpenCode 服务健康状态"""
        if not project.port:
            return False
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"http://localhost:{project.port}/health")
                return resp.status_code < 500
        except Exception:
            return False

    # ─── Skills 和 MCP 注入 ────────────────────────────────────────────────────

    @staticmethod
    async def build_system_prompt(skills: List[OpenCodeSkill]) -> str:
        """将多个 Skills 组合为完整的系统提示词"""
        if not skills:
            return "你是一个专业的代码安全审计专家，请对提供的代码进行全面的安全分析。"

        parts = [
            "# 代码安全审计任务",
            "",
            "你是一个专业的代码安全审计专家，本次审计聚焦以下技能方向：",
            "",
        ]

        for i, skill in enumerate(skills, 1):
            parts.append(f"## 技能 {i}: {skill.display_name}")
            parts.append("")
            parts.append(skill.system_prompt)
            parts.append("")
            parts.append("---")
            parts.append("")

        parts.extend([
            "## 通用审计规范",
            "",
            "对于每个发现的安全问题，请以严格的 JSON 格式报告：",
            "```json",
            "{",
            '  "vulnerability_type": "sql_injection|xss|command_injection|...",',
            '  "severity": "critical|high|medium|low|info",',
            '  "title": "简洁的漏洞标题",',
            '  "description": "详细的漏洞描述",',
            '  "file_path": "相对文件路径",',
            '  "line_start": 行号,',
            '  "line_end": 结束行号,',
            '  "function_name": "函数名（可选）",',
            '  "code_snippet": "漏洞代码片段",',
            '  "source": "污点源",',
            '  "sink": "危险函数",',
            '  "poc_description": "利用方式描述",',
            '  "suggestion": "修复建议",',
            '  "fix_code": "修复代码示例（可选）",',
            '  "references": ["CWE-89", "OWASP A03:2021"]',
            "}",
            "```",
            "",
            "完成所有文件分析后，输出 AUDIT_COMPLETE 标记。",
        ])

        return "\n".join(parts)

    @staticmethod
    def build_mcp_config(mcp_tools: List[MCPToolConfig]) -> Dict[str, Any]:
        """构建 OpenCode MCP 配置对象"""
        mcp_config: Dict[str, Any] = {}

        for tool in mcp_tools:
            if tool.transport_type == "http":
                mcp_config[tool.name] = {
                    "type": "http",
                    "url": tool.server_url,
                }
            elif tool.transport_type == "stdio":
                entry: Dict[str, Any] = {
                    "type": "stdio",
                    "command": tool.command,
                }
                if tool.args:
                    entry["args"] = tool.args
                if tool.env_vars:
                    entry["env"] = tool.env_vars
                mcp_config[tool.name] = entry
            elif tool.transport_type == "sse":
                mcp_config[tool.name] = {
                    "type": "sse",
                    "url": tool.server_url,
                }

        return mcp_config

    @staticmethod
    async def create_audit_session(
        project: OpenCodeProject,
        system_prompt: str,
        mcp_config: Dict[str, Any],
    ) -> str:
        """在 OpenCode 服务器创建审计会话，返回 session_id"""
        if not project.port:
            raise OpenCodeServiceError("OpenCode 服务器未启动")

        base_url = f"http://localhost:{project.port}"
        payload: Dict[str, Any] = {
            "systemPrompt": system_prompt,
        }
        if mcp_config:
            payload["mcpConfig"] = mcp_config

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{base_url}/session", json=payload)
            resp.raise_for_status()
            data = resp.json()
            session_id = data.get("id") or data.get("sessionId") or data.get("session_id")
            if not session_id:
                raise OpenCodeServiceError(f"创建会话失败，响应: {data}")
            return str(session_id)

    @staticmethod
    async def send_audit_message(
        project: OpenCodeProject,
        session_id: str,
        message: str,
    ) -> None:
        """向 OpenCode 会话发送审计指令"""
        if not project.port:
            raise OpenCodeServiceError("OpenCode 服务器未启动")

        base_url = f"http://localhost:{project.port}"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{base_url}/session/{session_id}/message",
                json={"content": message, "role": "user"},
            )
            resp.raise_for_status()

    @staticmethod
    async def poll_session_messages(
        project: OpenCodeProject,
        session_id: str,
    ) -> List[Dict[str, Any]]:
        """获取会话中的所有消息"""
        if not project.port:
            return []

        base_url = f"http://localhost:{project.port}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(f"{base_url}/session/{session_id}/messages")
                resp.raise_for_status()
                return resp.json() if isinstance(resp.json(), list) else resp.json().get("messages", [])
        except Exception as e:
            logger.warning("获取会话消息失败: %s", e)
            return []

    # ─── 结果转换层 ────────────────────────────────────────────────────────────

    @staticmethod
    def parse_findings_from_messages(
        messages: List[Dict[str, Any]],
        task_id: str,
        skills_used: List[str],
    ) -> List[Dict[str, Any]]:
        """
        从 OpenCode 会话消息中提取并解析漏洞发现

        OpenCode 助手消息中的 JSON 代码块会被解析为 AgentFinding 字典
        """
        import re

        findings = []
        json_pattern = re.compile(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", re.MULTILINE)

        for msg in messages:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role != "assistant" or not content:
                continue

            # 提取 JSON 代码块
            for match in json_pattern.finditer(content):
                try:
                    data = json.loads(match.group(1))
                except json.JSONDecodeError:
                    continue

                vuln_type = data.get("vulnerability_type", "")
                severity = data.get("severity", "medium")
                title = data.get("title", "")

                if not vuln_type or not title:
                    continue

                finding = {
                    "id": str(uuid.uuid4()),
                    "task_id": task_id,
                    "vulnerability_type": vuln_type,
                    "severity": severity if severity in ("critical", "high", "medium", "low", "info") else "medium",
                    "title": title,
                    "description": data.get("description", ""),
                    "file_path": data.get("file_path"),
                    "line_start": data.get("line_start"),
                    "line_end": data.get("line_end"),
                    "function_name": data.get("function_name"),
                    "code_snippet": data.get("code_snippet"),
                    "source": data.get("source"),
                    "sink": data.get("sink"),
                    "suggestion": data.get("suggestion", ""),
                    "fix_code": data.get("fix_code"),
                    "poc_description": data.get("poc_description"),
                    "references": json.dumps(data.get("references", [])),
                    "status": FindingStatus.NEW,
                    "is_verified": False,
                    "has_poc": bool(data.get("poc_description")),
                    "finding_metadata": json.dumps({
                        "source": "opencode",
                        "skills_used": skills_used,
                        "raw_data": data,
                    }),
                }
                findings.append(finding)

        return findings

    # ─── 高层审计编排 ──────────────────────────────────────────────────────────

    @staticmethod
    async def run_audit(
        db: AsyncSession,
        opencode_project: OpenCodeProject,
        agent_task: AgentTask,
        skills: List[OpenCodeSkill],
        mcp_tools: List[MCPToolConfig],
    ) -> List[AgentFinding]:
        """
        执行完整的 OpenCode 审计流程

        1. 构建系统提示词（注入 Skills）
        2. 构建 MCP 配置
        3. 创建 OpenCode 审计会话
        4. 发送审计指令
        5. 等待并收集结果
        6. 将结果转换为 AgentFinding
        7. 保存到数据库

        Returns:
            保存的 AgentFinding 对象列表
        """
        system_prompt = await OpenCodeService.build_system_prompt(skills)
        mcp_config = OpenCodeService.build_mcp_config(mcp_tools)

        # 创建审计会话记录
        session = OpenCodeAuditSession(
            opencode_project_id=opencode_project.id,
            agent_task_id=agent_task.id,
            skills_snapshot=[s.id for s in skills],
            mcp_snapshot=[t.id for t in mcp_tools],
            audit_config_snapshot=opencode_project.audit_config,
            status="running",
        )
        db.add(session)
        await db.flush()

        try:
            # 创建 OpenCode 会话
            oc_session_id = await OpenCodeService.create_audit_session(
                opencode_project, system_prompt, mcp_config
            )
            session.opencode_session_id = oc_session_id

            # 构建审计指令
            audit_prompt = OpenCodeService._build_audit_prompt(agent_task)
            await OpenCodeService.send_audit_message(
                opencode_project, oc_session_id, audit_prompt
            )

            # 等待审计完成（轮询）
            messages = await OpenCodeService._wait_for_completion(
                opencode_project, oc_session_id
            )

            session.messages_count = len(messages)

            # 解析发现
            skill_ids = [s.id for s in skills]
            raw_findings = OpenCodeService.parse_findings_from_messages(
                messages, agent_task.id, skill_ids
            )

            # 保存 AgentFinding 到数据库
            saved_findings = []
            for finding_data in raw_findings:
                refs = finding_data.pop("references", "[]")
                poc_desc = finding_data.pop("poc_description", None)

                finding = AgentFinding(
                    **finding_data,
                    poc_description=poc_desc,
                    references=json.loads(refs) if isinstance(refs, str) else refs,
                    finding_metadata=(
                        json.loads(finding_data.get("finding_metadata", "{}"))
                        if isinstance(finding_data.get("finding_metadata"), str)
                        else finding_data.get("finding_metadata")
                    ),
                )
                finding.fingerprint = finding.generate_fingerprint()
                db.add(finding)
                saved_findings.append(finding)

            session.findings_count = len(saved_findings)
            session.status = "completed"
            session.completed_at = datetime.now(timezone.utc)

            # 更新任务统计
            severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
            for f in saved_findings:
                if f.severity in severity_counts:
                    severity_counts[f.severity] += 1

            agent_task.findings_count = len(saved_findings)
            agent_task.critical_count = severity_counts["critical"]
            agent_task.high_count = severity_counts["high"]
            agent_task.medium_count = severity_counts["medium"]
            agent_task.low_count = severity_counts["low"]
            agent_task.status = AgentTaskStatus.COMPLETED
            agent_task.completed_at = datetime.now(timezone.utc)

            await db.commit()

            logger.info(
                "OpenCode 审计完成: project=%s task=%s findings=%d",
                opencode_project.name, agent_task.id, len(saved_findings),
            )
            return saved_findings

        except Exception as e:
            session.status = "failed"
            agent_task.status = AgentTaskStatus.FAILED
            agent_task.error_message = str(e)
            await db.commit()
            logger.error("OpenCode 审计失败: %s", e, exc_info=True)
            raise

    @staticmethod
    def _build_audit_prompt(agent_task: AgentTask) -> str:
        """构建发送给 OpenCode 的审计指令"""
        lines = [
            "请对当前工作目录中的代码进行全面的安全审计。",
            "",
            "审计范围：",
        ]

        if agent_task.target_vulnerabilities:
            lines.append(f"- 关注漏洞类型: {', '.join(agent_task.target_vulnerabilities)}")

        if agent_task.exclude_patterns:
            lines.append(f"- 排除路径: {', '.join(agent_task.exclude_patterns)}")

        if agent_task.target_files:
            lines.append(f"- 只扫描以下文件: {', '.join(agent_task.target_files)}")

        lines.extend([
            "",
            "请从最可疑的入口点开始分析，逐步深入。",
            "发现每个漏洞后，立即以指定 JSON 格式输出。",
            "所有文件分析完毕后，输出 AUDIT_COMPLETE。",
        ])

        return "\n".join(lines)

    @staticmethod
    async def _wait_for_completion(
        project: OpenCodeProject,
        session_id: str,
        timeout: int = OPENCODE_AUDIT_TIMEOUT,
    ) -> List[Dict[str, Any]]:
        """等待审计完成，轮询消息直到看到 AUDIT_COMPLETE 或超时"""
        start = asyncio.get_event_loop().time()

        while (asyncio.get_event_loop().time() - start) < timeout:
            await asyncio.sleep(5)
            messages = await OpenCodeService.poll_session_messages(project, session_id)

            # 检查是否完成
            for msg in reversed(messages):
                content = msg.get("content", "")
                if "AUDIT_COMPLETE" in content:
                    return messages

        logger.warning(
            "OpenCode 审计超时 (%ds): project=%s session=%s",
            timeout, project.name, session_id,
        )
        return await OpenCodeService.poll_session_messages(project, session_id)
