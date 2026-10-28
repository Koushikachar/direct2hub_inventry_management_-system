import { NextResponse } from "next/server";
import { sbServer } from "@/lib/supabase";
/** Supabase's verification email links here with ?code=. We swap it for a session, then send the user to set up their business. */
export async function GET(req: Request) {
  const u = new URL(req.url), code = u.searchParams.get("code"), nx = u.searchParams.get("next");
  const dest = nx && nx.startsWith("/") && !nx.startsWith("//") ? nx : "/onboarding"; // only same-site paths
  if (code && !(await (await sbServer()).auth.exchangeCodeForSession(code)).error) return NextResponse.redirect(new URL(dest, u.origin));
  return NextResponse.redirect(new URL("/login?e=" + encodeURIComponent("That verification link is invalid or expired. Sign in and we'll send a new one"), u.origin));
}
