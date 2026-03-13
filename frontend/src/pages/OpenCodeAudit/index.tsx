/**
 * OpenCode Agent 审计页面
 *
 * 功能:
 * - OpenCode 审计项目管理 (CRUD)
 * - 服务器启动/停止
 * - Skills 和 MCP 工具选择
 * - 审计任务触发
 * - 审计历史查看
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Bot, FolderCode, Radio, RefreshCw,
  Loader2, AlertCircle, Play, History, BarChart2, Layers,
} from "lucide-react";
import { toast } from "sonner";
import {
  listOpenCodeProjects,
  startOpenCodeServer,
  stopOpenCodeServer,
  deleteOpenCodeProject,
  triggerAudit,
  getAuditHistory,
} from "@/shared/api/opencode";
import type {
  OpenCodeProject,
  OpenCodeAuditSession,
  AuditTriggerPayload,
} from "@/shared/api/opencode";
import ProjectCard from "./components/ProjectCard";
import CreateProjectDialog from "./components/CreateProjectDialog";

const DEFAULT_VULN_TYPES = [
  "sql_injection",
  "xss",
  "command_injection",
  "path_traversal",
  "ssrf",
  "auth_bypass",
  "hardcoded_secret",
];

export default function OpenCodeAuditPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<OpenCodeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [operatingIds, setOperatingIds] = useState<Set<string>>(new Set());

  // 对话框状态
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editProject, setEditProject] = useState<OpenCodeProject | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OpenCodeProject | null>(null);
  const [auditProject, setAuditProject] = useState<OpenCodeProject | null>(null);
  const [historyProject, setHistoryProject] = useState<OpenCodeProject | null>(null);
  const [auditHistory, setAuditHistory] = useState<OpenCodeAuditSession[]>([]);

  // 审计配置
  const [auditConfig, setAuditConfig] = useState<AuditTriggerPayload>({
    target_vulnerabilities: DEFAULT_VULN_TYPES,
    exclude_patterns: ["node_modules", "__pycache__", ".git", "*.min.js"],
    max_iterations: 50,
    timeout_seconds: 1800,
  });

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listOpenCodeProjects({ limit: 100 });
      setProjects(res.data.items || []);
    } catch {
      toast.error("加载 OpenCode 项目失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    // 定时刷新运行中的项目状态
    const timer = setInterval(() => {
      const hasRunning = projects.some(
        (p) => p.status === "running" || p.status === "auditing" || p.status === "starting"
      );
      if (hasRunning) {
        fetchProjects();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchProjects, projects.length]);

  const setOperating = (id: string, busy: boolean) => {
    setOperatingIds((prev) => {
      const next = new Set(prev);
      busy ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const handleStart = async (project: OpenCodeProject) => {
    setOperating(project.id, true);
    try {
      const res = await startOpenCodeServer(project.id);
      if (res.data.simulated) {
        toast.warning("模拟模式：OpenCode 未安装，仅更新状态");
      } else {
        toast.success(`服务器已启动，端口: ${res.data.port}`);
      }
      await fetchProjects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "启动失败";
      toast.error(msg);
    } finally {
      setOperating(project.id, false);
    }
  };

  const handleStop = async (project: OpenCodeProject) => {
    setOperating(project.id, true);
    try {
      await stopOpenCodeServer(project.id);
      toast.success("服务器已停止");
      await fetchProjects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "停止失败";
      toast.error(msg);
    } finally {
      setOperating(project.id, false);
    }
  };

  const handleDelete = async (project: OpenCodeProject) => {
    setOperating(project.id, true);
    try {
      await deleteOpenCodeProject(project.id);
      toast.success("项目已删除");
      setDeleteConfirm(null);
      await fetchProjects();
    } catch (err: unknown) {
      toast.error("删除失败");
    } finally {
      setOperating(project.id, false);
    }
  };

  const handleTriggerAudit = async () => {
    if (!auditProject) return;
    setOperating(auditProject.id, true);
    try {
      const res = await triggerAudit(auditProject.id, auditConfig);
      toast.success(`审计已启动！使用了 ${res.data.skills_count} 个 Skills`);
      setAuditProject(null);
      await fetchProjects();
      // 跳转到 Agent Audit 页面查看进度
      navigate(`/agent-audit/${res.data.agent_task_id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "启动审计失败";
      toast.error(msg);
    } finally {
      setOperating(auditProject.id, false);
    }
  };

  const handleViewHistory = async (project: OpenCodeProject) => {
    setHistoryProject(project);
    try {
      const res = await getAuditHistory(project.id);
      setAuditHistory(res.data.items || []);
    } catch {
      toast.error("加载审计历史失败");
    }
  };

  const filtered = projects.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code_path.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: projects.length,
    running: projects.filter((p) => p.status === "running").length,
    auditing: projects.filter((p) => p.status === "auditing").length,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 页面头部 */}
      <div className="px-6 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">OpenCode Agent 审计</h1>
              <p className="text-xs text-muted-foreground">
                基于 OpenCode 的项目级安全审计，支持 Skills 和 MCP 工具注入
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 统计徽章 */}
            <div className="flex gap-2 mr-2">
              {stats.running > 0 && (
                <Badge variant="outline" className="text-xs border-emerald-500/50 text-emerald-400">
                  {stats.running} 运行中
                </Badge>
              )}
              {stats.auditing > 0 && (
                <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-400 animate-pulse">
                  {stats.auditing} 审计中
                </Badge>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={fetchProjects}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditProject(null);
                setShowCreateDialog(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              新建项目
            </Button>
          </div>
        </div>
      </div>

      {/* 主体内容 */}
      <div className="flex-1 overflow-auto p-6">
        {/* 搜索栏 */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索项目名称或路径..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            <Loader2 className="animate-spin h-5 w-5 mr-2" />
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <FolderCode className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">
              {search ? "未找到匹配的项目" : "暂无 OpenCode 审计项目"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {search
                ? "尝试修改搜索关键词"
                : "创建第一个 OpenCode 审计项目，开始基于 AI Agent 的代码安全审计"}
            </p>
            {!search && (
              <Button
                size="sm"
                onClick={() => {
                  setEditProject(null);
                  setShowCreateDialog(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                新建项目
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isOperating={operatingIds.has(project.id)}
                onStart={handleStart}
                onStop={handleStop}
                onAudit={(p) => setAuditProject(p)}
                onEdit={(p) => {
                  setEditProject(p);
                  setShowCreateDialog(true);
                }}
                onDelete={(p) => setDeleteConfirm(p)}
                onViewResults={(p) =>
                  p.current_agent_task_id &&
                  navigate(`/agent-audit/${p.current_agent_task_id}`)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* 创建/编辑对话框 */}
      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setEditProject(null);
        }}
        editProject={editProject}
        onSuccess={(project) => {
          fetchProjects();
        }}
      />

      {/* 删除确认对话框 */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              确认删除
            </DialogTitle>
            <DialogDescription className="text-xs">
              确定要删除项目 <strong>{deleteConfirm?.name}</strong> 吗？
              如果服务正在运行，将先自动停止。此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteConfirm ? operatingIds.has(deleteConfirm.id) : false}
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              {deleteConfirm && operatingIds.has(deleteConfirm.id) && (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              )}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 审计触发对话框 */}
      <Dialog open={!!auditProject} onOpenChange={(open) => !open && setAuditProject(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              启动 OpenCode 审计
            </DialogTitle>
            <DialogDescription className="text-xs">
              项目: <strong>{auditProject?.name}</strong> · 路径: {auditProject?.code_path}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">任务名称（可选）</Label>
              <Input
                placeholder="自动生成"
                value={auditConfig.name || ""}
                onChange={(e) => setAuditConfig({ ...auditConfig, name: e.target.value })}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">关注漏洞类型</Label>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_VULN_TYPES.map((vt) => {
                  const selected = auditConfig.target_vulnerabilities?.includes(vt);
                  return (
                    <button
                      key={vt}
                      onClick={() => {
                        const current = auditConfig.target_vulnerabilities || [];
                        setAuditConfig({
                          ...auditConfig,
                          target_vulnerabilities: selected
                            ? current.filter((x) => x !== vt)
                            : [...current, vt],
                        });
                      }}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {vt}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">最大迭代次数</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={auditConfig.max_iterations || 50}
                  onChange={(e) =>
                    setAuditConfig({ ...auditConfig, max_iterations: parseInt(e.target.value) })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">超时（秒）</Label>
                <Input
                  type="number"
                  min={60}
                  max={7200}
                  value={auditConfig.timeout_seconds || 1800}
                  onChange={(e) =>
                    setAuditConfig({ ...auditConfig, timeout_seconds: parseInt(e.target.value) })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {auditProject && (
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <span>
                  <span className="text-foreground font-medium">{auditProject.selected_skills.length}</span> Skills 将注入
                </span>
                <Separator orientation="vertical" className="h-4" />
                <span>
                  <span className="text-foreground font-medium">{auditProject.selected_mcp_tools.length}</span> MCP 工具已配置
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAuditProject(null)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleTriggerAudit}
              disabled={auditProject ? operatingIds.has(auditProject.id) : false}
            >
              {auditProject && operatingIds.has(auditProject.id) ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              启动审计
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 审计历史对话框 */}
      <Dialog open={!!historyProject} onOpenChange={(open) => !open && setHistoryProject(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              审计历史 - {historyProject?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            {auditHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                暂无审计历史
              </div>
            ) : (
              <div className="space-y-2">
                {auditHistory.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      session.status === "completed"
                        ? "bg-emerald-400"
                        : session.status === "failed"
                        ? "bg-red-400"
                        : "bg-yellow-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">
                        {new Date(session.created_at).toLocaleString("zh-CN")}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {session.findings_count} 个发现 · {session.status}
                      </div>
                    </div>
                    {session.agent_task_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => {
                          setHistoryProject(null);
                          navigate(`/agent-audit/${session.agent_task_id}`);
                        }}
                      >
                        查看
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
