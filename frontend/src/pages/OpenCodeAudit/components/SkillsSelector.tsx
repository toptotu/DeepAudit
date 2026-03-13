/**
 * Skills 多选组件
 * 用于选择注入到 OpenCode 的审计技能
 */

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search, Check, Shield, Database, Lock, Key,
  Globe, Code2, Zap, KeyRound, Filter, X,
} from "lucide-react";
import { listSkills } from "@/shared/api/opencode";
import type { OpenCodeSkill, SkillCategory } from "@/shared/api/opencode";

interface SkillsSelectorProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  owasp: "OWASP Top 10",
  framework: "框架专项",
  business: "业务逻辑",
  compliance: "合规检测",
  custom: "自定义",
};

const CATEGORY_COLORS: Record<SkillCategory, string> = {
  owasp: "bg-red-500/10 text-red-400 border-red-500/30",
  framework: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  business: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  compliance: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  custom: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield, Database, Lock, Key, Globe, Code2, Zap, KeyRound,
};

function SkillIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = name ? ICON_MAP[name] : null;
  if (!Icon) return <Shield className={className} />;
  return <Icon className={className} />;
}

export default function SkillsSelector({ selected, onChange }: SkillsSelectorProps) {
  const [skills, setSkills] = useState<OpenCodeSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<SkillCategory | "all">("all");

  useEffect(() => {
    listSkills({ is_active: true, include_system: true })
      .then((res) => setSkills(res.data.items || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = skills.filter((s) => {
    const matchSearch =
      !search ||
      s.display_name.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === "all" || s.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const grouped = filtered.reduce<Record<string, OpenCodeSkill[]>>((acc, skill) => {
    const cat = skill.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

  const toggleSkill = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const clearAll = () => onChange([]);
  const selectAll = () => onChange(filtered.map((s) => s.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
        加载 Skills...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 搜索和过滤栏 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索 Skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "owasp", "framework", "business", "custom"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                categoryFilter === cat
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {cat === "all" ? "全部" : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* 已选统计 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          已选 <span className="text-primary font-medium">{selected.length}</span> / {skills.length} 个 Skills
        </span>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={clearAll}>
              <X className="h-3 w-3 mr-1" />
              清空
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={selectAll}>
            <Check className="h-3 w-3 mr-1" />
            全选
          </Button>
        </div>
      </div>

      <Separator />

      {/* Skills 列表 */}
      <ScrollArea className="h-[320px]">
        {Object.entries(grouped).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            未找到匹配的 Skills
          </div>
        ) : (
          <div className="space-y-4 pr-3">
            {Object.entries(grouped).map(([category, categorySkills]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {CATEGORY_LABELS[category as SkillCategory] || category}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">{categorySkills.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {categorySkills.map((skill) => {
                    const isSelected = selected.includes(skill.id);
                    return (
                      <TooltipProvider key={skill.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => toggleSkill(skill.id)}
                              className={`
                                w-full text-left px-3 py-2.5 rounded-lg border transition-all
                                flex items-start gap-3 group
                                ${isSelected
                                  ? "border-primary bg-primary/10 shadow-[0_0_0_1px] shadow-primary/20"
                                  : "border-border hover:border-primary/40 hover:bg-accent/50"
                                }
                              `}
                            >
                              <div className={`
                                mt-0.5 flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center
                                ${isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}
                              `}>
                                <SkillIcon name={skill.icon} className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                                    {skill.display_name}
                                  </span>
                                  {skill.is_system && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-muted">
                                      内置
                                    </Badge>
                                  )}
                                </div>
                                {skill.description && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                                    {skill.description}
                                  </p>
                                )}
                                {skill.vulnerability_types && skill.vulnerability_types.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {skill.vulnerability_types.slice(0, 3).map((vt) => (
                                      <span
                                        key={vt}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                                      >
                                        {vt}
                                      </span>
                                    ))}
                                    {skill.vulnerability_types.length > 3 && (
                                      <span className="text-[10px] text-muted-foreground">
                                        +{skill.vulnerability_types.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className={`
                                flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center
                                ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"}
                              `}>
                                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="text-xs font-medium mb-1">{skill.display_name}</p>
                            {skill.description && (
                              <p className="text-xs text-muted-foreground">{skill.description}</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
