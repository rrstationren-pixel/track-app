import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidCNPhone, normalizePhone, phoneToAuthEmail } from "@/lib/phone";

type Role = "admin" | "employee";

async function assertAdmin(ctx: { supabase: ReturnType<typeof Object>; userId: string }) {
  const { data, error } = await (ctx.supabase as any)
    .rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string }) => input ?? {})
  .handler(async ({ context, data }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: pe } = await supabaseAdmin
      .from("profiles")
      .select("id, name, phone, active, created_at")
      .order("created_at", { ascending: false });
    if (pe) throw new Error(pe.message);

    const { data: roles, error: re } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (re) throw new Error(re.message);

    const roleMap = new Map<string, Role>();
    for (const r of roles ?? []) {
      const cur = roleMap.get(r.user_id);
      if (r.role === "admin" || !cur) roleMap.set(r.user_id, r.role as Role);
    }

    const q = (data.search ?? "").trim().toLowerCase();
    const users = (profiles ?? [])
      .map((p) => ({ ...p, role: roleMap.get(p.id) ?? ("employee" as Role) }))
      .filter((u) => {
        if (!q) return true;
        return (
          (u.name ?? "").toLowerCase().includes(q) ||
          (u.phone ?? "").toLowerCase().includes(q)
        );
      });

    return { users };
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string; password: string; name: string; role: Role }) => input)
  .handler(async ({ context, data }) => {
    await assertAdmin(context as any);
    const phone = normalizePhone(data.phone || "");
    if (!isValidCNPhone(phone)) throw new Error("请输入正确的中国大陆手机号");
    if (!data.password || data.password.length < 6) throw new Error("密码至少 6 位");
    if (!data.name?.trim()) throw new Error("姓名必填");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Enforce phone uniqueness at app layer too (DB has unique index as backstop)
    const { data: existing } = await supabaseAdmin
      .from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (existing) throw new Error("该手机号已被注册");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: phoneToAuthEmail(phone),
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, phone },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    await supabaseAdmin.from("profiles").upsert({
      id: uid, name: data.name, phone, email: null,
    });
    if (data.role === "admin") {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: uid, role: "admin" }, { onConflict: "user_id,role" },
      );
    }
    return { ok: true, userId: uid };
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; name?: string; role?: Role }) => input)
  .handler(async ({ context, data }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.name !== undefined) {
      const { error } = await supabaseAdmin.from("profiles").update({ name: data.name }).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }
    if (data.role !== undefined) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    }
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; active: boolean }) => input)
  .handler(async ({ context, data }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: pe } = await supabaseAdmin.from("profiles").update({ active: data.active }).eq("id", data.userId);
    if (pe) throw new Error(pe.message);

    const { error: ae } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (ae) throw new Error(ae.message);

    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; newPassword: string }) => input)
  .handler(async ({ context, data }) => {
    await assertAdmin(context as any);
    if (!data.newPassword || data.newPassword.length < 6) throw new Error("密码至少 6 位");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.newPassword });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
