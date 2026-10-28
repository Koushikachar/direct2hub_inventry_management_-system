import Link from "next/link";
export const inp = "min-h-11 w-full rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-base shadow-inner backdrop-blur transition focus:bg-white/90 md:min-h-0 md:text-sm";
export const btn = "ghost-hit min-h-11 rounded-xl bg-gradient-to-b from-teal-500 to-brand px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(15,118,110,.4),inset_0_1px_0_rgba(255,255,255,.35)] transition hover:brightness-110 active:scale-[.98] disabled:opacity-50 md:min-h-0";
export const ghost = "ghost-hit min-h-10 rounded-xl border border-white/70 bg-white/50 px-3 py-1 text-sm backdrop-blur transition hover:bg-white/80 md:min-h-0";
export const Err = ({ e }: { e?: string }) => e ? <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger backdrop-blur">{e}</p> : null;
export const Panel = ({ title, children }: { title: string; children: React.ReactNode }) =>
  <section className="glass p-5"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>;
/** Desktop: a normal table. Phones: each row becomes a card (first cell is the title, other cells are labelled values; forms and links span the full width). */
export function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <div className="glass p-6 text-center text-sm text-ink/60">{empty}</div>;
  return <>
    <div className="glass hidden overflow-hidden md:block"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-white/40 text-left"><tr>{head.map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-medium text-ink/70">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-white/60 transition hover:bg-white/40">{r.map((c, j) => <td key={j} className="px-4 py-3">{c}</td>)}</tr>)}</tbody></table></div></div>
    <ul className="space-y-2.5 md:hidden">{rows.map((r, i) => <li key={i} className="glass p-4">
      <div className="font-semibold">{r[0]}</div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">{r.slice(1).map((c, j) => <div key={j} className={typeof c === "object" && c !== null ? "col-span-2" : "min-w-0"}>
        <dt className="text-xs text-ink/60">{head[j + 1]}</dt><dd className="break-words">{c}</dd></div>)}</dl></li>)}</ul></>;
}
export function Pager({ page, hasNext, params }: { page: number; hasNext: boolean; params?: Record<string, string | undefined> }) {
  const href = (p: number) => { const q = new URLSearchParams(); Object.entries(params ?? {}).forEach(([k, v]) => v && q.set(k, v)); q.set("page", String(p)); return `?${q}`; };
  if (page === 1 && !hasNext) return null;
  return <nav aria-label="Pagination" className="flex items-center justify-between text-sm">{page > 1 ? <Link href={href(page - 1)} className={ghost}>← Previous</Link> : <span />}
    <span className="text-ink/60">Page {page}</span>{hasNext ? <Link href={href(page + 1)} className={ghost}>Next →</Link> : <span />}</nav>;
}
