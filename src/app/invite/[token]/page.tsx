import SubmitButton from "@/components/SubmitButton";
import { createHash } from "crypto"; import { redirect } from "next/navigation";
import { db } from "@/lib/db"; import { sbServer } from "@/lib/supabase"; import { btn } from "@/components/ui"; import { acceptInvite } from "../../actions";
export const metadata = { title: "Team invitation", description: "Join a team on Direct2Hub.", robots: { index: false, follow: false } };
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await (await sbServer()).auth.getUser()).data.user) redirect("/login?e=" + encodeURIComponent("Sign in or create an account with the invited email, then open the invitation link again"));
  const inv = await db.invitation.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") }, include: { org: true } });
  const ok = inv && !inv.usedAt && inv.expiresAt > new Date();
  return <main className="grid min-h-dvh place-items-center p-6"><div className="w-full max-w-sm glass p-8">
    {ok ? <form action={acceptInvite} className="space-y-4"><h1 className="text-lg font-semibold">Join {inv!.org.name}</h1><p className="text-sm text-ink/60">You'll join as {inv!.role.replace("_", " ").toLowerCase()}.</p>
      <input type="hidden" name="token" value={token} /><SubmitButton className={`${btn} w-full`}>Accept invitation</SubmitButton></form>
      : <p className="text-sm">This invitation is invalid or has expired. Ask the owner to send a new one.</p>}</div></main>;
}
