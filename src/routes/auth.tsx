import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  isValidCNPhone, isValidEmail, normalizePhone, phoneToAuthEmail,
} from "@/lib/phone";
import { resolveLoginEmail, checkRegistrationAvailability } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "登录 · 任务管理" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<"login" | "register">("login");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/" });
    });
  }, [nav]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4 py-8">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-1 text-2xl font-bold">任务管理系统</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {tab === "login" ? "请登录" : "创建新账户"}
        </p>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")}>
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register">注册</TabsTrigger>
          </TabsList>
          <TabsContent value="login"><LoginForm onDone={() => nav({ to: "/" })} /></TabsContent>
          <TabsContent value="register"><RegisterForm onDone={() => nav({ to: "/" })} /></TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const resolve = useServerFn(resolveLoginEmail);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const acc = account.trim();
    if (!acc) { toast.error("请输入手机号或邮箱"); return; }
    const isEmail = isValidEmail(acc);
    const isPhone = isValidCNPhone(normalizePhone(acc));
    if (!isEmail && !isPhone) { toast.error("请输入正确的手机号或邮箱"); return; }

    setLoading(true);
    try {
      const { email } = (await resolve({ data: { account: acc } })) as { email: string | null };
      const loginEmail = email
        ?? (isPhone ? phoneToAuthEmail(normalizePhone(acc)) : acc.toLowerCase());
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail, password,
      });
      if (error) throw error;
      toast.success("登录成功");
      onDone();
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(/invalid|credentials/i.test(msg) ? "账号或密码错误" : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="account">手机号或邮箱</Label>
        <Input
          id="account"
          autoComplete="username"
          placeholder="手机号或邮箱"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          minLength={6} required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "登录中…" : "登录"}
      </Button>
    </form>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const check = useServerFn(checkRegistrationAvailability);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("请填写姓名"); return; }
    const emailT = email.trim().toLowerCase();
    const phoneT = normalizePhone(phone);
    if (!emailT && !phoneT) { toast.error("邮箱和手机号至少填写一项"); return; }
    if (emailT && !isValidEmail(emailT)) { toast.error("邮箱格式不正确"); return; }
    if (phoneT && !isValidCNPhone(phoneT)) { toast.error("请输入正确的中国大陆手机号"); return; }
    if (password.length < 6) { toast.error("密码至少 6 位"); return; }

    setLoading(true);
    try {
      const avail = (await check({
        data: { email: emailT || null, phone: phoneT || null },
      })) as { ok: boolean; reason?: string };
      if (!avail.ok) {
        toast.error(avail.reason === "phone_taken" ? "该手机号已被注册" : "该邮箱已被注册");
        return;
      }

      const authEmail = emailT || phoneToAuthEmail(phoneT);
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { name: name.trim(), phone: phoneT || null },
        },
      });
      if (error) throw error;
      toast.success("注册成功");
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="r-name">姓名</Label>
        <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-email">邮箱 <span className="text-xs text-muted-foreground">(选填)</span></Label>
        <Input id="r-email" type="email" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="r-phone">手机号 <span className="text-xs text-muted-foreground">(选填)</span></Label>
        <Input id="r-phone" type="tel" inputMode="numeric" autoComplete="tel"
          maxLength={11} placeholder="11 位手机号"
          value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">邮箱与手机号至少填写一项</p>
      <div className="space-y-1.5">
        <Label htmlFor="r-password">密码</Label>
        <Input id="r-password" type="password" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "注册中…" : "注册"}
      </Button>
    </form>
  );
}
