"use client";
import { useState, useTransition } from "react";
import SubmitButton from "@/components/SubmitButton";
import { btn, inp } from "@/components/ui";
import { enrollMfa, confirmMfa, type Enroll } from "@/app/mfa-actions";
type Started = Extract<Enroll, { ok: true }>;
/** Two steps: get a QR code, then prove the app works by typing the first code. */
export default function MfaSetup() {
  const [s, setS] = useState<Started | null>(null), [err, setErr] = useState(""), [busy, start] = useTransition();
  if (!s) return <div className="space-y-3">
    <p className="text-sm text-ink/70">Use an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password) to add a 6-digit code to every sign-in. A stolen password then isn't enough to get in.</p>
    {err && <p role="alert" className="text-sm text-danger">{err}</p>}
    <button type="button" disabled={busy} className={btn} onClick={() => start(async () => { const r = await enrollMfa(); if (r.ok) { setErr(""); setS(r); } else setErr(r.error); })}>{busy ? "Starting…" : "Set up authenticator app"}</button></div>;
  return <form action={confirmMfa} className="space-y-3">
    <input type="hidden" name="factorId" value={s.factorId} />
    <p className="text-sm">1. Scan this code with your authenticator app.</p>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={s.qr} alt="QR code for your authenticator app" width={176} height={176} className="rounded-xl bg-white p-2" />
    <p className="text-xs text-ink/70">Can't scan? Type this key into the app instead: <code className="select-all break-all font-mono">{s.secret}</code></p>
    <label className="block text-sm">2. Type the 6-digit code it shows
      <input name="code" required inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} autoComplete="one-time-code" className={`${inp} max-w-[10rem] tracking-widest tabular-nums`} /></label>
    <SubmitButton className={btn}>Turn on</SubmitButton></form>;
}
