import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, CheckCircle2, Archive, UserCog, Pencil } from "lucide-react";
import { AttachmentList } from "@/components/attachment-list";

export const Route = createFileRoute("/_authenticated/admin/tasks")({
  head: () => ({ meta: [{ title: "任务管理" }] }),
  component: TasksPage,
});

type Overview = {
  id: string; title: string; description?: string | null; status: string;
  assigned_to: string | null; due_date: string | null;
  created_at: string; updated_at: string; archived_at: string | null;
  assignee_name: string | null; assignee_email: string | null;
  report_count: number; last_report_at: string | null;
  attachments?: string[] | null;
};
type Profile = { id: string; name: string; phone: string | null; active: boolean };

const STATUS_LABEL: Record<string, string> = { pending: "待处理", in_progress: "进行中", completed: "已完成" };
const STATUS_VARIANT: Record<string, "secondary" | "default" | "outline"> = { pending: "secondary", in_progress: "default", completed: "outline" };

function isOverdue(t: Overview) {
  return t.status !== "completed" && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
}

function TasksPage() {
  const [rows, setRows] = useState<Overview[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "completed" | "overdue" | "archived">("all");
  const [sort, setSort] = useState<"new" | "old" | "due_asc" | "due_desc">("new");
  const [openCreate, setOpenCreate] = useState(false);
  const [edit, setEdit] = useState<Overview | null>(null);

  async function load() {
    const [r1, r2] = await Promise.all([
      supabase.from("task_overview").select("*"),
      supabase.from("profiles").select("id, name, phone, active").eq("active", true).order("name"),
    ]);
    setRows((r1.data as Overview[]) ?? []);
    setEmployees((r2.data as Profile[]) ?? []);
  }
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (filter === "archived") {
        if (!r.archived_at) return false;
      } else {
        if (r.archived_at) return false;
        if (filter === "overdue") { if (!isOverdue(r)) return false; }
        else if (filter !== "all" && r.status !== filter) return false;
      }
      if (qq) {
        const hay = [r.title, r.assignee_name, r.assignee_email, STATUS_LABEL[r.status]]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(qq)) return false;
      }
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

  async function markCompleted(id: string) {
    const { error } = await supabase.from("tasks").update({ status: "completed" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("已标记完成"); load();
  }
  async function archive(id: string) {
    const { error } = await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("已归档"); load();
  }
  async function reassign(id: string, assigned_to: string) {
    const { error } = await supabase.from("tasks").update({ assigned_to: assigned_to || null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("已转派"); load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">任务管理</h1>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> 新建任务</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>新建任务</DialogTitle></DialogHeader>
            <TaskForm employees={employees} onDone={() => { setOpenCreate(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input placeholder="搜索任务标题 / 员工 / 状态…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">最新创建</SelectItem>
            <SelectItem value="old">最早创建</SelectItem>
            <SelectItem value="due_asc">截止 升序</SelectItem>
            <SelectItem value="due_desc">截止 降序</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {([
          ["all", "全部"], ["pending", "待处理"], ["in_progress", "进行中"],
          ["completed", "已完成"], ["overdue", "已逾期"], ["archived", "已归档"],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
              filter === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >{l}</button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.length === 0 && <p className="text-sm text-muted-foreground">暂无任务</p>}
        {visible.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link to="/task/$taskId" params={{ taskId: t.id }} className="font-medium hover:underline">
                  {t.title}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                  {isOverdue(t) && <Badge variant="destructive">已逾期</Badge>}
                  {t.archived_at && <Badge variant="outline">已归档</Badge>}
                  <span>负责人: {t.assignee_name ?? "未分配"}</span>
                  <span>创建: {new Date(t.created_at).toLocaleDateString("zh-CN")}</span>
                  {t.due_date && <span>截止: {t.due_date}</span>}
                  <span>报告: {t.report_count}</span>
                  <span>更新: {new Date(t.updated_at).toLocaleString("zh-CN")}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button asChild size="sm" variant="outline">
                  <Link to="/task/$taskId" params={{ taskId: t.id }}>查看</Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEdit(t)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> 编辑
                </Button>
                <ReassignButton task={t} employees={employees} onSubmit={reassign} />
                {t.status !== "completed" && !t.archived_at && (
                  <Button size="sm" variant="outline" onClick={() => markCompleted(t.id)}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> 完成
                  </Button>
                )}
                {!t.archived_at && (
                  <Button size="sm" variant="outline" onClick={() => archive(t.id)}>
                    <Archive className="mr-1 h-3.5 w-3.5" /> 归档
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑任务</DialogTitle></DialogHeader>
          {edit && (
            <TaskForm
              employees={employees}
              task={edit}
              onDone={() => { setEdit(null); load(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReassignButton({ task, employees, onSubmit }: {
  task: Overview; employees: Profile[]; onSubmit: (id: string, assigned_to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(task.assigned_to ?? "");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><UserCog className="mr-1 h-3.5 w-3.5" /> 转派</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>转派任务</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={val} onValueChange={setVal}>
            <SelectTrigger><SelectValue placeholder="选择员工" /></SelectTrigger>
            <SelectContent>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => { onSubmit(task.id, val); setOpen(false); }} className="w-full">确认</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function sanitizeFilename(name: string) {
  const dotIdx = name.lastIndexOf(".");
  const rawExt = dotIdx >= 0 ? name.slice(dotIdx + 1) : "";
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 10) || "bin";
  const base = (dotIdx >= 0 ? name.slice(0, dotIdx) : name)
    .replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "")
    .slice(0, 40) || "file";
  return `${base}.${ext}`;
}

function TaskForm({ employees, task, onDone }: { employees: Profile[]; task?: Overview; onDone: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [status, setStatus] = useState(task?.status ?? "pending");
  const [existing, setExisting] = useState<string[]>(task?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        title, description, assigned_to: assignedTo || null,
        due_date: dueDate || null, status,
      };
      let taskId = task?.id;
      if (task) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("tasks").insert({ ...payload, created_by: user.id })
          .select("id").single();
        if (error) throw error;
        taskId = data.id;
      }
      const uploaded: string[] = [];
      for (const f of files) {
        const path = `tasks/${taskId}/${Date.now()}-${sanitizeFilename(f.name)}`;
        const { error: upErr } = await supabase.storage.from("task-photos")
          .upload(path, f, { contentType: f.type || undefined });
        if (upErr) throw upErr;
        uploaded.push(path);
      }
      const finalAttachments = [...existing, ...uploaded];
      const originalAttachments = task?.attachments ?? [];
      if (uploaded.length > 0 || finalAttachments.length !== originalAttachments.length) {
        const { error } = await supabase.from("tasks")
          .update({ attachments: finalAttachments }).eq("id", taskId!);
        if (error) throw error;
        // Delete removed files
        const removed = originalAttachments.filter((p) => !existing.includes(p));
        if (removed.length > 0) await supabase.storage.from("task-photos").remove(removed);
      }
      toast.success(task ? "已保存" : "已创建"); onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>标题</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>描述</Label>
        <Textarea value={description ?? ""} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>分配给</Label>
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger><SelectValue placeholder="选择员工" /></SelectTrigger>
            <SelectContent>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>截止日期</Label>
          <Input type="date" value={dueDate ?? ""} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      {task && (
        <div className="space-y-1.5">
          <Label>状态</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">待处理</SelectItem>
              <SelectItem value="in_progress">进行中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>附件 (图片、PDF 等)</Label>
        {existing.length > 0 && (
          <AttachmentList
            paths={existing}
            onRemove={(p) => setExisting((cur) => cur.filter((x) => x !== p))}
          />
        )}
        <Input
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 && (
          <p className="text-xs text-muted-foreground">已选 {files.length} 个文件</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={saving}>{saving ? "保存中..." : task ? "保存" : "创建"}</Button>
    </form>
  );
}
