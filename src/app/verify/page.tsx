import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { resendVerification, verifyEmailCode } from "../actions";
import AuthCard from "@/components/AuthCard";
import { Err, inp, ghost } from "@/components/ui";
export const metadata = { title: "Verify your email", description: "Confirm your email address to finish setting up Direct2Hub.", robots: { index: false, follow: false } };
export default async function Verify({ searchParams }: { searchParams: Promise<{ email?: string; e?: string; ok?: string }> }) {
  const { email = "", e, ok } = await searchParams;
  return <AuthCard title="Check your email" sub={email ? `We sent a verification link to ${email}. Open it in this browser to finish signing up.` : "Open the verification link we emailed you."}>
    <Err e={e} />{ok && <p role="status" className="rounded-lg bg-brand/10 px-4 py-2 text-sm text-brand">A new link was sent. Check your spam folder too.</p>}
    <form action={verifyEmailCode} className="mt-3 space-y-3">{email ? <input type="hidden" name="email" value={email} /> : <label className="block text-sm">Email<input name="email" type="email" required autoComplete="email" className={inp} /></label>}
      <label className="block text-sm">Or type the code from the email<input name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" minLength={6} maxLength={12} enterKeyHint="done" placeholder="123456" aria-describedby="code-help" className={`${inp} text-center text-xl tracking-[.35em] tabular-nums`} /></label>
      <p id="code-help" className="text-xs text-ink/60">On a phone, your keyboard offers the code from the email automatically.</p><SubmitButton className={`${ghost} w-full py-2`}>Confirm code</SubmitButton></form>
    <form action={resendVerification} className="mt-3 space-y-3"><label className="block text-sm">Email<input name="email" type="email" required defaultValue={email} className={inp} /></label>
      <SubmitButton className={`${ghost} w-full py-2`}>Send the link again</SubmitButton></form>
    <p className="mt-5 text-sm text-ink/70">Verified already? <Link href="/login" className="font-semibold text-brand underline">Sign in</Link></p></AuthCard>;
}
