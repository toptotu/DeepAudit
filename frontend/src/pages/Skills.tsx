/**
 * Skills Management Page
 * Cyberpunk Terminal Aesthetic
 */

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Edit,
  Download,
  Upload,
  Package,
  Search,
  Terminal,
  ToggleLeft,
  FileArchive,
  RefreshCw,
  Globe,
} from 'lucide-react';
import {
  getSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  uploadSkill,
  toggleSkill,
  getSkillDownloadUrl,
  type Skill,
  type SkillCreate,
} from '@/shared/api/skills';

const CATEGORIES = [
  { value: 'general', label: '通用' },
  { value: 'security', label: '安全审计' },
  { value: 'code-review', label: '代码审查' },
  { value: 'performance', label: '性能分析' },
  { value: 'compliance', label: '合规检查' },
  { value: 'custom', label: '自定义' },
];

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

  const [formData, setFormData] = useState<SkillCreate>({
    name: '',
    description: '',
    version: '1.0.0',
    category: 'general',
    is_active: true,
  });

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadVersion, setUploadVersion] = useState('1.0.0');
  const [uploadCategory, setUploadCategory] = useState('general');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      const res = await getSkills(params);
      setSkills(res.items);
      setTotal(res.total);
    } catch {
      toast.error('获取技能包列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSkills(); }, [search, categoryFilter]);

  const handleCreate = async () => {
    if (!formData.name.trim()) { toast.error('请输入技能包名称'); return; }
    try {
      await createSkill(formData);
      toast.success('技能包创建成功');
      setShowCreateDialog(false);
      setFormData({ name: '', description: '', version: '1.0.0', category: 'general', is_active: true });
      fetchSkills();
    } catch { toast.error('创建失败'); }
  };

  const handleUpdate = async () => {
    if (!editingSkill) return;
    try {
      await updateSkill(editingSkill.id, formData);
      toast.success('技能包更新成功');
      setEditingSkill(null);
      fetchSkills();
    } catch { toast.error('更新失败'); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定删除技能包「${name}」？`)) return;
    try {
      await deleteSkill(id);
      toast.success('已删除');
      fetchSkills();
    } catch { toast.error('删除失败'); }
  };

  const handleToggle = async (id: string) => {
    try {
      const res = await toggleSkill(id);
      toast.success(res.message);
      fetchSkills();
    } catch { toast.error('切换状态失败'); }
  };

  const handleUpload = async () => {
    if (!uploadFile) { toast.error('请选择 ZIP 文件'); return; }
    if (!uploadName.trim()) { toast.error('请输入技能包名称'); return; }
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('name', uploadName);
      fd.append('description', uploadDesc);
      fd.append('version', uploadVersion);
      fd.append('category', uploadCategory);
      await uploadSkill(fd);
      toast.success('上传成功');
      setShowUploadDialog(false);
      setUploadFile(null);
      setUploadName('');
      setUploadDesc('');
      setUploadVersion('1.0.0');
      setUploadCategory('general');
      fetchSkills();
    } catch { toast.error('上传失败'); }
  };

  const handleDownload = (skill: Skill) => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const url = getSkillDownloadUrl(skill.id);
    const a = document.createElement('a');
    a.href = `${url}?token=${token}`;
    a.download = skill.original_filename || `${skill.name}.zip`;
    a.click();
  };

  const openEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setFormData({
      name: skill.name,
      description: skill.description || '',
      version: skill.version,
      category: skill.category,
      tags: skill.tags,
      is_active: skill.is_active,
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/20 border border-primary/40">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-mono" style={{ color: 'var(--cyber-text)' }}>
              Skills 管理
            </h1>
            <p className="text-sm" style={{ color: 'var(--cyber-text-muted)' }}>
              管理审计技能包 · 共 {total} 个
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowUploadDialog(true)}
            className="border-primary/40 text-primary hover:bg-primary/10">
            <Upload className="w-4 h-4 mr-1" /> 上传 ZIP
          </Button>
          <Button size="sm" onClick={() => { setFormData({ name: '', description: '', version: '1.0.0', category: 'general', is_active: true }); setShowCreateDialog(true); }}
            className="bg-primary hover:bg-primary/90 text-white">
            <Plus className="w-4 h-4 mr-1" /> 新建
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="搜索技能包..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card/60 border-border/50" />
        </div>
        <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40 bg-card/60 border-border/50">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={fetchSkills}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Skills List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Terminal className="w-5 h-5 animate-pulse text-primary mr-2" />
          <span className="text-muted-foreground font-mono text-sm">加载中...</span>
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground font-mono">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无技能包</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {skills.map(skill => (
            <div key={skill.id} className="rounded-lg border border-border/50 bg-card/60 p-4 hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 flex-shrink-0">
                    <FileArchive className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-semibold text-sm" style={{ color: 'var(--cyber-text)' }}>{skill.name}</span>
                      <Badge variant="outline" className="text-xs">{skill.version}</Badge>
                      <Badge variant={skill.is_active ? "default" : "secondary"} className="text-xs">
                        {skill.is_active ? '启用' : '禁用'}
                      </Badge>
                      {skill.source !== 'local' && (
                        <Badge variant="outline" className="text-xs">
                          <Globe className="w-3 h-3 mr-1" />
                          {skill.source}
                        </Badge>
                      )}
                    </div>
                    {skill.description && (
                      <p className="text-xs text-muted-foreground mb-1 line-clamp-2">{skill.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{CATEGORIES.find(c => c.value === skill.category)?.label || skill.category}</span>
                      <span>{formatSize(skill.file_size)}</span>
                      <span>下载 {skill.download_count} 次</span>
                      {skill.created_at && <span>{new Date(skill.created_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                  <Switch checked={skill.is_active} onCheckedChange={() => handleToggle(skill.id)} />
                  {skill.file_path && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(skill)} title="下载">
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                  {!skill.is_system && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(skill)} title="编辑">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(skill.id, skill.name)} title="删除">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">新建技能包</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>名称 *</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="技能包名称" /></div>
            <div><Label>描述</Label><Textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="技能包描述" rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>版本</Label><Input value={formData.version || '1.0.0'} onChange={e => setFormData({ ...formData, version: e.target.value })} /></div>
              <div>
                <Label>分类</Label>
                <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleCreate} className="bg-primary text-white">创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingSkill} onOpenChange={open => !open && setEditingSkill(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">编辑技能包</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>名称 *</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><Label>描述</Label><Textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>版本</Label><Input value={formData.version || '1.0.0'} onChange={e => setFormData({ ...formData, version: e.target.value })} /></div>
              <div>
                <Label>分类</Label>
                <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSkill(null)}>取消</Button>
            <Button onClick={handleUpdate} className="bg-primary text-white">保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">上传技能包</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>ZIP 文件 *</Label>
              <div
                className="mt-1 border-2 border-dashed border-border/50 rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".zip" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadFile(f); if (!uploadName) setUploadName(f.name.replace(/\.zip$/i, '')); } }} />
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileArchive className="w-5 h-5 text-primary" />
                    <span className="text-sm font-mono">{uploadFile.name}</span>
                    <span className="text-xs text-muted-foreground">({formatSize(uploadFile.size)})</span>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">点击选择或拖拽 ZIP 文件</p>
                  </div>
                )}
              </div>
            </div>
            <div><Label>名称 *</Label><Input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="技能包名称" /></div>
            <div><Label>描述</Label><Textarea value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} placeholder="技能包描述" rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>版本</Label><Input value={uploadVersion} onChange={e => setUploadVersion(e.target.value)} /></div>
              <div>
                <Label>分类</Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>取消</Button>
            <Button onClick={handleUpload} className="bg-primary text-white">
              <Upload className="w-4 h-4 mr-1" /> 上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
