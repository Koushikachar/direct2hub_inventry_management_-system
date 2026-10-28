import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import { requestReset } from "../actions"; import AuthCard from "@/components/AuthCard";
import Turnstile from "@/components/Turnstile"; import { Err, inp, btn } from "@/components/ui";
export const metadata = { title: "Reset your password", description: "Request a link to reset your Direct2Hub password.", robots: { index: false, follow: false } };
export default async function Forgot({ searchParams }: { searchParams: Promise<{ e?: string; sent?: string }> }) {
  const { e, sent } = await searchParams;
  return <AuthCard title="Reset your password" sub="Enter your email and we'll send a reset link."><Err e={e} />
    {sent && <p role="status" className="glass mb-3 px-4 py-2 text-sm text-brand">If that email has an account, a reset link is on its way. Open it in this browser.</p>}
    <form action={requestReset} className="space-y-3"><label className="block text-sm">Email<input name="email" type="email" required className={inp} autoComplete="email" /></label><Turnstile /><SubmitButton className={`${btn} w-full`}>Send reset link</SubmitButton></form>
    <p className="mt-5 text-sm"><Link href="/login" className="font-semibold text-brand underline">Back to sign in</Link></p></AuthCard>;
}
