import { notFound, redirect } from "next/navigation";
import { getUser, isOperator } from "./auth";
/** Platform operators must use a second factor (set ADMIN_REQUIRE_MFA=0 only while setting it up). */
export const adminMfaRequired = () => process.env.ADMIN_REQUIRE_MFA !== "0";
/** Every admin page and action starts here. Non-operators get a 404 so the panel's existence isn't revealed. */
export async function adminGuard() {
  const u = await getUser(); if (!u) redirect("/login");
  if (!(await isOperator(u))) notFound();
  if (adminMfaRequired() && !u.aal2) redirect("/security?e=" + encodeURIComponent("Turn on two-step sign-in to use the admin panel."));
  return u;
}
