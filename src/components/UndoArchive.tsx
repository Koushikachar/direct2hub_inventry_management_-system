"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "./Toaster";
/** Archive without a confirmation dialog: it happens at once and a toast offers Undo for 7 seconds. */
export default function UndoArchive({ id, name, archive, restore, className }: { id: string; name: string; archive: (id: string) => Promise<{ ok: boolean; error?: string }>; restore: (id: string) => Promise<{ ok: boolean; error?: string }>; className: string }) {
  const toast = useToast(), router = useRouter(), [pending, start] = useTransition();
  return <button type="button" disabled={pending} className={className} onClick={() => start(async () => {
    const r = await archive(id); if (!r.ok) { toast(r.error ?? "Couldn't archive that", { tone: "err" }); return; }
    toast(`${name} archived`, { undo: async () => { const b = await restore(id); toast(b.ok ? `${name} restored` : (b.error ?? "Couldn't restore"), { tone: b.ok ? "ok" : "err" }); router.refresh(); } });
    router.push("/products");
  })}>{pending ? "Archiving…" : "Archive"}</button>;
}
