import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getUser, isAdminEmail } from "./auth";
/** Active org = the "org" cookie if the user is a member, else their first active non-operator membership. Suspended orgs lock out everyone except platform operators. */
export const ctx = cache(async () => {
  const user = await getUser();
  if (!user) redirect("/login");
  const ms = user.memberships; // loaded with the user: no extra query
  if (!ms.length) redirect("/onboarding");
  const pick = (await cookies()).get("org")?.value, live = ms.filter((x) => !x.org.suspended);
  const m = ms.find((x) => x.orgId === pick) ?? live.find((x) => x.role !== "PLATFORM_OPERATOR") ?? live[0] ?? ms[0];
  const op = ms.some((x) => x.role === "PLATFORM_OPERATOR") || isAdminEmail(user.email);
  if (m.org.suspended && !op) redirect("/suspended");
  return { user, orgId: m.orgId, orgName: m.org.name, role: m.role, op, orgs: ms.map((x) => ({ id: x.orgId, name: x.org.name })) };
});
