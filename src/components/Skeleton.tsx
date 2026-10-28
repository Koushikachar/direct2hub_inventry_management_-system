/** Loading placeholders that mirror each page's real layout (including the phone card view of tables), so nothing jumps when data arrives. */
const bar = "rounded-xl bg-white/60";
export const Pulse = ({ children }: { children: React.ReactNode }) =>
  <div role="status" aria-busy="true" className="space-y-5 motion-safe:animate-pulse md:space-y-6">{children}<span className="sr-only">Loading…</span></div>;
export const SkTitle = ({ w = "w-48" }: { w?: string }) => <div className={`h-8 md:h-9 ${w} ${bar}`} />;
export const SkLine = ({ w = "w-full max-w-xl" }: { w?: string }) => <div className={`h-4 ${w} ${bar}`} />;
export const SkBar = ({ h = "h-11", w = "w-full" }: { h?: string; w?: string }) => <div className={`${h} ${w} ${bar}`} />;
export const SkPills = ({ n = 3 }: { n?: number }) => <div className="glass flex w-fit gap-1 p-1.5">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-8 w-20 rounded-xl bg-white/60" />)}</div>;
export const SkTabs = () => <div className="glass flex w-fit max-w-full gap-1 overflow-hidden p-1.5">{[28, 32, 20, 24].map((w, i) => <div key={i} className="h-8 rounded-xl bg-white/60" style={{ width: `${w * 4}px` }} />)}</div>;
export const SkStats = ({ n = 4 }: { n?: number }) =>
  <div className={`grid gap-3 md:gap-4 ${n === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 xl:grid-cols-4"}`}>{Array.from({ length: n }).map((_, i) =>
    <div key={i} className="glass p-4 md:p-5"><div className={`h-3 w-24 ${bar}`} /><div className={`mt-3 h-8 w-20 ${bar}`} /><div className={`mt-2 h-2.5 w-28 ${bar}`} /></div>)}</div>;
export const SkForm = ({ fields = 4 }: { fields?: number }) =>
  <div className="glass p-5"><div className={`mb-4 h-5 w-36 ${bar}`} /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: fields }).map((_, i) =>
    <div key={i}><div className={`mb-1.5 h-3 w-20 ${bar}`} /><div className={`h-11 w-full md:h-10 ${bar}`} /></div>)}</div><div className={`mt-4 h-11 w-36 md:h-10 ${bar}`} /></div>;
export const SkChart = () => <div className="glass p-5"><div className={`h-5 w-40 ${bar}`} /><div className="mt-4 flex h-48 items-end gap-2">{[40, 65, 50, 80, 55, 90, 70, 45].map((h, i) => <div key={i} className="flex-1 rounded-t-lg bg-white/60" style={{ height: `${h}%` }} />)}</div></div>;
export const SkPanel = ({ lines = 3 }: { lines?: number }) => <div className="glass space-y-3 p-5"><div className={`h-5 w-40 ${bar}`} />{Array.from({ length: lines }).map((_, i) => <div key={i} className={`h-4 ${bar}`} style={{ width: `${90 - i * 15}%` }} />)}</div>;
export const SkList = ({ n = 5 }: { n?: number }) => <ul className="space-y-2">{Array.from({ length: n }).map((_, i) =>
  <li key={i} className="glass flex items-start gap-3 p-4"><div className="mt-1.5 h-2 w-2 rounded-full bg-white/70" /><div className="flex-1 space-y-2"><div className={`h-4 w-2/3 ${bar}`} /><div className={`h-3 w-1/2 ${bar}`} /><div className={`h-2.5 w-24 ${bar}`} /></div></li>)}</ul>;
export const SkTable = ({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) => <>
  <div className="glass hidden overflow-hidden md:block"><div className="flex gap-4 bg-white/40 px-4 py-3">{Array.from({ length: cols }).map((_, i) => <div key={i} className={`h-3.5 flex-1 ${bar}`} />)}</div>
    {Array.from({ length: rows }).map((_, r) => <div key={r} className="flex gap-4 border-t border-white/60 px-4 py-4">{Array.from({ length: cols }).map((_, i) => <div key={i} className={`h-4 flex-1 ${bar}`} style={{ opacity: i === 0 ? 1 : 0.75 }} />)}</div>)}</div>
  <ul className="space-y-2.5 md:hidden">{Array.from({ length: Math.min(rows, 4) }).map((_, i) => <li key={i} className="glass p-4"><div className={`h-5 w-1/2 ${bar}`} />
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">{Array.from({ length: Math.min(cols - 1, 4) }).map((_, j) => <div key={j}><div className={`h-2.5 w-14 ${bar}`} /><div className={`mt-1.5 h-4 w-20 ${bar}`} /></div>)}</div></li>)}</ul></>;
