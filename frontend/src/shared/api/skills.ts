import { apiClient } from './serverClient';

export interface Skill {
  id: string;
  name: string;
  description?: string;
  version: string;
  category: string;
  tags?: string[];
  config?: Record<string, any>;
  entry_point?: string;
  is_active: boolean;
  file_path?: string;
  file_size: number;
  file_hash?: string;
  original_filename?: string;
  is_system: boolean;
  download_count: number;
  source: string;
  source_url?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SkillCreate {
  name: string;
  description?: string;
  version?: string;
  category?: string;
  tags?: string[];
  config?: Record<string, any>;
  entry_point?: string;
  is_active?: boolean;
}

export interface SkillUpdate {
  name?: string;
  description?: string;
  version?: string;
  category?: string;
  tags?: string[];
  config?: Record<string, any>;
  entry_point?: string;
  is_active?: boolean;
}

export interface SkillListResponse {
  items: Skill[];
  total: number;
}

export async function getSkills(params?: {
  skip?: number;
  limit?: number;
  category?: string;
  is_active?: boolean;
  search?: string;
}): Promise<SkillListResponse> {
  const { data } = await apiClient.get('/skills', { params });
  return data;
}

export async function getSkill(id: string): Promise<Skill> {
  const { data } = await apiClient.get(`/skills/${id}`);
  return data;
}

export async function createSkill(skill: SkillCreate): Promise<Skill> {
  const { data } = await apiClient.post('/skills', skill);
  return data;
}

export async function uploadSkill(formData: FormData): Promise<Skill> {
  const { data } = await apiClient.post('/skills/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function updateSkill(id: string, skill: SkillUpdate): Promise<Skill> {
  const { data } = await apiClient.put(`/skills/${id}`, skill);
  return data;
}

export async function deleteSkill(id: string): Promise<void> {
  await apiClient.delete(`/skills/${id}`);
}

export async function toggleSkill(id: string): Promise<{ is_active: boolean; message: string }> {
  const { data } = await apiClient.put(`/skills/${id}/toggle`);
  return data;
}

export function getSkillDownloadUrl(id: string): string {
  const baseURL = apiClient.defaults.baseURL || '/api/v1';
  return `${baseURL}/skills/${id}/download`;
}
