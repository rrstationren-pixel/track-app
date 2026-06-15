import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Upload, Image as ImageIcon } from "lucide-react";
import { ImageGallery } from "@/components/image-gallery";

export const Route = createFileRoute("/_authenticated/task/$taskId")({
  head: () => ({ meta: [{ title: "任务详情" }] }),
  component: TaskDetailPage,
});

type Task = {
  id: string; title: string; description: string | null;
  assigned_to: string | null; status: string; due_date: string | null; created_at: string;
};
type Report = { id: string; note: string; photo_url: string | null; submitted_at: string; employee_id: string };

const STATUS_LABEL: Record<string, string> = { pending: "待处理", in_progress: "进行中", completed: "已完成" };

function TaskDetailPage() {
  const { taskId } = Route.useParams();
  const { user, role } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [assigneeName, setAssigneeName] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [galleryPaths, setGalleryPaths] = useState<string[] | null>(null);

  async function load() {
    const { data: t } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
    setTask(t as Task | null);
    const { data: r } = await supabase.from("reports").select("*").eq("task_id", taskId).order("submitted_at", { ascending: false });
    setReports((r as Report[]) ?? []);
    if (t?.assigned_to) {
      const { data: p } = await supabase.from("profiles").select("name").eq("id", t.assigned_to).maybeSingle();
      setAssigneeName(p?.name ?? null);
    }
  }
  useEffect(() => { load(); }, [taskId]);

  const isAssignee = task?.assigned_to === user?.id;
  const isAdmin = role === "admin";

  async function updateStatus(status: string) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) toast.error(error.message);
    else { toast.success("状态已更新"); load(); }
  }

  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !task) return;
    setSaving(true);
    try {
      let photo_url: string | null = null;
      if (file) {
        const dotIdx = file.name.lastIndexOf(".");
        const rawExt = dotIdx >= 0 ? file.name.slice(dotIdx + 1) : "";
        const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 10) || "bin";
        const base = (dotIdx >= 0 ? file.name.slice(0, dotIdx) : file.name)
          .replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "")
          .slice(0, 40) || "file";
        const path = `${user.id}/${task.id}/${Date.now()}-${base}.${ext}`;
        const { error: upErr } = await supabase.storage.from("task-photos").upload(path, file, {
          contentType: file.type || undefined,
        });
        if (upErr) throw upErr;
        photo_url = path;
      }
      const { error } = await supabase.from("reports").insert({
        task_id: task.id, employee_id: user.id, note, photo_url,
      });
      if (error) throw error;
      if (task.status === "pending") await supabase.from("tasks").update({ status: "in_progress" }).eq("id", task.id);
      toast.success("报告已提交");
      setNote(""); setFile(null);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setSaving(false); }
  }

  if (!task) return <p className="text-muted-foreground">加载中...</p>;

  const reportImages = reports.filter((r) => r.photo_url).map((r) => r.photo_url!) as string[];

  return (
    <div className="space-y-4">
      <Link to={isAdmin ? "/admin" : "/employee"} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> 返回
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{task.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <Badge>{STATUS_LABEL[task.status]}</Badge>
              <span>负责人: {assigneeName ?? "未分配"}</span>
              {task.due_date && <span>截止: {task.due_date}</span>}
              <span>创建: {new Date(task.created_at).toLocaleString("zh-CN")}</span>
            </div>
          </div>
        </div>
        {task.description && <p className="mt-3 whitespace-pre-wrap text-sm">{task.description}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {isAssignee && task.status !== "completed" && (
            <>
              {task.status === "pending" && (
                <Button size="sm" variant="outline" onClick={() => updateStatus("in_progress")}>开始任务</Button>
              )}
              <Button size="sm" onClick={() => updateStatus("completed")}>标记完成</Button>
            </>
          )}
          {isAdmin && task.status !== "completed" && (
            <Button size="sm" variant="outline" onClick={() => updateStatus("completed")}>管理员标记完成</Button>
          )}
        </div>
      </Card>

      {isAssignee && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">提交进度报告</h2>
          <form onSubmit={submitReport} className="space-y-3">
            <div className="space-y-1.5">
              <Label>进度备注</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} required />
            </div>
            <div className="space-y-1.5">
              <Label>上传照片(可选)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <Button type="submit" disabled={saving}>
              <Upload className="mr-1 h-4 w-4" /> {saving ? "提交中..." : "提交报告"}
            </Button>
          </form>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">报告记录 ({reports.length})</h2>
          {reportImages.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setGalleryPaths(reportImages)}>
              <ImageIcon className="mr-1 h-4 w-4" /> 查看全部图片 ({reportImages.length})
            </Button>
          )}
        </div>
        {reports.length === 0 && <p className="text-sm text-muted-foreground">暂无报告</p>}
        <div className="space-y-2">
          {reports.map((r, i) => (
            <div key={r.id} className="rounded border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  报告 #{reports.length - i} · {new Date(r.submitted_at).toLocaleString("zh-CN")}
                </div>
                {r.photo_url && (
                  <Button size="sm" variant="ghost" onClick={() => setGalleryPaths([r.photo_url!])}>
                    <ImageIcon className="mr-1 h-3.5 w-3.5" /> 查看图片
                  </Button>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{r.note}</p>
            </div>
          ))}
        </div>
      </Card>

      <ImageGallery
        paths={galleryPaths ?? []}
        open={galleryPaths !== null}
        onOpenChange={(o) => !o && setGalleryPaths(null)}
      />
    </div>
  );
}
