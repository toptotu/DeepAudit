/**
 * OpenCode 审计项目卡片
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Play, Square, MoreVertical, Pencil, Trash2,
  FolderCode, Radio, Loader2, AlertCircle, CheckCircle2,
  Clock, ChartBar, RefreshCw,
} from "lucide-react";
import type { OpenCodeProject, OpenCodeServerStatus } from "@/shared/api/opencode";

interface ProjectCardProps {
  project: OpenCodeProject;
  onStart: (project: OpenCodeProject) => void;
  onStop: (project: OpenCodeProject) => void;
  onAudit: (project: OpenCodeProject) => void;
  onEdit: (project: OpenCodeProject) => void;
  onDelete: (project: OpenCodeProject) => void;
  onViewResults: (project: OpenCodeProject) => void;
  isOperating?: boolean;
}

const STATUS_CONFIG: Record<
  OpenCodeServerStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  stopped: {
    label: "已停止",
    color: "border-border text-muted-foreground bg-muted/30",
    icon: Square,
  },
  starting: {
    label: "启动中...",
    color: "border-yellow-500/50 text-yellow-400 bg-yellow-500/10",
    icon: Loader2,
  },
  running: {
    label: "运行中",
    color: "border-emerald-500/50 text-emerald-400 bg-emerald-500/10",
    icon: CheckCircle2,
  },
  auditing: {
    label: "审计中",
    color: "border-blue-500/50 text-blue-400 bg-blue-500/10",
    icon: Radio,
  },
  stopping: {
    label: "停止中...",
    color: "border-orange-500/50 text-orange-400 bg-orange-500/10",
    icon: Loader2,
  },
  error: {
    label: "异常",
    color: "border-red-500/50 text-red-400 bg-red-500/10",
    icon: AlertCircle,
  },
};

export default function ProjectCard({
  project,
  onStart,
  onStop,
  onAudit,
  onEdit,
  onDelete,
  onViewResults,
  isOperating = false,
}: ProjectCardProps) {
  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.stopped;
  const StatusIcon = statusConfig.icon;

  const isRunning = project.status === "running";
  const isBusy = ["starting", "stopping", "auditing"].includes(project.status);

  const shortPath = project.code_path.length > 40
    ? "..." + project.code_path.slice(-38)
    : project.code_path;

  return (
    <div className={`
      relative rounded-xl border bg-card transition-all hover:shadow-md
      ${project.status === "running" ? "border-emerald-500/30" : "border-border"}
      ${project.status === "error" ? "border-red-500/30" : ""}
    `}>
      {/* 状态指示线 */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 rounded-t-xl transition-colors ${
        project.status === "running" ? "bg-emerald-500/50" :
        project.status === "auditing" ? "bg-blue-500/50 animate-pulse" :
        project.status === "error" ? "bg-red-500/50" :
        "bg-border"
      }`} />

      <div className="p-4 pt-5">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`
              flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center
              ${project.status === "running" || project.status === "auditing"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
              }
            `}>
              <FolderCode className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground truncate">
                {project.name}
              </h3>
              {project.description && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Badge
              variant="outline"
              className={`text-[11px] px-2 py-0.5 ${statusConfig.color} flex items-center gap-1`}
            >
              <StatusIcon className={`h-2.5 w-2.5 ${isBusy ? "animate-spin" : ""}`} />
              {statusConfig.label}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onEdit(project)} className="text-xs">
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  编辑配置
                </DropdownMenuItem>
                {project.current_agent_task_id && (
                  <DropdownMenuItem onClick={() => onViewResults(project)} className="text-xs">
                    <ChartBar className="h-3.5 w-3.5 mr-2" />
                    查看审计结果
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(project)}
                  className="text-xs text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  删除项目
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 代码路径 */}
        <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-md bg-muted/50">
          <FolderCode className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="text-[11px] font-mono text-muted-foreground truncate" title={project.code_path}>
            {shortPath}
          </span>
          {project.port && (
            <span className="ml-auto text-[11px] text-emerald-400 font-mono flex-shrink-0">
              :{project.port}
            </span>
          )}
        </div>

        {/* Skills 和 MCP 统计 */}
        <div className="flex gap-3 mb-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="text-primary font-medium">{project.selected_skills.length}</span>
            Skills
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1">
            <span className="text-primary font-medium">{project.selected_mcp_tools.length}</span>
            MCP 工具
          </span>
          {project.current_agent_task_id && (
            <>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1 text-blue-400">
                <Clock className="h-3 w-3" />
                有审计记录
              </span>
            </>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          {project.status === "stopped" || project.status === "error" ? (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs"
              onClick={() => onStart(project)}
              disabled={isOperating}
            >
              {isOperating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Play className="h-3 w-3 mr-1" />
              )}
              启动服务器
            </Button>
          ) : isRunning ? (
            <>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs bg-primary hover:bg-primary/90"
                onClick={() => onAudit(project)}
                disabled={isOperating}
              >
                <Radio className="h-3 w-3 mr-1" />
                开始审计
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2"
                onClick={() => onStop(project)}
                disabled={isOperating}
              >
                <Square className="h-3 w-3" />
              </Button>
            </>
          ) : project.status === "auditing" ? (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs"
              disabled
            >
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              审计进行中...
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs"
              disabled
            >
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              {statusConfig.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
