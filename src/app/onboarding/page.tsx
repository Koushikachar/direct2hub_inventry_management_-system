import SubmitButton from "@/components/SubmitButton";
import { createOrg } from "../actions";
import { Err, inp, btn } from "@/components/ui";
export const metadata = { title: "Set up your business", description: "Create your organization in Direct2Hub.", robots: { index: false, follow: false } };
export default async function Onboarding({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return <main className="grid min-h-dvh place-items-center p-6"><form action={createOrg} className="w-full max-w-sm space-y-3 glass p-8">
    <h1 className="text-lg font-semibold">Set up your business</h1><p className="text-sm text-ink/60">We'll create your organization and a Main warehouse. You can add more later.</p>
    <Err e={e} /><label className="block text-sm">Business name<input name="name" required minLength={2} className={inp} /></label><SubmitButton className={`${btn} w-full`}>Create organization</SubmitButton></form></main>;
}
