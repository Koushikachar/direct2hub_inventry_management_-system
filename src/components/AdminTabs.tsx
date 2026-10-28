import Link from "next/link";
const tabs = [["Overview", "/admin"], ["Organizations", "/admin/orgs"], ["Subscriptions", "/admin/subscriptions"], ["Messages", "/admin/messages"], ["Users", "/admin/users"], ["Audit log", "/admin/audit"]];
export default function AdminTabs({ current }: { current: string }) {
  return <nav aria-label="Admin sections" className="glass flex w-fit max-w-full gap-1 overflow-x-auto p-1.5">{tabs.map(([n, h]) =>
    <Link key={n} href={h} className={`whitespace-nowrap rounded-xl px-4 py-1.5 text-sm transition ${current === n ? "bg-ink text-white" : "hover:bg-white/60"}`}>{n}</Link>)}</nav>;
}
export const Pill = ({ on, yes, no }: { on: boolean; yes: string; no: string }) =>
  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${on ? "bg-danger/15 text-danger" : "bg-brand/15 text-brand"}`}>{on ? yes : no}</span>;
