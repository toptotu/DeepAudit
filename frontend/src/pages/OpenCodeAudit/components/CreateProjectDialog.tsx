/**
 * 创建/编辑 OpenCode 审计项目对话框
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FolderCode, Shield, Terminal } from "lucide-react";
import { toast } from "sonner";
import {
  createOpenCodeProject,
  updateOpenCodeProject,
} from "@/shared/api/opencode";
import type {
  OpenCodeProject,
  CreateOpenCodeProjectPayload,
} from "@/shared/api/opencode";
import SkillsSelector from "./SkillsSelector";
import MCPToolsConfig from "./MCPToolsConfig";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editProject?: OpenCodeProject | null;
  onSuccess: (project: OpenCodeProject) => void;
}

const DEFAULT_FORM: CreateOpenCodeProjectPayload = {
  name: "",
  description: "",
  code_path: "",
  selected_skills: [],
  selected_mcp_tools: [],
  audit_config: {},
};

export default function CreateProjectDialog({
  open,
  onOpenChange,
  editProject,
  onSuccess,
}: CreateProjectDialogProps) {
  const [form, setForm] = useState<CreateOpenCodeProjectPayload>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  useEffect(() => {
    if (open) {
      if (editProject) {
        setForm({
          name: editProject.name,
          description: editProject.description || "",
          code_path: editProject.code_path,
          project_id: editProject.project_id,
          selected_skills: editProject.selected_skills || [],
          selected_mcp_tools: editProject.selected_mcp_tools || [],
          audit_config: editProject.audit_config || {},
        });
      } else {
        setForm(DEFAULT_FORM);
      }
      setActiveTab("basic");
    }
  }, [open, editProject]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("请输入项目名称");
      return;
    }
    if (!form.code_path.trim()) {
      toast.error("请输入代码路径");
      return;
    }

    setSaving(true);
    try {
      let result: OpenCodeProject;
      if (editProject) {
        const res = await updateOpenCodeProject(editProject.id, form);
        result = res.data;
        toast.success("项目配置已更新");
      } else {
        const res = await createOpenCodeProject(form);
        result = res.data;
        toast.success("OpenCode 项目已创建");
      }
      onSuccess(result);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "操作失败";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!editProject;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <FolderCode className="h-4 w-4 text-primary" />
            {isEdit ? "编辑 OpenCode 审计项目" : "新建 OpenCode 审计项目"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            配置 OpenCode 服务的代码路径、Skills 和 MCP 工具
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="basic" className="text-xs">
              <FolderCode className="h-3.5 w-3.5 mr-1.5" />
              基本配置
            </TabsTrigger>
            <TabsTrigger value="skills" className="text-xs">
              <Shield className="h-3.5 w-3.5 mr-1.5" />
              Skills 选择
              {form.selected_skills.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-primary/20 text-primary px-1.5 rounded-full">
                  {form.selected_skills.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="mcp" className="text-xs">
              <Terminal className="h-3.5 w-3.5 mr-1.5" />
              MCP 工具
              {form.selected_mcp_tools.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-primary/20 text-primary px-1.5 rounded-full">
                  {form.selected_mcp_tools.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto pt-4">
            <TabsContent value="basic" className="mt-0 space-y-4 px-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">项目名称 <span className="text-red-400">*</span></Label>
                <Input
                  placeholder="例如: 电商后台安全审计"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">项目描述</Label>
                <Textarea
                  placeholder="简要描述审计目标和范围..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="text-sm resize-none h-16"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  代码路径 <span className="text-red-400">*</span>
                </Label>
                <Input
                  placeholder="/path/to/your/project"
                  value={form.code_path}
                  onChange={(e) => setForm({ ...form, code_path: e.target.value })}
                  className="h-9 text-sm font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  OpenCode 服务将在此目录启动，路径需在服务器上可访问
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">最大迭代次数</Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={form.audit_config?.max_iterations as number || 50}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        audit_config: {
                          ...form.audit_config,
                          max_iterations: parseInt(e.target.value),
                        },
                      })
                    }
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">超时时间（秒）</Label>
                  <Input
                    type="number"
                    min={60}
                    max={7200}
                    value={form.audit_config?.timeout_seconds as number || 1800}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        audit_config: {
                          ...form.audit_config,
                          timeout_seconds: parseInt(e.target.value),
                        },
                      })
                    }
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[11px] text-amber-400 leading-relaxed">
                  <strong>说明：</strong> 每个 OpenCode 项目对应一个独立的 OpenCode 服务进程。
                  服务启动后，将在分配的端口上运行，并使用指定的代码路径作为工作目录。
                  确保 OpenCode 已安装在服务器上（<code>npm install -g @opencode-ai/cli</code>）。
                </p>
              </div>
            </TabsContent>

            <TabsContent value="skills" className="mt-0 px-1">
              <p className="text-xs text-muted-foreground mb-3">
                选择要注入到 OpenCode 的审计技能，多个 Skills 将组合成系统提示词，指导 AI 关注特定安全问题。
              </p>
              <SkillsSelector
                selected={form.selected_skills}
                onChange={(ids) => setForm({ ...form, selected_skills: ids })}
              />
            </TabsContent>

            <TabsContent value="mcp" className="mt-0 px-1">
              <p className="text-xs text-muted-foreground mb-3">
                选择要注入到 OpenCode 的 MCP 工具，扩展 AI 的工具调用能力（代码分析、搜索、CVE 查询等）。
              </p>
              <MCPToolsConfig
                selected={form.selected_mcp_tools}
                onChange={(ids) => setForm({ ...form, selected_mcp_tools: ids })}
              />
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="pt-4 border-t">
          <div className="flex items-center gap-2 flex-1 text-xs text-muted-foreground">
            {form.selected_skills.length > 0 && (
              <span>{form.selected_skills.length} Skills</span>
            )}
            {form.selected_skills.length > 0 && form.selected_mcp_tools.length > 0 && (
              <span className="text-border">|</span>
            )}
            {form.selected_mcp_tools.length > 0 && (
              <span>{form.selected_mcp_tools.length} MCP 工具</span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {isEdit ? "保存更改" : "创建项目"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
