import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, KeyRound, Pencil } from "lucide-react";
import {
  listUsers, createUser, updateUser, setUserActive, resetUserPassword,
} from "@/lib/admin.functions";
import { isValidCNPhone, normalizePhone } from "@/lib/phone";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "用户管理" }] }),
  component: UsersPage,
});

type Role = "admin" | "employee";
type User = {
  id: string; name: string; phone: string | null;
  active: boolean; created_at: string; role: Role;
};

function UsersPage() {
  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const update = useServerFn(updateUser);
  const toggle = useServerFn(setUserActive);
  const reset = useServerFn(resetUserPassword);

  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);
  const [pwdUser, setPwdUser] = useState<User | null>(null);

  async function load() {
    try {
      const r = await list({ data: {} });
      setUsers((r as { users: User[] }).users);
    } catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return users;
    return users.filter((u) =>
      (u.name ?? "").toLowerCase().includes(qq) || (u.phone ?? "").toLowerCase().includes(qq),
    );
  }, [users, q]);

  async function onToggle(u: User) {
    try {
      await toggle({ data: { userId: u.id, active: !u.active } });
      toast.success(u.active ? "已禁用" : "已启用");
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> 新建用户</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>新建用户</DialogTitle></DialogHeader>
            <CreateUserForm
              onSubmit={async (v) => {
                try { await create({ data: v }); toast.success("已创建"); setOpenCreate(false); load(); }
                catch (e) { toast.error((e as Error).message); }
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Input placeholder="搜索姓名 / 手机号…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />

      <div className="space-y-2">
        {visible.length === 0 && <p className="text-sm text-muted-foreground">暂无用户</p>}
        {visible.map((u) => (
          <Card key={u.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{u.name || "(未命名)"}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{u.phone ?? "—"}</span>
                  <Badge variant={u.role === "admin" ? "default" : "outline"}>
                    {u.role === "admin" ? "管理员" : "员工"}
                  </Badge>
                  <Badge variant={u.active ? "secondary" : "destructive"}>
                    {u.active ? "已启用" : "已禁用"}
                  </Badge>
                  <span>注册: {new Date(u.created_at).toLocaleDateString("zh-CN")}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <Switch checked={u.active} onCheckedChange={() => onToggle(u)} />
                  <span className="text-muted-foreground">{u.active ? "启用" : "禁用"}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEdit(u)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> 编辑
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPwdUser(u)}>
                  <KeyRound className="mr-1 h-3.5 w-3.5" /> 重置密码
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑用户</DialogTitle></DialogHeader>
          {edit && (
            <EditUserForm
              user={edit}
              onSubmit={async (v) => {
                try { await update({ data: { userId: edit.id, ...v } }); toast.success("已保存"); setEdit(null); load(); }
                catch (e) { toast.error((e as Error).message); }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwdUser} onOpenChange={(o) => !o && setPwdUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>重置密码 — {pwdUser?.phone}</DialogTitle></DialogHeader>
          {pwdUser && (
            <ResetPasswordForm
              onSubmit={async (pwd) => {
                try { await reset({ data: { userId: pwdUser.id, newPassword: pwd } }); toast.success("密码已重置"); setPwdUser(null); }
                catch (e) { toast.error((e as Error).message); }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateUserForm({ onSubmit }: { onSubmit: (v: { phone: string; password: string; name: string; role: Role }) => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const p = normalizePhone(phone);
        if (!isValidCNPhone(p)) { toast.error("请输入正确的中国大陆手机号"); return; }
        setSaving(true);
        try { await onSubmit({ phone: p, password, name, role }); } finally { setSaving(false); }
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5"><Label>姓名</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5">
        <Label>手机号</Label>
        <Input type="tel" inputMode="numeric" maxLength={11} placeholder="11 位手机号" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <div className="space-y-1.5"><Label>密码</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
      <div className="space-y-1.5">
        <Label>角色</Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="employee">员工</SelectItem>
            <SelectItem value="admin">管理员</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={saving}>{saving ? "创建中..." : "创建"}</Button>
    </form>
  );
}

function EditUserForm({ user, onSubmit }: { user: User; onSubmit: (v: { name: string; role: Role }) => Promise<void> }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSubmit({ name, role }); setSaving(false); }} className="space-y-3">
      <div className="space-y-1.5"><Label>姓名</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5">
        <Label>手机号</Label>
        <Input value={user.phone ?? ""} disabled />
        <p className="text-xs text-muted-foreground">手机号创建后不可修改</p>
      </div>
      <div className="space-y-1.5">
        <Label>角色</Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="employee">员工</SelectItem>
            <SelectItem value="admin">管理员</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
    </form>
  );
}

function ResetPasswordForm({ onSubmit }: { onSubmit: (pwd: string) => Promise<void> }) {
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSubmit(pwd); setSaving(false); }} className="space-y-3">
      <div className="space-y-1.5"><Label>新密码</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={6} /></div>
      <Button type="submit" className="w-full" disabled={saving}>{saving ? "重置中..." : "重置密码"}</Button>
    </form>
  );
}
