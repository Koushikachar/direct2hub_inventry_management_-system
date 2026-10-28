import type { Metadata } from "next";
import SubmitButton from "@/components/SubmitButton";
import MfaSetup from "@/components/MfaSetup";
import { Shell } from "@/components/Shell"; import { Err, Panel, ghost } from "@/components/ui";
import { ctx } from "@/lib/ctx"; import { adminMfaRequired } from "@/lib/admin";
import { sbServer } from "@/lib/supabase";
import { disableMfa } from "@/app/mfa-actions";
export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Security({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const c = await ctx(), { e, ok } = await searchParams, factors = (await (await sbServer()).auth.mfa.listFactors()).data?.totp ?? [], on = factors.length > 0;
  return <Shell title="Two-step sign-in" active="Settings" admin={c.op}><Err e={e} />{ok && <p role="status" className="rounded-lg bg-brand/10 px-4 py-2 text-sm text-brand">{ok}</p>}
    {c.op && adminMfaRequired() && !c.user.aal2 && <p role="alert" className="rounded-xl border border-turmeric/40 bg-turmeric/10 px-4 py-2 text-sm">You manage the platform, so the admin panel stays locked until two-step sign-in is on and you've signed in with a code.</p>}
    <Panel title="Authenticator app">{on
      ? <div className="space-y-3"><p className="text-sm">Status: <b className="text-brand">On</b>. Signing in asks for a 6-digit code.</p>
        {factors.map((f) => <form key={f.id} action={disableMfa} className="flex items-center gap-3"><input type="hidden" name="factorId" value={f.id} /><SubmitButton className={ghost}>Turn off</SubmitButton>
          <span className="text-xs text-ink/60">Needs a session where you've entered a code.</span></form>)}</div>
      : <MfaSetup />}</Panel></Shell>;
}
