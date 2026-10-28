import Script from "next/script";
/** Cloudflare Turnstile widget. Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; the token is verified server-side in actions.ts. */
export default function Turnstile() {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY; if (!key) return null;
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" /><div className="cf-turnstile" data-sitekey={key} /></>;
}
