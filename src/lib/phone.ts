// Chinese mobile phone helpers
export const CN_PHONE_RE = /^1[3-9]\d{9}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidCNPhone(p: string): boolean {
  return CN_PHONE_RE.test(p.trim());
}

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

export function normalizePhone(p: string): string {
  return p.replace(/\s|-/g, "").trim();
}

// Synthetic email used as the Supabase auth identifier for phone-only users.
// The real phone is stored on profiles.phone (unique).
export function phoneToAuthEmail(phone: string): string {
  return `${normalizePhone(phone)}@phone.local`;
}

export function isSyntheticPhoneEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith("@phone.local");
}
