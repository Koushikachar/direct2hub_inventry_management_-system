import SubmitButton from "@/components/SubmitButton";
import { redirect } from "next/navigation";
import { setPassword } from "../actions"; import { sbServer } from "@/lib/supabase"; import AuthCard from "@/components/AuthCard"; import { Err, inp, btn } from "@/components/ui";
export const metadata = { title: "Choose a new password", description: "Set a new password for your Direct2Hub account.", robots: { index: false, follow: false } };
export default async function Reset({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  if (!(await (await sbServer()).auth.getUser()).data.user) redirect("/forgot?e=" + encodeURIComponent("Your reset link has expired. Request a new one"));
  return <AuthCard title="Choose a new password"><Err e={e} />
    <form action={setPassword} className="space-y-3">
      <label className="block text-sm">New password<input name="password" type="password" minLength={12} required className={inp} autoComplete="new-password" /></label>
      <label className="block text-sm">Confirm password<input name="confirm" type="password" minLength={12} required className={inp} autoComplete="new-password" /></label>
      <SubmitButton className={`${btn} w-full`}>Update password</SubmitButton></form></AuthCard>;
}
