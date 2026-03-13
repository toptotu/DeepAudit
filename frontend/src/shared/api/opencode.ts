/**
 * OpenCode Agent 审计 API 客户端
 */

import { apiClient } from "@/shared/api/serverClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OpenCodeServerStatus =
  | "stopped"
  | "starting"
  | "running"
  | "auditing"
  | "stopping"
  | "error";

export interface OpenCodeProject {
  id: string;
  project_id?: string;
  name: string;
  description?: string;
  code_path: string;
  port?: number;
  status: OpenCodeServerStatus;
  server_pid?: number;
  selected_skills: string[];
  selected_mcp_tools: string[];
  audit_config?: Record<string, unknown>;
  current_agent_task_id?: string;
  created_by: string;
  created_at: string;
  updated_at?: string;
  skills_detail?: OpenCodeSkill[];
  mcp_tools_detail?: MCPToolConfig[];
}

export type SkillCategory = "owasp" | "framework" | "business" | "compliance" | "custom";

export interface OpenCodeSkill {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  category: SkillCategory;
  system_prompt: string;
  tool_hints?: string[];
  vulnerability_types?: string[];
  severity_focus?: string[];
  icon?: string;
  tags?: string[];
  is_system: boolean;
  is_active: boolean;
  created_by?: string;
  created_at: string;
}

export type MCPTransportType = "http" | "stdio" | "sse";

export interface MCPToolConfig {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  transport_type: MCPTransportType;
  server_url?: string;
  command?: string;
  args?: string[];
  env_vars?: Record<string, string>;
  timeout_seconds: number;
  capabilities?: string[];
  icon?: string;
  is_active: boolean;
  is_system: boolean;
  last_test_status?: "ok" | "failed";
  last_tested_at?: string;
  created_by?: string;
  created_at: string;
}

export interface OpenCodeAuditSession {
  id: string;
  agent_task_id?: string;
  status: string;
  findings_count: number;
  messages_count: number;
  created_at: string;
  completed_at?: string;
}

export type IssueCommentType =
  | "note"
  | "confirm"
  | "reject"
  | "assign"
  | "fix"
  | "verify"
  | "reopen"
  | "accept_risk";

export interface IssueComment {
  id: string;
  finding_id: string;
  comment_type: IssueCommentType;
  content: string;
  from_status?: string;
  to_status?: string;
  author_id: string;
  author_name?: string;
  created_at: string;
}

export interface FindingStatistics {
  total: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  confirmed: number;
  false_positive: number;
  closed: number;
  confirmation_rate: number;
  false_positive_rate: number;
  closure_rate: number;
}

// ─── OpenCode Projects ────────────────────────────────────────────────────────

export interface CreateOpenCodeProjectPayload {
  name: string;
  description?: string;
  project_id?: string;
  code_path: string;
  selected_skills?: string[];
  selected_mcp_tools?: string[];
  audit_config?: Record<string, unknown>;
}

export interface UpdateOpenCodeProjectPayload {
  name?: string;
  description?: string;
  code_path?: string;
  selected_skills?: string[];
  selected_mcp_tools?: string[];
  audit_config?: Record<string, unknown>;
}

export interface AuditTriggerPayload {
  name?: string;
  description?: string;
  target_vulnerabilities?: string[];
  exclude_patterns?: string[];
  target_files?: string[];
  max_iterations?: number;
  timeout_seconds?: number;
}

export async function listOpenCodeProjects(params?: {
  skip?: number;
  limit?: number;
  status?: OpenCodeServerStatus;
}) {
  return apiClient.get<{ items: OpenCodeProject[]; total: number }>(
    "/opencode/projects",
    { params }
  );
}

export async function createOpenCodeProject(payload: CreateOpenCodeProjectPayload) {
  return apiClient.post<OpenCodeProject>("/opencode/projects", payload);
}

export async function getOpenCodeProject(projectId: string) {
  return apiClient.get<OpenCodeProject>(`/opencode/projects/${projectId}`);
}

export async function updateOpenCodeProject(
  projectId: string,
  payload: UpdateOpenCodeProjectPayload
) {
  return apiClient.patch<OpenCodeProject>(`/opencode/projects/${projectId}`, payload);
}

export async function deleteOpenCodeProject(projectId: string) {
  return apiClient.delete(`/opencode/projects/${projectId}`);
}

export async function startOpenCodeServer(projectId: string) {
  return apiClient.post<{
    message: string;
    port: number;
    pid?: number;
    status: string;
    simulated?: boolean;
  }>(`/opencode/projects/${projectId}/start`);
}

export async function stopOpenCodeServer(projectId: string) {
  return apiClient.post<{ message: string; status: string }>(
    `/opencode/projects/${projectId}/stop`
  );
}

export async function getServerStatus(projectId: string) {
  return apiClient.get<{
    status: OpenCodeServerStatus;
    port?: number;
    pid?: number;
    healthy: boolean;
    last_health_check?: string;
  }>(`/opencode/projects/${projectId}/status`);
}

export async function triggerAudit(projectId: string, payload: AuditTriggerPayload) {
  return apiClient.post<{
    message: string;
    agent_task_id: string;
    task_name: string;
    skills_count: number;
    mcp_tools_count: number;
  }>(`/opencode/projects/${projectId}/audit`, payload);
}

export async function getAuditHistory(projectId: string, params?: { skip?: number; limit?: number }) {
  return apiClient.get<{ items: OpenCodeAuditSession[]; total: number }>(
    `/opencode/projects/${projectId}/audit-history`,
    { params }
  );
}

// ─── Skills ────────────────────────────────────────────────────────────────────

export interface CreateSkillPayload {
  name: string;
  display_name: string;
  description?: string;
  category?: SkillCategory;
  system_prompt: string;
  tool_hints?: string[];
  vulnerability_types?: string[];
  severity_focus?: string[];
  icon?: string;
  tags?: string[];
}

export interface UpdateSkillPayload {
  display_name?: string;
  description?: string;
  category?: SkillCategory;
  system_prompt?: string;
  tool_hints?: string[];
  vulnerability_types?: string[];
  icon?: string;
  tags?: string[];
  is_active?: boolean;
}

export async function listSkills(params?: {
  category?: SkillCategory;
  is_active?: boolean;
  include_system?: boolean;
}) {
  return apiClient.get<{ items: OpenCodeSkill[]; total: number }>("/opencode/skills", { params });
}

export async function createSkill(payload: CreateSkillPayload) {
  return apiClient.post<OpenCodeSkill>("/opencode/skills", payload);
}

export async function getSkill(skillId: string) {
  return apiClient.get<OpenCodeSkill>(`/opencode/skills/${skillId}`);
}

export async function updateSkill(skillId: string, payload: UpdateSkillPayload) {
  return apiClient.patch<OpenCodeSkill>(`/opencode/skills/${skillId}`, payload);
}

export async function deleteSkill(skillId: string) {
  return apiClient.delete(`/opencode/skills/${skillId}`);
}

export async function previewSkillPrompt(skillId: string) {
  return apiClient.post<{ skill_id: string; system_prompt: string; combined_prompt: string }>(
    `/opencode/skills/${skillId}/preview`
  );
}

// ─── MCP Tools ────────────────────────────────────────────────────────────────

export interface CreateMCPToolPayload {
  name: string;
  display_name: string;
  description?: string;
  transport_type?: MCPTransportType;
  server_url?: string;
  command?: string;
  args?: string[];
  env_vars?: Record<string, string>;
  timeout_seconds?: number;
  capabilities?: string[];
  icon?: string;
}

export interface UpdateMCPToolPayload {
  display_name?: string;
  description?: string;
  transport_type?: MCPTransportType;
  server_url?: string;
  command?: string;
  args?: string[];
  env_vars?: Record<string, string>;
  timeout_seconds?: number;
  capabilities?: string[];
  is_active?: boolean;
}

export async function listMCPTools(params?: { is_active?: boolean }) {
  return apiClient.get<{ items: MCPToolConfig[]; total: number }>("/opencode/mcp-tools", { params });
}

export async function createMCPTool(payload: CreateMCPToolPayload) {
  return apiClient.post<MCPToolConfig>("/opencode/mcp-tools", payload);
}

export async function getMCPTool(toolId: string) {
  return apiClient.get<MCPToolConfig>(`/opencode/mcp-tools/${toolId}`);
}

export async function updateMCPTool(toolId: string, payload: UpdateMCPToolPayload) {
  return apiClient.patch<MCPToolConfig>(`/opencode/mcp-tools/${toolId}`, payload);
}

export async function deleteMCPTool(toolId: string) {
  return apiClient.delete(`/opencode/mcp-tools/${toolId}`);
}

export async function testMCPTool(toolId: string) {
  return apiClient.post<{ success: boolean; error?: string; tested_at: string }>(
    `/opencode/mcp-tools/${toolId}/test`
  );
}

// ─── Issue Management ─────────────────────────────────────────────────────────

export async function listFindingComments(findingId: string) {
  return apiClient.get<{ items: IssueComment[]; total: number }>(
    `/opencode/findings/${findingId}/comments`
  );
}

export interface AddCommentPayload {
  comment_type?: IssueCommentType;
  content: string;
  assignee_id?: string;
  due_date?: string;
}

export async function addFindingComment(findingId: string, payload: AddCommentPayload) {
  return apiClient.post<IssueComment>(`/opencode/findings/${findingId}/comments`, payload);
}

export interface ReviewFindingPayload {
  action: "confirm" | "reject" | "accept_risk" | "close" | "reopen";
  notes?: string;
  assignee_id?: string;
  due_date?: string;
}

export async function reviewFinding(findingId: string, payload: ReviewFindingPayload) {
  return apiClient.patch(`/opencode/findings/${findingId}/review`, payload);
}

export interface BatchUpdatePayload {
  finding_ids: string[];
  status?: string;
  assignee_id?: string;
  due_date?: string;
}

export async function batchUpdateFindings(payload: BatchUpdatePayload) {
  return apiClient.post<{ updated: number; total: number }>(
    "/opencode/findings/batch-update",
    payload
  );
}

export async function getFindingsStatistics(taskId: string) {
  return apiClient.get<FindingStatistics>(
    `/opencode/tasks/${taskId}/findings/statistics`
  );
}
