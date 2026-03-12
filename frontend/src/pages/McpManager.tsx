/**
 * MCP Server Management Page
 * Cyberpunk Terminal Aesthetic
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Edit,
  Search,
  Terminal,
  RefreshCw,
  Plug,
  Activity,
  Server,
  Globe,
  Wifi,
  WifiOff,
  CheckCircle,
  XCircle,
  HelpCircle,
  Link,
  Settings,
  Download,
} from 'lucide-react';
import {
  getMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  healthCheckMcpServer,
  type McpServer,
  type McpServerCreate,
} from '@/shared/api/mcpServers';
import {
  getCodeCodeConfig,
  updateCodeCodeConfig,
  testCodeCodeConnection,
  listRemoteSkills,
  downloadRemoteSkill,
  type CodeCodeConfig,
  type CodeCodeConfigResponse,
  type RemoteSkillItem,
} from '@/shared/api/codecode';

const SERVER_TYPES = [
  { value: 'stdio', label: 'Stdio', desc: '标准输入输出' },
  { value: 'sse', label: 'SSE', desc: 'Server-Sent Events' },
  { value: 'streamable-http', label: 'Streamable HTTP', desc: 'HTTP 流式' },
];

const HEALTH_ICONS: Record<string, React.ReactNode> = {
  healthy: <CheckCircle className="w-4 h-4 text-emerald-400" />,
  unhealthy: <XCircle className="w-4 h-4 text-rose-400" />,
  unknown: <HelpCircle className="w-4 h-4 text-amber-400" />,
};

export default function McpManager() {
  const [activeTab, setActiveTab] = useState('mcp-servers');

  const [servers, setServers] = useState<McpServer[]>([]);
  const [totalServers, setTotalServers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [formData, setFormData] = useState<McpServerCreate>({
    name: '',
    server_type: 'stdio',
    is_active: true,
    timeout_seconds: 30,
    max_retries: 3,
  });

  const [codeCodeConfig, setCodeCodeConfig] = useState<CodeCodeConfigResponse | null>(null);
  const [ccForm, setCcForm] = useState<CodeCodeConfig>({ server_url: '', auto_sync: false, sync_interval_minutes: 60 });
  const [ccTesting, setCcTesting] = useState(false);
  const [remoteSkills, setRemoteSkills] = useState<RemoteSkillItem[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);

  const fetchServers = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (search) params.search = search;
      const res = await getMcpServers(params);
      setServers(res.items);
      setTotalServers(res.total);
    } catch { toast.error('获取 MCP 服务列表失败'); }
    finally { setLoading(false); }
  };

  const fetchCodeCodeConfig = async () => {
    try {
      const res = await getCodeCodeConfig();
      setCodeCodeConfig(res);
      setCcForm({ server_url: res.server_url, api_key: res.api_key, auto_sync: res.auto_sync, sync_interval_minutes: res.sync_interval_minutes });
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchServers(); fetchCodeCodeConfig(); }, []);
  useEffect(() => { fetchServers(); }, [search]);

  const handleCreate = async () => {
    if (!formData.name.trim()) { toast.error('请输入服务名称'); return; }
    try {
      await createMcpServer(formData);
      toast.success('MCP 服务创建成功');
      setShowCreateDialog(false);
      resetForm();
      fetchServers();
    } catch { toast.error('创建失败'); }
  };

  const handleUpdate = async () => {
    if (!editingServer) return;
    try {
      await updateMcpServer(editingServer.id, formData);
      toast.success('MCP 服务更新成功');
      setEditingServer(null);
      resetForm();
      fetchServers();
    } catch { toast.error('更新失败'); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除 MCP 服务「${name}」？`)) return;
    try {
      await deleteMcpServer(id);
      toast.success('已删除');
      fetchServers();
    } catch { toast.error('删除失败'); }
  };

  const handleToggle = async (id: string) => {
    try {
      const res = await toggleMcpServer(id);
      toast.success(res.message);
      fetchServers();
    } catch { toast.error('切换状态失败'); }
  };

  const handleHealthCheck = async (id: string) => {
    try {
      const res = await healthCheckMcpServer(id);
      toast.success(`健康状态: ${res.health_status}`);
      fetchServers();
    } catch { toast.error('健康检查失败'); }
  };

  const resetForm = () => {
    setFormData({ name: '', server_type: 'stdio', is_active: true, timeout_seconds: 30, max_retries: 3 });
  };

  const openEdit = (server: McpServer) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      description: server.description,
      server_type: server.server_type,
      command: server.command,
      args: server.args,
      env: server.env,
      url: server.url,
      api_key: server.api_key,
      headers: server.headers,
      is_active: server.is_active,
      config: server.config,
      timeout_seconds: server.timeout_seconds,
      max_retries: server.max_retries,
    });
  };

  const handleSaveCodeCode = async () => {
    if (!ccForm.server_url.trim()) { toast.error('请输入服务器地址'); return; }
    try {
      const res = await updateCodeCodeConfig(ccForm);
      setCodeCodeConfig(res);
      toast.success('配置已保存');
    } catch { toast.error('保存失败'); }
  };

  const handleTestConnection = async () => {
    setCcTesting(true);
    try {
      const res = await testCodeCodeConnection(ccForm);
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
    } catch { toast.error('测试连接失败'); }
    finally { setCcTesting(false); }
  };

  const handleFetchRemote = async () => {
    setLoadingRemote(true);
    try {
      const res = await listRemoteSkills();
      setRemoteSkills(res.items);
      toast.success(`获取到 ${res.items.length} 个远程技能包`);
    } catch { toast.error('获取远程技能包失败'); }
    finally { setLoadingRemote(false); }
  };

  const handleDownloadRemote = async (skill: RemoteSkillItem) => {
    try {
      const res = await downloadRemoteSkill(skill.id);
      toast.success(res.message);
    } catch { toast.error('下载失败'); }
  };

  const renderServerForm = () => (
    <div className="space-y-4">
      <div><Label>名称 *</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="MCP 服务名称" /></div>
      <div><Label>描述</Label><Textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
      <div>
        <Label>服务类型</Label>
        <Select value={formData.server_type} onValueChange={v => setFormData({ ...formData, server_type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {SERVER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label} - {t.desc}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {formData.server_type === 'stdio' ? (
        <>
          <div><Label>命令</Label><Input value={formData.command || ''} onChange={e => setFormData({ ...formData, command: e.target.value })} placeholder="例如: npx -y @modelcontextprotocol/server-everything" /></div>
          <div><Label>参数 (逗号分隔)</Label><Input value={(formData.args || []).join(', ')} onChange={e => setFormData({ ...formData, args: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="--port, 3000" /></div>
        </>
      ) : (
        <div><Label>URL</Label><Input value={formData.url || ''} onChange={e => setFormData({ ...formData, url: e.target.value })} placeholder="https://mcp-server.example.com/sse" /></div>
      )}
      <div><Label>API Key</Label><Input type="password" value={formData.api_key || ''} onChange={e => setFormData({ ...formData, api_key: e.target.value })} placeholder="可选" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>超时时间(秒)</Label><Input type="number" value={formData.timeout_seconds} onChange={e => setFormData({ ...formData, timeout_seconds: parseInt(e.target.value) || 30 })} /></div>
        <div><Label>最大重试</Label><Input type="number" value={formData.max_retries} onChange={e => setFormData({ ...formData, max_retries: parseInt(e.target.value) || 3 })} /></div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/20 border border-primary/40">
          <Plug className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-mono" style={{ color: 'var(--cyber-text)' }}>
            MCP 管理
          </h1>
          <p className="text-sm" style={{ color: 'var(--cyber-text-muted)' }}>
            管理 Model Context Protocol 服务 & CodeCode 对接
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="mcp-servers" className="font-mono text-sm">
            <Server className="w-4 h-4 mr-1" /> MCP 服务 ({totalServers})
          </TabsTrigger>
          <TabsTrigger value="codecode" className="font-mono text-sm">
            <Link className="w-4 h-4 mr-1" /> CodeCode 对接
          </TabsTrigger>
        </TabsList>

        {/* MCP Servers Tab */}
        <TabsContent value="mcp-servers" className="space-y-4 mt-4">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="搜索 MCP 服务..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-card/60 border-border/50" />
            </div>
            <Button variant="ghost" size="icon" onClick={fetchServers}><RefreshCw className="w-4 h-4" /></Button>
            <Button size="sm" onClick={() => { resetForm(); setShowCreateDialog(true); }} className="bg-primary hover:bg-primary/90 text-white">
              <Plus className="w-4 h-4 mr-1" /> 添加服务
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Terminal className="w-5 h-5 animate-pulse text-primary mr-2" />
              <span className="text-muted-foreground font-mono text-sm">加载中...</span>
            </div>
          ) : servers.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground font-mono">
              <Server className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>暂无 MCP 服务</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {servers.map(server => (
                <div key={server.id} className="rounded-lg border border-border/50 bg-card/60 p-4 hover:border-primary/30 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 flex-shrink-0">
                        {server.is_active ? <Wifi className="w-5 h-5 text-primary" /> : <WifiOff className="w-5 h-5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-semibold text-sm" style={{ color: 'var(--cyber-text)' }}>{server.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {SERVER_TYPES.find(t => t.value === server.server_type)?.label || server.server_type}
                          </Badge>
                          <span className="flex items-center gap-1 text-xs">
                            {HEALTH_ICONS[server.health_status] || HEALTH_ICONS.unknown}
                            {server.health_status}
                          </span>
                        </div>
                        {server.description && <p className="text-xs text-muted-foreground mb-1">{server.description}</p>}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {server.command && <span className="font-mono truncate max-w-xs">{server.command}</span>}
                          {server.url && <span className="font-mono truncate max-w-xs">{server.url}</span>}
                          <span>超时: {server.timeout_seconds}s</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                      <Switch checked={server.is_active} onCheckedChange={() => handleToggle(server.id)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleHealthCheck(server.id)} title="健康检查">
                        <Activity className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(server)} title="编辑">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(server.id, server.name)} title="删除">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CodeCode Tab */}
        <TabsContent value="codecode" className="space-y-6 mt-4">
          <div className="rounded-lg border border-border/50 bg-card/60 p-6 space-y-4">
            <h3 className="font-mono font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--cyber-text)' }}>
              <Settings className="w-4 h-4 text-primary" /> CodeCode 连接配置
            </h3>
            <div className="space-y-3">
              <div><Label>GoDeepAudit 服务器地址 *</Label><Input value={ccForm.server_url} onChange={e => setCcForm({ ...ccForm, server_url: e.target.value })} placeholder="https://your-godeepaudit-server.com" /></div>
              <div><Label>API Key</Label><Input type="password" value={ccForm.api_key || ''} onChange={e => setCcForm({ ...ccForm, api_key: e.target.value })} placeholder="可选的 API Key" /></div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={ccForm.auto_sync} onCheckedChange={v => setCcForm({ ...ccForm, auto_sync: v })} />
                  <Label>自动同步</Label>
                </div>
                {ccForm.auto_sync && (
                  <div className="flex items-center gap-2">
                    <Label>间隔(分钟)</Label>
                    <Input type="number" value={ccForm.sync_interval_minutes} onChange={e => setCcForm({ ...ccForm, sync_interval_minutes: parseInt(e.target.value) || 60 })} className="w-24" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={ccTesting}>
                <Activity className="w-4 h-4 mr-1" /> {ccTesting ? '测试中...' : '测试连接'}
              </Button>
              <Button size="sm" onClick={handleSaveCodeCode} className="bg-primary text-white">保存配置</Button>
            </div>
          </div>

          {/* Remote Skills */}
          <div className="rounded-lg border border-border/50 bg-card/60 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono font-semibold text-sm flex items-center gap-2" style={{ color: 'var(--cyber-text)' }}>
                <Globe className="w-4 h-4 text-primary" /> 远程技能包
              </h3>
              <Button variant="outline" size="sm" onClick={handleFetchRemote} disabled={loadingRemote}>
                <RefreshCw className={`w-4 h-4 mr-1 ${loadingRemote ? 'animate-spin' : ''}`} />
                {loadingRemote ? '获取中...' : '获取列表'}
              </Button>
            </div>
            {remoteSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">点击「获取列表」查看远程技能包</p>
            ) : (
              <div className="grid gap-2">
                {remoteSkills.map(skill => (
                  <div key={skill.id} className="flex items-center justify-between p-3 rounded-md border border-border/30 bg-background/50">
                    <div>
                      <span className="font-mono text-sm font-medium" style={{ color: 'var(--cyber-text)' }}>{skill.name}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>v{skill.version}</span>
                        <span>{skill.category}</span>
                        {skill.description && <span className="truncate max-w-xs">{skill.description}</span>}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleDownloadRemote(skill)}>
                      <Download className="w-4 h-4 mr-1" /> 下载
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-mono">添加 MCP 服务</DialogTitle></DialogHeader>
          {renderServerForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleCreate} className="bg-primary text-white">创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingServer} onOpenChange={open => { if (!open) { setEditingServer(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-mono">编辑 MCP 服务</DialogTitle></DialogHeader>
          {renderServerForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingServer(null); resetForm(); }}>取消</Button>
            <Button onClick={handleUpdate} className="bg-primary text-white">保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
