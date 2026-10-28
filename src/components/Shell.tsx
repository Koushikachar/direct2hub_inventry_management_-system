/** Page body helper. The sidebar/tab bar live in the shared (app) layout (AppChrome), so navigating only swaps this part. */
export function Shell({ title, children }: { title: string; active?: string; admin?: boolean; children: React.ReactNode }) {
  return <><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1><div className="mt-4 space-y-5 md:mt-6 md:space-y-6">{children}</div></>;
}
export function Stat({ label, value, hint, tone = "brand" }: { label: string; value: string | number; hint?: string; tone?: "brand" | "warn" }) {
  return <div className="glass p-4 md:p-5">
    <div className="flex items-center gap-2 text-sm text-ink/60"><span className={`h-2 w-2 shrink-0 rounded-full ${tone === "warn" ? "bg-turmeric" : "bg-brand"}`} />{label}</div>
    <div className="mt-2 break-words text-2xl font-bold tabular-nums tracking-tight sm:text-3xl md:text-4xl">{value}</div>
    {hint && <div className="mt-1 text-xs text-ink/60">{hint}</div>}</div>;
}
