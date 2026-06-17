import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABEL, isOverdueLike } from "@/lib/task-utils";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "仪表盘" }] }),
  component: DashboardPage,
});

type Overview = {
  id: string; title: string; status: string;
  assigned_to: string | null; due_date: string | null;
  created_at: string; updated_at: string; archived_at: string | null;
  completed_at: string | null;
  assignee_name: string | null; assignee_email: string | null;
  creator_name: string | null;
  report_count: number; last_report_at: string | null;
};

const STATUS_VARIANT: Record<string, "secondary" | "default" | "outline"> = { pending: "secondary", in_progress: "default", completed: "outline" };

function DashboardPage() {
  const [rows, setRows] = useState<Overview[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "completed" | "overdue">("all");
  const [sort, setSort] = useState<"new" | "old" | "due_asc" | "due_desc">("new");

  useEffect(() => {
    supabase.from("task_overview").select("*").is("archived_at", null).then(({ data }) => {
      setRows((data as Overview[]) ?? []);
    });
    supabase.from("profiles").select("id", { count: "exact", head: true }).then(({ count }) => {
      setEmployeeCount(count ?? 0);
    });
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const inProgress = rows.filter((r) => r.status === "in_progress").length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const overdue = rows.filter((r) => r.status !== "completed" && isOverdueLike(r)).length;
    const onTimeCompleted = rows.filter((r) => r.status === "completed" && !isOverdueLike(r)).length;
    const onTimeRate = completed > 0 ? Math.round((onTimeCompleted / completed) * 100) : 0;
    return { total, inProgress, completed, overdue, onTimeRate };
  }, [rows]);

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (qq) {
        const hay = [r.title, r.assignee_name, r.assignee_email, r.creator_name, STATUS_LABEL[r.status]]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      if (filter === "overdue") return isOverdueLike(r) && r.status !== "completed";
      if (filter !== "all" && r.status !== filter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "new") return b.created_at.localeCompare(a.created_at);
      if (sort === "old") return a.created_at.localeCompare(b.created_at);
      const ad = a.due_date ?? "9999"; const bd = b.due_date ?? "9999";
      return sort === "due_asc" ? ad.localeCompare(bd) : bd.localeCompare(ad);
    });
    return list;
  }, [rows, q, filter, sort]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">仪表盘</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="总任务" value={stats.total} />
        <StatCard label="进行中" value={stats.inProgress} />
        <StatCard label="已完成" value={stats.completed} />
        <StatCard label="已超期" value={stats.overdue} />
        <StatCard label="按时完成率" value={`${stats.onTimeRate}%`} />
        <StatCard label="员工总数" value={employeeCount} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input placeholder="搜索任务标题、员工、创建人、状态…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">最新创建</SelectItem>
            <SelectItem value="old">最早创建</SelectItem>
            <SelectItem value="due_asc">截止日期 升序</SelectItem>
            <SelectItem value="due_desc">截止日期 降序</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {([
          ["all", "全部"], ["pending", "待处理"], ["in_progress", "进行中"],
          ["completed", "已完成"], ["overdue", "已逾期"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
              filter === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >{l}</button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.length === 0 && <p className="text-sm text-muted-foreground">暂无匹配任务</p>}
        {visible.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link to="/task/$taskId" params={{ taskId: t.id }} className="font-medium hover:underline">{t.title}</Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                  {isOverdueLike(t) && t.status !== "completed" && <Badge variant="destructive">已逾期</Badge>}
                  <span>创建人: {t.creator_name ?? "—"}</span>
                  <span>负责人: {t.assignee_name ?? "未分配"}</span>
                  {t.due_date && <span>截止: {t.due_date}</span>}
                  <span>报告: {t.report_count}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}
