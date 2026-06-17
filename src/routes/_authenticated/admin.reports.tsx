import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import { fmtDateTime } from "@/lib/task-utils";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: "报告管理" }] }),
  component: ReportsPage,
});

type Overview = {
  id: string; title: string; status: string;
  assigned_to: string | null;
  assignee_name: string | null; assignee_email: string | null;
  report_count: number; last_report_at: string | null;
  archived_at: string | null;
};
type Report = { id: string; note: string; photo_url: string | null; submitted_at: string; employee_id: string };

const STATUS_LABEL: Record<string, string> = { pending: "待处理", in_progress: "进行中", completed: "已完成" };
const STATUS_VARIANT: Record<string, "secondary" | "default" | "outline"> = { pending: "secondary", in_progress: "default", completed: "outline" };

function ReportsPage() {
  const [rows, setRows] = useState<Overview[]>([]);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, Report[] | "loading">>({});
  const [submitterMap, setSubmitterMap] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("task_overview").select("*").is("archived_at", null)
      .gt("report_count", 0)
      .order("last_report_at", { ascending: false, nullsFirst: false })
      .then(({ data }) => setRows((data as Overview[]) ?? []));
  }, []);

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => [r.title, r.assignee_name, r.assignee_email].filter(Boolean).join(" ").toLowerCase().includes(qq));
  }, [rows, q]);

  async function toggle(id: string) {
    if (expanded[id]) {
      const next = { ...expanded }; delete next[id]; setExpanded(next);
      return;
    }
    setExpanded((p) => ({ ...p, [id]: "loading" }));
    const { data } = await supabase.from("reports").select("id, note, photo_url, submitted_at, employee_id")
      .eq("task_id", id).order("submitted_at", { ascending: false });
    const list = (data as Report[]) ?? [];
    setExpanded((p) => ({ ...p, [id]: list }));
    const missing = list.map((r) => r.employee_id).filter((id) => !submitterMap[id]);
    if (missing.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id,name").in("id", Array.from(new Set(missing)));
      setSubmitterMap((m) => {
        const n = { ...m };
        for (const p of profs ?? []) n[p.id] = p.name;
        return n;
      });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">报告管理</h1>
      <Input placeholder="按任务/员工搜索…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />
      <div className="space-y-2">
        {visible.length === 0 && <p className="text-sm text-muted-foreground">暂无报告</p>}
        {visible.map((t) => {
          const exp = expanded[t.id];
          return (
            <Card key={t.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">📁 {t.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                    <span>员工: {t.assignee_name ?? "未分配"}</span>
                    <span>报告: {t.report_count}</span>
                    {t.last_report_at && <span>最近: {fmtDateTime(t.last_report_at)}</span>}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/task/$taskId" params={{ taskId: t.id }}><Eye className="mr-1 h-3.5 w-3.5" /> 查看详情</Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggle(t.id)}>
                    {exp ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
                    {exp ? "收起" : "展开"}
                  </Button>
                </div>
              </div>
              {exp === "loading" && <p className="mt-3 text-xs text-muted-foreground">加载中…</p>}
              {Array.isArray(exp) && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {exp.length === 0 && <p className="text-xs text-muted-foreground">无报告</p>}
                  {exp.map((r, i) => (
                    <div key={r.id} className="rounded border p-2.5">
                      <div className="text-xs text-muted-foreground">报告 #{exp.length - i}</div>
                      <div className="text-xs text-muted-foreground">
                        提交人: {submitterMap[r.employee_id] ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        提交时间: {fmtDateTime(r.submitted_at)}
                      </div>
                      <p className="mt-1 text-sm whitespace-pre-wrap">{r.note}</p>
                      {r.photo_url && (
                        <div className="mt-1 text-xs text-muted-foreground">附件数量: 1</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
