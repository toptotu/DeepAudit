/**
 * 问题管理面板
 *
 * 功能:
 * - 问题列表展示（含状态、严重程度过滤）
 * - 问题确认/拒绝/分配操作
 * - 批量操作
 * - 评论和审核历史
 * - 问题统计
 */

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2, XCircle, AlertTriangle, Clock,
  MessageSquare, UserCheck, ChevronDown, ChevronRight,
  Filter, MoreVertical, RefreshCw, Send, Loader2,
  ShieldOff, Wrench, RotateCcw, ArrowRight, BarChart2,
  User, Calendar, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  listFindingComments,
  addFindingComment,
  reviewFinding,
  batchUpdateFindings,
  getFindingsStatistics,
} from "@/shared/api/opencode";
import type {
  IssueComment,
  IssueCommentType,
  FindingStatistics,
} from "@/shared/api/opencode";
import { getAgentFindings } from "@/shared/api/agentTasks";
import type { AgentFinding } from "@/shared/api/agentTasks";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IssueManagementPanelProps {
  taskId: string;
  initialFindings?: AgentFinding[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: {
    label: "严重",
    color: "border-red-500/50 text-red-400 bg-red-500/10",
    dot: "bg-red-500",
  },
  high: {
    label: "高危",
    color: "border-orange-500/50 text-orange-400 bg-orange-500/10",
    dot: "bg-orange-500",
  },
  medium: {
    label: "中危",
    color: "border-yellow-500/50 text-yellow-400 bg-yellow-500/10",
    dot: "bg-yellow-500",
  },
  low: {
    label: "低危",
    color: "border-blue-500/50 text-blue-400 bg-blue-500/10",
    dot: "bg-blue-500",
  },
  info: {
    label: "信息",
    color: "border-muted text-muted-foreground bg-muted/30",
    dot: "bg-muted-foreground",
  },
};

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  new: { label: "待确认", icon: Clock, color: "text-muted-foreground" },
  analyzing: { label: "分析中", icon: Loader2, color: "text-yellow-400" },
  verified: { label: "已确认", icon: CheckCircle2, color: "text-emerald-400" },
  false_positive: { label: "误报", icon: ShieldOff, color: "text-muted-foreground" },
  needs_review: { label: "待审查", icon: AlertTriangle, color: "text-yellow-400" },
  fixed: { label: "已修复", icon: Wrench, color: "text-blue-400" },
  wont_fix: { label: "接受风险", icon: XCircle, color: "text-muted-foreground" },
  duplicate: { label: "重复", icon: RotateCcw, color: "text-muted-foreground" },
};

const COMMENT_TYPE_CONFIG: Record<
  IssueCommentType,
  { label: string; color: string }
> = {
  note: { label: "备注", color: "text-muted-foreground" },
  confirm: { label: "确认漏洞", color: "text-emerald-400" },
  reject: { label: "标记误报", color: "text-muted-foreground" },
  assign: { label: "分配责任人", color: "text-blue-400" },
  fix: { label: "标记修复", color: "text-purple-400" },
  verify: { label: "验证修复", color: "text-emerald-400" },
  reopen: { label: "重新打开", color: "text-orange-400" },
  accept_risk: { label: "接受风险", color: "text-yellow-400" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
      {total > 0 && (
        <div className="text-[10px] text-muted-foreground/60 mt-0.5">{pct}%</div>
      )}
    </div>
  );
}

function CommentItem({ comment }: { comment: IssueComment }) {
  const typeConfig = COMMENT_TYPE_CONFIG[comment.comment_type];
  return (
    <div className="flex gap-2.5 py-2">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
        <User className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-medium text-foreground">
            {comment.author_name || comment.author_id.slice(0, 8)}
          </span>
          <span className={`text-[10px] font-medium ${typeConfig.color}`}>
            {typeConfig.label}
          </span>
          {comment.from_status && comment.to_status && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              {comment.from_status}
              <ArrowRight className="h-2.5 w-2.5" />
              {comment.to_status}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {new Date(comment.created_at).toLocaleString("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <p className="text-xs text-foreground/90 whitespace-pre-wrap">{comment.content}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IssueManagementPanel({
  taskId,
  initialFindings,
}: IssueManagementPanelProps) {
  const [findings, setFindings] = useState<AgentFinding[]>(initialFindings || []);
  const [loading, setLoading] = useState(!initialFindings);
  const [stats, setStats] = useState<FindingStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // 过滤
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 详情/评论
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentType, setCommentType] = useState<IssueCommentType>("note");
  const [submitting, setSubmitting] = useState(false);

  // 审核对话框
  const [reviewTarget, setReviewTarget] = useState<AgentFinding | null>(null);
  const [reviewAction, setReviewAction] = useState<"confirm" | "reject" | "accept_risk" | "close" | "reopen">("confirm");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);

  // 批量操作
  const [batchStatus, setBatchStatus] = useState("");
  const [batchOperating, setBatchOperating] = useState(false);

  const fetchFindings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAgentFindings(taskId);
      setFindings(Array.isArray(data) ? data : []);
    } catch {
      toast.error("加载问题列表失败");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await getFindingsStatistics(taskId);
      setStats(res.data);
    } catch {
      // 统计加载失败不影响主流程
    } finally {
      setStatsLoading(false);
    }
  }, [taskId]);

  const loadComments = useCallback(async (findingId: string) => {
    try {
      setCommentsLoading(true);
      const res = await listFindingComments(findingId);
      setComments(res.data.items || []);
    } catch {
      toast.error("加载评论失败");
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialFindings) fetchFindings();
    fetchStats();
  }, [taskId]);

  useEffect(() => {
    if (expandedId) {
      loadComments(expandedId);
    }
  }, [expandedId]);

  const handleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleSubmitComment = async () => {
    if (!expandedId || !newComment.trim()) return;
    setSubmitting(true);
    try {
      await addFindingComment(expandedId, {
        comment_type: commentType,
        content: newComment.trim(),
      });
      toast.success("评论已添加");
      setNewComment("");
      setCommentType("note");
      await loadComments(expandedId);
      // 刷新该 finding 的状态
      if (commentType !== "note") {
        await fetchFindings();
        fetchStats();
      }
    } catch {
      toast.error("添加评论失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await reviewFinding(reviewTarget.id, {
        action: reviewAction,
        notes: reviewNotes || undefined,
      });
      const labels = {
        confirm: "问题已确认",
        reject: "已标记为误报",
        accept_risk: "已接受风险",
        close: "问题已关闭",
        reopen: "问题已重新打开",
      };
      toast.success(labels[reviewAction]);
      setReviewTarget(null);
      setReviewNotes("");
      await fetchFindings();
      fetchStats();
    } catch {
      toast.error("操作失败");
    } finally {
      setReviewing(false);
    }
  };

  const handleBatchUpdate = async () => {
    if (!batchStatus || selectedIds.size === 0) return;
    setBatchOperating(true);
    try {
      const res = await batchUpdateFindings({
        finding_ids: Array.from(selectedIds),
        status: batchStatus,
      });
      toast.success(`已更新 ${res.data.updated} 个问题`);
      setSelectedIds(new Set());
      setBatchStatus("");
      await fetchFindings();
      fetchStats();
    } catch {
      toast.error("批量更新失败");
    } finally {
      setBatchOperating(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map((f) => f.id)));
  const clearSelect = () => setSelectedIds(new Set());

  const filtered = findings.filter((f) => {
    const matchSearch =
      !search ||
      f.title.toLowerCase().includes(search.toLowerCase()) ||
      f.file_path?.toLowerCase().includes(search.toLowerCase());
    const matchSeverity = severityFilter === "all" || f.severity === severityFilter;
    const matchStatus = statusFilter === "all" || f.status === statusFilter;
    return matchSearch && matchSeverity && matchStatus;
  });

  const sortedFindings = [...filtered].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return (order[a.severity as keyof typeof order] ?? 5) - (order[b.severity as keyof typeof order] ?? 5);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 统计区域 */}
      {stats && (
        <div className="px-4 pt-4 pb-2">
          <div className="grid grid-cols-5 gap-2 mb-3">
            <StatCard label="总计" value={stats.total} total={stats.total} color="text-foreground" />
            <StatCard label="已确认" value={stats.confirmed} total={stats.total} color="text-emerald-400" />
            <StatCard label="误报" value={stats.false_positive} total={stats.total} color="text-muted-foreground" />
            <StatCard label="已修复" value={stats.closed} total={stats.total} color="text-blue-400" />
            <div className="rounded-lg border border-border p-3 text-center">
              <div className="text-2xl font-bold text-primary">{stats.closure_rate}%</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">修复率</div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">已确认中</div>
            </div>
          </div>

          {/* 严重程度分布条 */}
          {stats.total > 0 && (
            <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
              {["critical", "high", "medium", "low"].map((sev) => {
                const count = stats.by_severity[sev] || 0;
                const pct = (count / stats.total) * 100;
                if (pct === 0) return null;
                const colors = {
                  critical: "bg-red-500",
                  high: "bg-orange-500",
                  medium: "bg-yellow-500",
                  low: "bg-blue-500",
                };
                return (
                  <div
                    key={sev}
                    className={`${colors[sev as keyof typeof colors]} rounded-full`}
                    style={{ width: `${pct}%` }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <Separator />

      {/* 过滤和操作栏 */}
      <div className="px-4 py-2 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Filter className="absolute left-2.5 top-2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="搜索问题..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-7 text-xs"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => {
              fetchFindings();
              fetchStats();
            }}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        <div className="flex gap-1 flex-wrap">
          <span className="text-[11px] text-muted-foreground self-center mr-1">严重度:</span>
          {["all", "critical", "high", "medium", "low"].map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-1.5 py-0.5 text-[11px] rounded border transition-colors ${
                severityFilter === sev
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {sev === "all" ? "全部" : SEVERITY_CONFIG[sev as keyof typeof SEVERITY_CONFIG]?.label || sev}
            </button>
          ))}
        </div>

        <div className="flex gap-1 flex-wrap">
          <span className="text-[11px] text-muted-foreground self-center mr-1">状态:</span>
          {["all", "new", "verified", "false_positive", "fixed", "wont_fix"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-1.5 py-0.5 text-[11px] rounded border transition-colors ${
                statusFilter === st
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {st === "all" ? "全部" : STATUS_CONFIG[st]?.label || st}
            </button>
          ))}
        </div>
      </div>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 flex items-center gap-3">
          <span className="text-xs text-primary font-medium">已选 {selectedIds.size} 项</span>
          <div className="flex gap-1.5 flex-wrap flex-1">
            {["false_positive", "verified", "wont_fix"].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setBatchStatus(st);
                }}
                className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                  batchStatus === st
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                → {STATUS_CONFIG[st]?.label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            className="h-6 text-xs px-2"
            onClick={handleBatchUpdate}
            disabled={!batchStatus || batchOperating}
          >
            {batchOperating && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            应用
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={clearSelect}
          >
            取消
          </Button>
        </div>
      )}

      {/* 全选操作 */}
      <div className="px-4 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
            onCheckedChange={(checked) => (checked ? selectAll() : clearSelect())}
            className="h-3.5 w-3.5"
          />
          <span className="text-xs text-muted-foreground">
            {filtered.length} 个问题
            {findings.length !== filtered.length && ` (共 ${findings.length})`}
          </span>
        </div>
      </div>

      <Separator />

      {/* 问题列表 */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            <Loader2 className="animate-spin h-4 w-4 mr-2" />
            加载中...
          </div>
        ) : sortedFindings.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {findings.length === 0 ? "暂无发现" : "无符合条件的问题"}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {sortedFindings.map((finding) => {
              const severityConfig =
                SEVERITY_CONFIG[finding.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.info;
              const statusConf = STATUS_CONFIG[finding.status] || STATUS_CONFIG.new;
              const StatusIcon = statusConf.icon;
              const isExpanded = expandedId === finding.id;
              const isSelected = selectedIds.has(finding.id);

              return (
                <div
                  key={finding.id}
                  className={`transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-accent/30"}`}
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(finding.id)}
                      className="h-3.5 w-3.5 mt-0.5 flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${severityConfig.color}`}
                          >
                            {severityConfig.label}
                          </Badge>
                          <span className="text-xs font-medium text-foreground line-clamp-1">
                            {finding.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className={`text-[11px] flex items-center gap-1 ${statusConf.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusConf.label}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-5 w-5">
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem
                                className="text-xs"
                                onClick={() => {
                                  setReviewAction("confirm");
                                  setReviewTarget(finding);
                                }}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-400" />
                                确认漏洞
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-xs"
                                onClick={() => {
                                  setReviewAction("reject");
                                  setReviewTarget(finding);
                                }}
                              >
                                <ShieldOff className="h-3.5 w-3.5 mr-2" />
                                标记误报
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-xs"
                                onClick={() => {
                                  setReviewAction("accept_risk");
                                  setReviewTarget(finding);
                                }}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-2 text-yellow-400" />
                                接受风险
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-xs"
                                onClick={() => {
                                  setReviewAction("close");
                                  setReviewTarget(finding);
                                }}
                              >
                                <Wrench className="h-3.5 w-3.5 mr-2 text-blue-400" />
                                标记已修复
                              </DropdownMenuItem>
                              {finding.status !== "new" && (
                                <DropdownMenuItem
                                  className="text-xs"
                                  onClick={() => {
                                    setReviewAction("reopen");
                                    setReviewTarget(finding);
                                  }}
                                >
                                  <RotateCcw className="h-3.5 w-3.5 mr-2" />
                                  重新打开
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {finding.file_path && (
                        <div className="text-[11px] text-muted-foreground font-mono mb-1">
                          {finding.file_path}
                          {finding.line_start && `:${finding.line_start}`}
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        {finding.ai_confidence != null && (
                          <span>置信度 {Math.round(finding.ai_confidence * 100)}%</span>
                        )}
                        {(finding as unknown as Record<string, unknown>).comments_count != null && (
                          <span
                            className="flex items-center gap-1 cursor-pointer hover:text-foreground"
                            onClick={() => handleExpand(finding.id)}
                          >
                            <MessageSquare className="h-3 w-3" />
                            {(finding as unknown as Record<string, unknown>).comments_count as number} 评论
                          </span>
                        )}
                        {(finding as unknown as Record<string, unknown>).assignee_id && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            已分配
                          </span>
                        )}
                        {(finding as unknown as Record<string, unknown>).due_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {String((finding as unknown as Record<string, unknown>).due_date)}
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 flex-shrink-0"
                      onClick={() => handleExpand(finding.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </Button>
                  </div>

                  {/* 展开详情：代码片段 + 评论 */}
                  {isExpanded && (
                    <div className="px-4 pb-3 ml-6">
                      {finding.code_snippet && (
                        <pre className="text-[11px] font-mono bg-muted/50 rounded p-2.5 overflow-x-auto mb-3 max-h-32">
                          {finding.code_snippet}
                        </pre>
                      )}

                      {finding.suggestion && (
                        <div className="text-xs text-muted-foreground mb-3 p-2.5 bg-emerald-500/5 rounded border border-emerald-500/20">
                          <span className="font-medium text-emerald-400">修复建议: </span>
                          {finding.suggestion}
                        </div>
                      )}

                      {/* 评论区 */}
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium text-muted-foreground">评论与记录</div>

                        {commentsLoading ? (
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            加载中...
                          </div>
                        ) : comments.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground py-1">暂无评论</div>
                        ) : (
                          <div className="divide-y divide-border/30">
                            {comments.map((c) => (
                              <CommentItem key={c.id} comment={c} />
                            ))}
                          </div>
                        )}

                        {/* 添加评论 */}
                        <div className="mt-2 space-y-2">
                          <div className="flex gap-1 flex-wrap">
                            {(
                              ["note", "confirm", "reject", "fix", "accept_risk"] as IssueCommentType[]
                            ).map((type) => (
                              <button
                                key={type}
                                onClick={() => setCommentType(type)}
                                className={`px-1.5 py-0.5 text-[11px] rounded border transition-colors ${
                                  commentType === type
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground"
                                }`}
                              >
                                {COMMENT_TYPE_CONFIG[type].label}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Textarea
                              placeholder="添加评论..."
                              value={newComment}
                              onChange={(e) => setNewComment(e.target.value)}
                              className="flex-1 text-xs resize-none h-16"
                            />
                            <Button
                              size="icon"
                              className="h-16 w-9"
                              disabled={!newComment.trim() || submitting}
                              onClick={handleSubmitComment}
                            >
                              {submitting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* 审核操作对话框 */}
      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {{
                confirm: "确认漏洞",
                reject: "标记为误报",
                accept_risk: "接受风险",
                close: "标记已修复",
                reopen: "重新打开问题",
              }[reviewAction]}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {reviewTarget && (
              <div className="p-3 rounded-lg bg-muted/50 text-xs">
                <div className="font-medium mb-1">{reviewTarget.title}</div>
                <div className="text-muted-foreground">{reviewTarget.file_path}</div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">备注说明（可选）</Label>
              <Textarea
                placeholder="添加说明..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="text-xs resize-none h-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReviewTarget(null)}>
              取消
            </Button>
            <Button size="sm" onClick={handleReview} disabled={reviewing}>
              {reviewing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              确认操作
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
