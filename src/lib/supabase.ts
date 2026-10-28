import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
type CookieToSet = { name: string; value: string; options?: any };
export async function sbServer() {
  const s = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: {
    getAll: () => s.getAll(),
    setAll: (l: CookieToSet[]) => { try { l.forEach(({ name, value, options }) => s.set(name, value, { ...options, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" })); } catch {} } } });
}
