import { apiClient } from './serverClient';

export interface McpServer {
  id: string;
  name: string;
  description?: string;
  server_type: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  api_key?: string;
  headers?: Record<string, string>;
  tools?: Array<Record<string, any>>;
  resources?: Array<Record<string, any>>;
  prompts_config?: Array<Record<string, any>>;
  is_active: boolean;
  health_status: string;
  last_health_check?: string;
  config?: Record<string, any>;
  timeout_seconds: number;
  max_retries: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface McpServerCreate {
  name: string;
  description?: string;
  server_type: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  api_key?: string;
  headers?: Record<string, string>;
  is_active?: boolean;
  config?: Record<string, any>;
  timeout_seconds?: number;
  max_retries?: number;
}

export interface McpServerUpdate {
  name?: string;
  description?: string;
  server_type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  api_key?: string;
  headers?: Record<string, string>;
  is_active?: boolean;
  config?: Record<string, any>;
  timeout_seconds?: number;
  max_retries?: number;
}

export interface McpServerListResponse {
  items: McpServer[];
  total: number;
}

export async function getMcpServers(params?: {
  skip?: number;
  limit?: number;
  server_type?: string;
  is_active?: boolean;
  search?: string;
}): Promise<McpServerListResponse> {
  const { data } = await apiClient.get('/mcp-servers', { params });
  return data;
}

export async function getMcpServer(id: string): Promise<McpServer> {
  const { data } = await apiClient.get(`/mcp-servers/${id}`);
  return data;
}

export async function createMcpServer(server: McpServerCreate): Promise<McpServer> {
  const { data } = await apiClient.post('/mcp-servers', server);
  return data;
}

export async function updateMcpServer(id: string, server: McpServerUpdate): Promise<McpServer> {
  const { data } = await apiClient.put(`/mcp-servers/${id}`, server);
  return data;
}

export async function deleteMcpServer(id: string): Promise<void> {
  await apiClient.delete(`/mcp-servers/${id}`);
}

export async function toggleMcpServer(id: string): Promise<{ is_active: boolean; message: string }> {
  const { data } = await apiClient.put(`/mcp-servers/${id}/toggle`);
  return data;
}

export async function healthCheckMcpServer(id: string): Promise<{
  server_id: string;
  health_status: string;
  error?: string;
  checked_at: string;
}> {
  const { data } = await apiClient.post(`/mcp-servers/${id}/health-check`);
  return data;
}
