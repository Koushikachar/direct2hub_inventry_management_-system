import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthCard from "@/components/AuthCard";
import SubmitButton from "@/components/SubmitButton";
import { Err, inp, btn } from "@/components/ui";
import { getUser, mfaPending } from "@/lib/auth";
import { signOut } from "../actions";
import { submitMfa } from "../mfa-actions";
export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Mfa({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  if (!(await mfaPending())) redirect((await getUser()) ? "/dashboard" : "/login");
  return <AuthCard title="Enter your code" sub="Open your authenticator app and type the 6-digit code for Direct2Hub."><Err e={e} />
    <form action={submitMfa} className="mt-3 space-y-3"><label className="block text-sm">6-digit code
      <input name="code" required autoFocus inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} autoComplete="one-time-code" className={`${inp} tracking-widest tabular-nums`} /></label>
      <SubmitButton className={`${btn} w-full`}>Verify and sign in</SubmitButton></form>
    <form action={signOut} className="mt-4"><button className="text-sm text-brand underline">Use a different account</button></form></AuthCard>;
}
