/** Pure helpers for the aging and month-range reports (no database). */
export const BUCKETS = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;
/** Index into BUCKETS for an amount that was due on `due`, looked at on `now`. */
export function bucketOf(due: Date, now = new Date()) {
  const days = Math.floor((now.getTime() - due.getTime()) / 864e5);
  return days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
}
/** "2026-10" -> [1 Oct, 1 Nov) in Indian time (so a 11:50 pm sale on 31 Oct lands in October). Anything invalid means the current month. */
export function monthRange(m?: string, now = new Date()) {
  const cur = new Date(now.getTime() + 5.5 * 3600e3).toISOString().slice(0, 7), key = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : cur;
  const [y, mo] = key.split("-").map(Number), next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return { key, from: new Date(`${key}-01T00:00:00+05:30`), to: new Date(`${next}-01T00:00:00+05:30`) };
}

/** Reorder suggestion from sales speed. perDay = units sold / window days. Level = demand during lead time + safety days. Order qty tops stock up to level + 30 days of sales. */
export function reorderCalc(avail: number, sold: number, windowDays: number, lead: number, safety: number) {
  const perDay = windowDays > 0 ? sold / windowDays : 0, level = Math.ceil(perDay * (lead + safety)), cover = perDay > 0 ? avail / perDay : Infinity;
  const need = perDay > 0 && avail <= level, qty = need ? Math.max(1, Math.ceil(perDay * (lead + safety + 30)) - avail) : 0;
  return { perDay, level, daysLeft: Number.isFinite(cover) ? Math.max(0, Math.floor(cover)) : null, need, qty };
}
