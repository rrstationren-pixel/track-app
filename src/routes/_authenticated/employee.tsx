import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/employee")({
  head: () => ({ meta: [{ title: "我的任务" }] }),
  component: EmployeePage,
});

type Task = {
  id: string; title: string; description: string | null;
  status: string; due_date: string | null; created_at: string;
  assigned_to: string | null; created_by: string;
};
type Coworker = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = { pending: "待处理", in_progress: "进行中", completed: "已完成" };
const STATUS_VARIANT: Record<string, "secondary" | "default" | "outline"> = { pending: "secondary", in_progress: "default", completed: "outline" };

function EmployeePage() {
  const { user, role, loading } = useAuth();
  const nav = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [coworkers, setCoworkers] = useState<Coworker[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [view, setView] = useState<"assigned" | "created">("assigned");
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "completed">("all");
  const [openCreate, setOpenCreate] = useState(false);

  useEffect(() => {
    if (!loading && role === "admin") nav({ to: "/admin" });
  }, [role, loading, nav]);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("tasks").select("*")
      .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    const list = (data as Task[]) ?? [];
    setTasks(list);
    // Load names for assignees/creators
    const ids = new Set<string>();
    for (const t of list) { if (t.assigned_to) ids.add(t.assigned_to); ids.add(t.created_by); }
    if (ids.size > 0) {
      const { data: profs } = await supabase.rpc("list_colleagues");
      const idSet = ids;
      const m: Record<string, string> = {};
      for (const p of (profs as { id: string; name: string }[] | null) ?? []) {
        if (idSet.has(p.id)) m[p.id] = p.name;
      }
      setNameMap(m);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  // Coworkers list for assigning new tasks (excludes self; admins filtered out by RLS)
  useEffect(() => {
    if (!user) return;
    supabase.rpc("list_colleagues")
      .then(async ({ data }) => {
        const all = ((data as Coworker[] | null) ?? []).filter((c) => c.id !== user.id);
        // list_colleagues already excludes admins; filter inactive client-side
        const candidates = all.filter((c: any) => c.active !== false);
        if (candidates.length === 0) { setCoworkers([]); return; }
        setCoworkers(candidates.map((c) => ({ id: c.id, name: c.name })));
      });
  }, [user]);

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return tasks.filter((t) => {
      if (view === "assigned" && t.assigned_to !== user?.id) return false;
      if (view === "created" && t.created_by !== user?.id) return false;
      if (filter !== "all" && t.status !== filter) return false;
      if (qq && !t.title.toLowerCase().includes(qq) && !(t.description ?? "").toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [tasks, q, filter, view, user]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">我的任务</h1>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> 新建任务</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>新建任务（分配给同事）</DialogTitle></DialogHeader>
            <NewTaskForm coworkers={coworkers} onDone={() => { setOpenCreate(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-1">
        {([["assigned", "我负责的"], ["created", "我创建的"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              view === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >{l}</button>
        ))}
      </div>

      <Input placeholder="搜索任务…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />

      <div className="flex gap-1 overflow-x-auto">
        {([["all", "全部"], ["pending", "待处理"], ["in_progress", "进行中"], ["completed", "已完成"]] as const).map(([k, l]) => (
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
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>创建人: {nameMap[t.created_by] ?? "—"}</span>
                    <span>负责人: {t.assigned_to ? (nameMap[t.assigned_to] ?? "—") : "未分配"}</span>
                    {t.due_date && <span>截止: {t.due_date}</span>}
                  </div>
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

function NewTaskForm({ coworkers, onDone }: { coworkers: Coworker[]; onDone: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!assignedTo) { toast.error("请选择一名同事"); return; }
    setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      title, description, assigned_to: assignedTo,
      due_date: dueDate || null, created_by: user.id, status: "pending",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("已创建"); onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>标题</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>描述</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>分配给（同事）</Label>
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger><SelectValue placeholder="选择同事" /></SelectTrigger>
            <SelectContent>
              {coworkers.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无可选同事</div>}
              {coworkers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>截止日期</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">注：不能将任务分配给管理员。</p>
      <Button type="submit" className="w-full" disabled={saving}>{saving ? "保存中..." : "创建"}</Button>
    </form>
  );
}
