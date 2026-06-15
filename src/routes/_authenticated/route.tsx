import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

function Layout() {
  const { role, user } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState<{ name: string | null; phone: string | null; email: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("name, phone, email").eq("id", user.id).maybeSingle()
      .then(({ data }) => setProfile(data as { name: string | null; phone: string | null; email: string | null } | null));
  }, [user]);


  async function logout() {
    await supabase.auth.signOut();
    nav({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold">任务管理系统</Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground hidden sm:inline">
              {profile?.name || profile?.phone || profile?.email || ""} {role === "admin" ? "(管理员)" : role === "employee" ? "(员工)" : ""}
            </span>

            <Button size="sm" variant="ghost" onClick={logout}>
              <LogOut className="mr-1 h-4 w-4" /> 退出
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
