/**
 * MCP 工具配置组件
 * 选择和管理注入到 OpenCode 的 MCP 工具
 */

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Check, Plus, Trash2, RefreshCw, Wifi, WifiOff,
  Terminal, Globe, ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listMCPTools, createMCPTool, deleteMCPTool, testMCPTool,
} from "@/shared/api/opencode";
import type { MCPToolConfig, MCPTransportType, CreateMCPToolPayload } from "@/shared/api/opencode";

interface MCPToolsConfigProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

const TRANSPORT_ICONS: Record<MCPTransportType, React.ComponentType<{ className?: string }>> = {
  http: Globe,
  stdio: Terminal,
  sse: Wifi,
};

const TRANSPORT_LABELS: Record<MCPTransportType, string> = {
  http: "HTTP",
  stdio: "STDIO",
  sse: "SSE",
};

const DEFAULT_TOOL: CreateMCPToolPayload = {
  name: "",
  display_name: "",
  description: "",
  transport_type: "http",
  server_url: "",
  command: "",
  args: [],
  timeout_seconds: 30,
  capabilities: [],
};

export default function MCPToolsConfig({ selected, onChange }: MCPToolsConfigProps) {
  const [tools, setTools] = useState<MCPToolConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [newTool, setNewTool] = useState<CreateMCPToolPayload>(DEFAULT_TOOL);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTools = async () => {
    try {
      setLoading(true);
      const res = await listMCPTools();
      setTools(res.data.items || []);
    } catch (err) {
      toast.error("加载 MCP 工具失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const toggleTool = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const handleTest = async (tool: MCPToolConfig) => {
    setTestingId(tool.id);
    try {
      const res = await testMCPTool(tool.id);
      if (res.data.success) {
        toast.success(`${tool.display_name} 连接正常`);
      } else {
        toast.error(`连接失败: ${res.data.error || "未知错误"}`);
      }
      await fetchTools();
    } catch {
      toast.error("测试请求失败");
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (tool: MCPToolConfig) => {
    if (tool.is_system) {
      toast.error("系统工具不允许删除");
      return;
    }
    try {
      await deleteMCPTool(tool.id);
      toast.success("已删除");
      onChange(selected.filter((id) => id !== tool.id));
      await fetchTools();
    } catch {
      toast.error("删除失败");
    }
  };

  const handleCreate = async () => {
    if (!newTool.name || !newTool.display_name) {
      toast.error("请填写工具名称和显示名称");
      return;
    }
    if (newTool.transport_type === "http" && !newTool.server_url) {
      toast.error("HTTP 模式需要填写服务器 URL");
      return;
    }
    if (newTool.transport_type === "stdio" && !newTool.command) {
      toast.error("STDIO 模式需要填写命令");
      return;
    }

    setCreating(true);
    try {
      await createMCPTool(newTool);
      toast.success("MCP 工具已添加");
      setShowCreateDialog(false);
      setNewTool(DEFAULT_TOOL);
      await fetchTools();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "创建失败";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <Loader2 className="animate-spin mr-2 h-4 w-4" />
        加载 MCP 工具...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          已选 <span className="text-primary font-medium">{selected.length}</span> / {tools.length} 个工具
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={fetchTools}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            刷新
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            添加工具
          </Button>
        </div>
      </div>

      <Separator />

      <ScrollArea className="h-[280px]">
        {tools.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Terminal className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>暂无 MCP 工具配置</p>
            <p className="text-xs mt-1">点击「添加工具」配置第一个 MCP 工具</p>
          </div>
        ) : (
          <div className="space-y-2 pr-3">
            {tools.map((tool) => {
              const isSelected = selected.includes(tool.id);
              const isExpanded = expandedId === tool.id;
              const TransIcon = TRANSPORT_ICONS[tool.transport_type];
              const isTesting = testingId === tool.id;

              return (
                <div
                  key={tool.id}
                  className={`rounded-lg border transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      onClick={() => toggleTool(tool.id)}
                      className={`flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </button>

                    <div className="flex-shrink-0 w-7 h-7 rounded-md bg-muted flex items-center justify-center">
                      <TransIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {tool.display_name}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0"
                        >
                          {TRANSPORT_LABELS[tool.transport_type]}
                        </Badge>
                        {tool.is_system && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-muted">
                            内置
                          </Badge>
                        )}
                        {tool.last_test_status && (
                          <span className={`text-[10px] flex items-center gap-0.5 ${
                            tool.last_test_status === "ok" ? "text-emerald-400" : "text-red-400"
                          }`}>
                            {tool.last_test_status === "ok" ? (
                              <Wifi className="h-2.5 w-2.5" />
                            ) : (
                              <WifiOff className="h-2.5 w-2.5" />
                            )}
                          </span>
                        )}
                      </div>
                      {tool.description && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {tool.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleTest(tool)}
                        disabled={isTesting}
                      >
                        {isTesting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Wifi className="h-3 w-3" />
                        )}
                      </Button>
                      {!tool.is_system && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(tool)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setExpandedId(isExpanded ? null : tool.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-2.5 pt-0 border-t border-border/50 mt-0">
                      <div className="text-[11px] text-muted-foreground space-y-1 pt-2">
                        {tool.transport_type === "http" && tool.server_url && (
                          <div>URL: <span className="text-foreground font-mono">{tool.server_url}</span></div>
                        )}
                        {tool.transport_type === "stdio" && tool.command && (
                          <div>命令: <span className="text-foreground font-mono">{tool.command}</span></div>
                        )}
                        {tool.capabilities && tool.capabilities.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tool.capabilities.map((cap) => (
                              <span
                                key={cap}
                                className="px-1.5 py-0.5 rounded bg-muted text-[10px]"
                              >
                                {cap}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* 创建工具对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">添加 MCP 工具配置</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">工具标识 *</Label>
                <Input
                  placeholder="my-tool"
                  value={newTool.name}
                  onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                  className="h-8 text-xs"
                />
                <p className="text-[11px] text-muted-foreground">只能包含小写字母、数字、连字符</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">显示名称 *</Label>
                <Input
                  placeholder="我的 MCP 工具"
                  value={newTool.display_name}
                  onChange={(e) => setNewTool({ ...newTool, display_name: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">传输类型</Label>
              <Select
                value={newTool.transport_type}
                onValueChange={(v) => setNewTool({ ...newTool, transport_type: v as MCPTransportType })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP（远程服务）</SelectItem>
                  <SelectItem value="stdio">STDIO（本地命令）</SelectItem>
                  <SelectItem value="sse">SSE（事件流）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(newTool.transport_type === "http" || newTool.transport_type === "sse") && (
              <div className="space-y-1.5">
                <Label className="text-xs">服务器 URL *</Label>
                <Input
                  placeholder="http://localhost:3000/mcp"
                  value={newTool.server_url}
                  onChange={(e) => setNewTool({ ...newTool, server_url: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            )}

            {newTool.transport_type === "stdio" && (
              <div className="space-y-1.5">
                <Label className="text-xs">执行命令 *</Label>
                <Input
                  placeholder="npx mcp-server-git"
                  value={newTool.command}
                  onChange={(e) => setNewTool({ ...newTool, command: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">描述</Label>
              <Textarea
                placeholder="工具功能描述..."
                value={newTool.description}
                onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
                className="text-xs resize-none h-16"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowCreateDialog(false);
                setNewTool(DEFAULT_TOOL);
              }}
            >
              取消
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
