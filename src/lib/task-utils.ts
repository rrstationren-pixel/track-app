export const STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  in_progress: "进行中",
  completed: "已完成",
};

export function fmtDate(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("zh-CN");
}
export function fmtDateTime(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("zh-CN");
}

/** Days between two dates (rounded down, positive if a > b). */
export function dayDiff(a: string | Date, b: string | Date) {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  const ms = da.getTime() - db.getTime();
  return Math.floor(ms / 86400000);
}

export function isOverdueLike(t: { status: string; due_date: string | null; completed_at?: string | null }) {
  if (!t.due_date) return false;
  const due = new Date(t.due_date + "T23:59:59");
  if (t.status === "completed") {
    return t.completed_at ? new Date(t.completed_at) > due : false;
  }
  return new Date() > due;
}

/** Returns "提前 N 天完成" / "超期 N 天完成" / "按时完成" / null */
export function completionLabel(t: { due_date: string | null; completed_at: string | null }) {
  if (!t.completed_at || !t.due_date) return null;
  const diff = dayDiff(t.completed_at, t.due_date + "T23:59:59");
  if (diff > 0) return `超期 ${diff} 天完成`;
  if (diff < 0) return `提前 ${-diff} 天完成`;
  return "按时完成";
}
