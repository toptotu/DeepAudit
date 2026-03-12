import { apiClient } from './serverClient';

export interface CodeCodeConfig {
  server_url: string;
  api_key?: string;
  auto_sync: boolean;
  sync_interval_minutes: number;
}

export interface CodeCodeConfigResponse extends CodeCodeConfig {
  is_connected: boolean;
  last_sync_at?: string;
}

export interface RemoteSkillItem {
  id: string;
  name: string;
  description?: string;
  version: string;
  category: string;
  file_size: number;
  download_count: number;
}

export interface RemoteSkillListResponse {
  items: RemoteSkillItem[];
  total: number;
  server_url: string;
}

export async function getCodeCodeConfig(): Promise<CodeCodeConfigResponse> {
  const { data } = await apiClient.get('/codecode/config');
  return data;
}

export async function updateCodeCodeConfig(config: CodeCodeConfig): Promise<CodeCodeConfigResponse> {
  const { data } = await apiClient.put('/codecode/config', config);
  return data;
}

export async function testCodeCodeConnection(config: CodeCodeConfig): Promise<{ success: boolean; message: string }> {
  const { data } = await apiClient.post('/codecode/test-connection', config);
  return data;
}

export async function listRemoteSkills(): Promise<RemoteSkillListResponse> {
  const { data } = await apiClient.get('/codecode/remote-skills');
  return data;
}

export async function downloadRemoteSkill(remoteSkillId: string): Promise<{
  success: boolean;
  message: string;
  skill_id: string;
}> {
  const { data } = await apiClient.post(`/codecode/download-skill/${remoteSkillId}`);
  return data;
}
