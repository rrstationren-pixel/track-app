import { createServerFn } from "@tanstack/react-start";
import { isValidCNPhone, isValidEmail, normalizePhone, phoneToAuthEmail } from "@/lib/phone";

/**
 * Public resolver: given a login "account" (email or CN phone), returns the
 * email Supabase Auth knows the user by. For email logins it echoes the email.
 * For phone logins it looks up profiles.phone -> auth user email (which for
 * phone-only accounts is the synthetic @phone.local address).
 * Returns null when no matching user exists; callers should surface a generic
 * "账号或密码错误" message to avoid account enumeration.
 */
export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { account: string }) => ({ account: String(input?.account ?? "") }))
  .handler(async ({ data }) => {
    const account = data.account.trim();
    if (!account) return { email: null as string | null };

    if (isValidEmail(account)) return { email: account.toLowerCase() };

    const phone = normalizePhone(account);
    if (!isValidCNPhone(phone)) return { email: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();

    if (!profile) {
      // No profile -- still return the synthetic candidate so the password
      // check fails uniformly without leaking which accounts exist.
      return { email: phoneToAuthEmail(phone) };
    }

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    const email = userRes?.user?.email ?? phoneToAuthEmail(phone);
    return { email };
  });

/**
 * Public availability check used by self-registration before calling signUp,
 * so we can show a friendly error rather than a raw auth failure.
 */
export const checkRegistrationAvailability = createServerFn({ method: "POST" })
  .inputValidator((input: { email?: string | null; phone?: string | null }) => ({
    email: input?.email ? String(input.email).trim().toLowerCase() : null,
    phone: input?.phone ? normalizePhone(String(input.phone)) : null,
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.phone) {
      const { data: p } = await supabaseAdmin
        .from("profiles").select("id").eq("phone", data.phone).maybeSingle();
      if (p) return { ok: false, reason: "phone_taken" as const };
    }
    if (data.email) {
      const { data: p } = await supabaseAdmin
        .from("profiles").select("id").eq("email", data.email).maybeSingle();
      if (p) return { ok: false, reason: "email_taken" as const };
    }
    return { ok: true as const };
  });
