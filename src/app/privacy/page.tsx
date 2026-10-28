import Legal, { H } from "@/components/Legal"; import { LEGAL } from "@/lib/legal"; import { pageMeta } from "@/lib/seo";
export const dynamic = "force-static"; // built once ahead of time and served from the edge: instant first paint
export const metadata = pageMeta({ title: "Privacy policy", description: "How Direct2Hub collects, uses and protects your data: what we keep, who helps us run the service, which cookies we use and the choices you have.", path: "/privacy" });
const ul = "list-disc space-y-1 pl-5";
export default function Privacy() {
  return <Legal title="Privacy policy" path="/privacy">
    <p>This policy explains what personal data Direct2Hub handles, why, who helps us handle it, and the choices you have.</p>
    <H>1. Data we collect</H>
    <ul className={ul}><li><b>Account data:</b> your name, email address and whether your email is verified. Your password is handled by our sign-in provider (Supabase) and is stored only as a hash. We never see or store it in readable form.</li>
      <li><b>Business data you enter:</b> products, stock levels and movements, orders, customer details (name, contact, GSTIN, address), invoices and payments received, suppliers, purchase orders, returns, payment status, and team members with their roles.</li>
      <li><b>Invitations:</b> the email address and role of people you invite, plus a one-way hash of the invitation link.</li>
      <li><b>Contact messages:</b> if you use our contact form we keep your name, email, optional phone number and message so we can reply.</li>
      <li><b>Subscription records:</b> your plan, billing period and payment receipts (amount, method and reference, never full card or UPI credentials).</li>
      <li><b>Security and audit records:</b> who performed sensitive actions (for example changing a role or suspending an organization) and when.</li>
      <li><b>Technical data:</b> IP address, browser type and request times in our hosting logs. If rate limiting is switched on, a temporary counter keyed to your IP address and email is kept for about 15 minutes to stop password-guessing.</li></ul>
    <H>2. Why we use it</H>
    <p>To run your account and organization, keep stock and order records accurate, send verification, reset and invitation emails, protect the service from abuse, and respond to support requests. We do not sell personal data and we do not use it for advertising.</p>
    <H id="cookies">3. Cookies and browser storage</H>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-ink/20"><th className="py-2 pr-3">Name</th><th className="pr-3">Purpose</th><th className="pr-3">Type</th><th>Lasts</th></tr></thead><tbody>
      {[["sb-…-auth-token","Keeps you signed in (HttpOnly, not readable by page scripts)","Essential","Until you sign out or it expires"], ["org","Remembers which organization you are working in","Essential","This browser session"]].map((r) =>
        <tr key={r[0]} className="border-b border-ink/10 align-top"><td className="py-2 pr-3 font-medium">{r[0]}</td><td className="pr-3">{r[1]}</td><td className="pr-3">{r[2]}</td><td>{r[3]}</td></tr>)}</tbody></table></div>
    <p>We use no advertising cookies, and we do not store anything else in your browser: no analytics cookies, no localStorage, no sessionStorage and no IndexedDB. Where analytics is switched on, Google Analytics runs only on our public pages (home, pricing, contact, sign-in and sign-up), only after you press Allow, with IP anonymization and with cookie storage turned off. Your answer is held only in the open page, so we ask again on your next visit. We do not use localStorage or sessionStorage to hold your sign-in or personal data. If the bot-protection check (Cloudflare Turnstile) is enabled on sign-in forms, Cloudflare may store limited data in your browser to run that check; see Cloudflare's own policy.</p>
    <H>4. Who processes data for us</H>
    <ul className={ul}><li><b>Vercel:</b> hosting and server logs.</li><li><b>Supabase:</b> database and sign-in.</li><li><b>Google (Gmail):</b> sending invitation, invoice, alert and notification emails.</li><li><b>Cloudflare Turnstile:</b> bot protection on sign-in and contact forms, when enabled.</li><li><b>Google Analytics:</b> anonymized visit statistics for our public pages, only if you press Allow. It is configured not to set cookies.</li><li><b>Razorpay and Stripe:</b> to take payment for plans, and (if you connect your own Razorpay account) to let your customers pay your invoices. Card and UPI details go to them, not to us. Keys you enter for your own Razorpay account are stored encrypted and used only to create and check payment links.</li><li><b>Upstash:</b> short-lived rate-limit counters, when enabled.</li><li><b>Have I Been Pwned:</b> when you choose a password we send only the first five characters of its hash, never the password, to check it against known breaches.</li></ul>
    <p>These providers may process data in countries outside India. [Confirm your providers' regions and update this list to match your final setup.]</p>
    <H>5. How long we keep data</H>
    <p>Business data is kept while your organization is active. Unused invitations expire after 7 days. Audit records are kept to protect the service. You can ask us to delete your data (see section 7); backups roll off on the provider's schedule. [State your actual backup retention period.]</p>
    <H>6. Security</H>
    <p>Data is isolated by organization and limited by role, traffic is encrypted with HTTPS, sign-in is rate-limited, passwords must be at least 12 characters and are checked against known breaches, and sensitive actions are logged. No system is perfectly secure, so please use a strong, unique password and tell us if you suspect misuse.</p>
    <H>7. Your choices and rights</H>
    <p>You can ask us to access, correct or delete your personal data, or to withdraw consent where we rely on it, by emailing {LEGAL.email}. Organization owners can remove team members and sample data in Settings. You may also have rights under applicable Indian law, including the Digital Personal Data Protection Act, 2023; a lawyer should confirm how it applies to you. [Name your grievance officer and response time here.]</p>
    <H>8. Children</H>
    <p>Direct2Hub is for businesses and is not intended for anyone under 18.</p>
    <H>9. Changes</H>
    <p>If we change this policy in a meaningful way we will update the date above and, where appropriate, tell you by email.</p>
  </Legal>;
}
