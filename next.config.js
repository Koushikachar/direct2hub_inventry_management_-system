// Google Analytics hosts are allowed in the CSP only when a (valid) measurement ID is configured.
const ga = /^G-[A-Z0-9]{4,14}$/.test(process.env.NEXT_PUBLIC_GA_ID || "");
const csp = ["default-src 'self'", `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://checkout.razorpay.com${ga ? " https://www.googletagmanager.com" : ""}`, "style-src 'self' 'unsafe-inline'", `img-src 'self' data: blob: https://res.cloudinary.com https://*.razorpay.com${ga ? " https://*.google-analytics.com https://*.googletagmanager.com" : ""}`, "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com https://*.razorpay.com${ga ? " https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com" : ""}`, "frame-src https://challenges.cloudflare.com https://api.razorpay.com https://checkout.razorpay.com", "frame-ancestors 'none'", "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://rzp.io https://*.razorpay.com", "object-src 'none'"].join("; ");

// Permanent (301) redirects for old or guessable URLs, so links and search rankings carry over to the real page.
const moved = [["/home", "/"], ["/index", "/"], ["/signup", "/register"], ["/sign-up", "/register"], ["/get-started", "/register"], ["/signin", "/login"], ["/sign-in", "/login"], ["/price", "/pricing"], ["/plans", "/pricing"], ["/plan", "/pricing"],
  ["/contact-us", "/contact"], ["/support", "/contact"], ["/privacy-policy", "/privacy"], ["/terms-of-service", "/terms"], ["/terms-and-conditions", "/terms"], ["/app", "/dashboard"]];
// One canonical host: if NEXT_PUBLIC_SITE_URL is https://example.com, www.example.com redirects to it (and the other way round for a www site).
const hostRedirects = () => {
  try { const h = new URL(process.env.NEXT_PUBLIC_SITE_URL || "").hostname; if (!h || h === "localhost" || /^[\d.]+$/.test(h)) return [];
    const other = h.startsWith("www.") ? h.slice(4) : `www.${h}`; return [{ source: "/:path*", has: [{ type: "host", value: other }], destination: `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/:path*`, statusCode: 301 }]; } catch { return []; }
};
module.exports = { poweredByHeader: false, serverExternalPackages: ["nodemailer"], experimental: { serverActions: { bodySizeLimit: "5mb" }, staleTimes: { dynamic: 30, static: 300 }, optimizePackageImports: ["recharts"] },
  images: { formats: ["image/webp"], minimumCacheTTL: 60 * 60 * 24 * 30 },
  async redirects() { return [...hostRedirects(), ...moved.map(([source, destination]) => ({ source, destination, statusCode: 301 }))]; },
  async headers() { return [{ source: "/:path*", headers: [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "X-Frame-Options", value: "DENY" }, { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }] : [])] },
    // Stale-while-revalidate: icons and the app manifest are served instantly from cache while a fresh copy is fetched in the background
    { source: "/pwa-icon/:size", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=604800" }] },
    { source: "/manifest.webmanifest", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
    { source: "/icon", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] }]; } };
