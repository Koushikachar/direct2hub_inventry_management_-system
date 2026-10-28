export const OPS: [string, string][] = [["gt", "is greater than"], ["lt", "is less than"], ["eq", "equals"], ["neq", "does not equal"], ["contains", "contains"]];
/** True when there is no condition, or the event data satisfies it. */
export function matches(data: Record<string, unknown>, field?: string | null, op?: string | null, value?: string | null) {
  if (!field || !op) return true; const v = data[field]; if (v === undefined || v === null) return false; const a = String(v).toLowerCase(), b = String(value ?? "").toLowerCase();
  if (op === "gt") return Number(v) > Number(value); if (op === "lt") return Number(v) < Number(value);
  if (op === "eq") return a === b; if (op === "neq") return a !== b; if (op === "contains") return a.includes(b); return false;
}
/** Replaces {{key}} with the event's value. Unknown keys become empty text. */
export const render = (tpl: string, data: Record<string, unknown>) => tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (data[k] === undefined || data[k] === null ? "" : String(data[k])));
