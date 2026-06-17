import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  isValidCNPhone, isValidEmail, normalizePhone, phoneToAuthEmail,
} from "@/lib/phone";
import { resolveLoginEmail } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "登录 · 任务管理" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/" });
    });
  }, [nav]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4 py-8">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-1 text-2xl font-bold">任务管理系统</h1>
        <p className="mb-6 text-sm text-muted-foreground">请登录</p>
        <LoginForm onDone={() => nav({ to: "/" })} />
        <p className="mt-6 text-xs text-muted-foreground">
          内部系统不开放自助注册。如需账号，请联系管理员开通。
        </p>
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
