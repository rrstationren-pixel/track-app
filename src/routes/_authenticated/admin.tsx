import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, ListChecks, FileText, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "管理控制台" }] }),
  component: AdminLayout,
});

const NAV: { to: "/admin" | "/admin/tasks" | "/admin/reports" | "/admin/users"; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/admin", label: "仪表盘", icon: LayoutDashboard, exact: true },
  { to: "/admin/tasks", label: "任务管理", icon: ListChecks },
  { to: "/admin/reports", label: "报告管理", icon: FileText },
  { to: "/admin/users", label: "用户管理", icon: Users },
];

function AdminLayout() {
  const { role, loading } = useAuth();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && role && role !== "admin") nav({ to: "/employee" });
  }, [role, loading, nav]);

  return (
    <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      <aside className="md:sticky md:top-4 md:self-start">
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  );
}
