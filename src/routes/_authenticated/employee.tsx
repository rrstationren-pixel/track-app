import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/employee")({
  head: () => ({ meta: [{ title: "我的任务" }] }),
  component: EmployeePage,
});

type Task = {
  id: string; title: string; description: string | null;
  status: string; due_date: string | null; created_at: string;
};

const STATUS_LABEL: Record<string, string> = { pending: "待处理", in_progress: "进行中", completed: "已完成" };
const STATUS_VARIANT: Record<string, "secondary" | "default" | "outline"> = { pending: "secondary", in_progress: "default", completed: "outline" };

function EmployeePage() {
  const { user, role, loading } = useAuth();
  const nav = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "completed">("all");

  useEffect(() => {
    if (!loading && role === "admin") nav({ to: "/admin" });
  }, [role, loading, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("tasks").select("*").eq("assigned_to", user.id).is("archived_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => setTasks((data as Task[]) ?? []));
  }, [user]);

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filter !== "all" && t.status !== filter) return false;
      if (qq && !t.title.toLowerCase().includes(qq) && !(t.description ?? "").toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [tasks, q, filter]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">我的任务</h1>

      <Input placeholder="搜索我的任务…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />

      <div className="flex gap-1 overflow-x-auto">
        {([
          ["all", "全部"], ["pending", "待处理"], ["in_progress", "进行中"], ["completed", "已完成"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
              filter === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >{l}</button>
        ))}
      </div>

      {visible.length === 0 && <p className="text-sm text-muted-foreground">暂无任务</p>}
      <div className="space-y-2">
        {visible.map((t) => (
          <Link key={t.id} to="/task/$taskId" params={{ taskId: t.id }}>
            <Card className="p-4 transition-colors hover:bg-accent">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.title}</div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>
                  {t.due_date && <div className="mt-1 text-xs text-muted-foreground">截止: {t.due_date}</div>}
                </div>
                <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
