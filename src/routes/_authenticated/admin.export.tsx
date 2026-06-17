import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { STATUS_LABEL, isOverdueLike, dayDiff, fmtDate } from "@/lib/task-utils";

export const Route = createFileRoute("/_authenticated/admin/export")({
  head: () => ({ meta: [{ title: "导出统计" }] }),
  component: ExportPage,
});

type Row = {
  id: string; title: string; status: string;
  assigned_to: string | null; due_date: string | null;
  created_at: string; completed_at: string | null;
  assignee_name: string | null; creator_name: string | null;
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待处理" },
  { value: "in_progress", label: "进行中" },
  { value: "completed", label: "已完成" },
  { value: "overdue", label: "已超期" },
];

function buildWorkbook(rows: Row[]) {
  const wb = XLSX.utils.book_new();

  const detail = rows.map((t) => {
    const overdue = isOverdueLike(t);
    let overdueDays = 0;
    if (t.due_date) {
      if (t.status === "completed" && t.completed_at) {
        const d = dayDiff(t.completed_at, t.due_date + "T23:59:59");
        overdueDays = d > 0 ? d : 0;
      } else if (t.status !== "completed") {
        const d = dayDiff(new Date(), t.due_date + "T23:59:59");
        overdueDays = d > 0 ? d : 0;
      }
    }
    return {
      任务标题: t.title,
      创建人: t.creator_name ?? "",
      负责人: t.assignee_name ?? "",
      创建时间: fmtDate(t.created_at),
      截止时间: t.due_date ?? "",
      完成时间: t.completed_at ? fmtDate(t.completed_at) : "",
      状态: STATUS_LABEL[t.status] ?? t.status,
      是否超期: overdue ? "是" : "否",
      超期天数: overdueDays,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "任务明细");

  const total = rows.length;
  const completed = rows.filter((r) => r.status === "completed");
  const onTime = completed.filter((r) => !isOverdueLike(r)).length;
  const overdueDone = completed.length - onTime;
  const notDone = total - completed.length;
  const completionRate = total ? ((completed.length / total) * 100).toFixed(1) + "%" : "0%";
  const overdueRate = completed.length ? ((overdueDone / completed.length) * 100).toFixed(1) + "%" : "0%";
  const summary = [
    { 指标: "总任务数", 数值: total },
    { 指标: "按时完成数量", 数值: onTime },
    { 指标: "超时完成数量", 数值: overdueDone },
    { 指标: "未完成数量", 数值: notDone },
    { 指标: "完成率", 数值: completionRate },
    { 指标: "超时率", 数值: overdueRate },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "汇总统计");

  const byEmployee = new Map<string, { name: string; total: number; onTime: number; overdue: number; notDone: number }>();
  for (const r of rows) {
    const key = r.assigned_to ?? "_unassigned";
    const name = r.assignee_name ?? "未分配";
    const e = byEmployee.get(key) ?? { name, total: 0, onTime: 0, overdue: 0, notDone: 0 };
    e.total++;
    if (r.status === "completed") {
      if (isOverdueLike(r)) e.overdue++; else e.onTime++;
    } else e.notDone++;
    byEmployee.set(key, e);
  }
  const employeeRows = Array.from(byEmployee.values()).map((e) => ({
    员工: e.name, 总任务: e.total, 按时完成: e.onTime, 超时完成: e.overdue, 未完成: e.notDone,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeeRows), "员工统计");

  return wb;
}

function ExportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    supabase.from("task_overview").select("id,title,status,assigned_to,due_date,created_at,completed_at,assignee_name,creator_name")
      .order("created_at", { ascending: false })
      .then(({ data }) => { setRows((data as Row[]) ?? []); setLoading(false); });
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "overdue") { if (!isOverdueLike(r) || r.status === "completed") return false; }
      else if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.assignee_name ?? "").toLowerCase().includes(q) ||
        (r.creator_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((r) => next.delete(r.id));
      else visible.forEach((r) => next.add(r.id));
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); }

  function doExport(target: Row[], label: string) {
    if (target.length === 0) { toast.error("暂无任务可导出"); return; }
    const wb = buildWorkbook(target);
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `任务统计_${label}_${stamp}.xlsx`);
    toast.success(`已导出 ${target.length} 条任务`);
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">导出统计</h1>

      <Card className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">
          导出 Excel(.xlsx)文件，包含三个工作表：任务明细、汇总统计、员工统计。可导出全部任务，或在下方勾选指定任务后仅导出所选内容。
        </p>
        <div className="text-xs text-muted-foreground">
          总任务数：{loading ? "加载中…" : rows.length}　已选中：{selected.size}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => doExport(rows, "全部")} disabled={loading || rows.length === 0}>
            <Download className="mr-1 h-4 w-4" /> 导出全部
          </Button>
          <Button onClick={() => doExport(selectedRows, "所选")} disabled={selected.size === 0} variant="secondary">
            <Download className="mr-1 h-4 w-4" /> 导出所选（{selected.size}）
          </Button>
          {selected.size > 0 && (
            <Button onClick={clearSelection} variant="ghost">清空选择</Button>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="搜索任务标题 / 负责人 / 创建人"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={statusFilter === f.value ? "default" : "outline"}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="border rounded-md divide-y">
          <div className="flex items-center gap-3 px-3 py-2 bg-muted/40 text-xs font-medium">
            <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} aria-label="全选当前列表" />
            <span className="flex-1">任务（当前显示 {visible.length} / 总 {rows.length}）</span>
          </div>
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">加载中…</div>
          ) : visible.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">无匹配任务</div>
          ) : (
            visible.map((r) => {
              const overdue = isOverdueLike(r) && r.status !== "completed";
              return (
                <label key={r.id} className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30">
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={() => toggle(r.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{r.title}</span>
                      <Badge variant="outline">{STATUS_LABEL[r.status] ?? r.status}</Badge>
                      {overdue && <Badge variant="destructive">超期</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      创建人：{r.creator_name ?? "—"}　负责人：{r.assignee_name ?? "未分配"}
                      {r.due_date && <>　截止：{r.due_date}</>}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
