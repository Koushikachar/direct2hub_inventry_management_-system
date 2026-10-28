# Direct2Hub
Setup: `npm i` → copy `.env.example` to `.env` → `npx prisma validate` → `npx prisma generate` → `npm run db:migrate` → `npm run dev`.
To create a platform admin: after registering, insert a Membership row with role PLATFORM_OPERATOR for your user (manual, audited).
Make yourself platform admin: `npx tsx scripts/make-operator.ts you@example.com` (after registering + onboarding).
Dev demo data: `SEED_EMAIL=you@example.com npm run db:seed` (refuses to run in production).
Built: auth pages, onboarding, products (+CSV export), inventory ledger, orders (confirm/dispatch/cancel), suppliers, PO creation, returns with inspection, analytics, settings, admin.
Not built: see the list at the bottom ("Added in this version").

Email verification (Supabase dashboard): Authentication → Providers → Email → turn "Confirm email" ON. Authentication → URL Configuration → Site URL = NEXT_PUBLIC_SITE_URL, and add `<site>/auth/callback` to Redirect URLs. Open the verification link in the same browser you registered in.

Admin panel: set PLATFORM_ADMIN_EMAILS="you@example.com" in .env (verified emails only), finish onboarding once with that account, then open /admin. (The older `scripts/make-operator.ts` also works.)

Abuse protection: login, register, password-reset, resend and invitations are rate-limited in memory (per server instance; use Redis/Upstash for hard limits on serverless). Set BOTH Turnstile keys in .env to turn on the Cloudflare check.

## Added in this version
**Subscription payments** (`/subscription`, admin: `/admin/subscriptions`). Owners buy Growth or Scale, monthly or yearly (prices: `src/lib/plans.ts`; GST via `BILLING_GST_PERCENT`). Four ways to pay; each shows only when its env values are set:
1. **Razorpay**: UPI, cards, netbanking, wallets. Uses hosted Payment Links, pays one period. Webhook: event `payment_link.paid`.
2. **Stripe**: card with automatic renewal (subscription mode). Webhook events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. **Direct UPI**: customer pays your UPI ID (deep link on phones), submits the UTR; you approve it in Admin → Subscriptions.
4. **Bank transfer**: same flow with your account details.
A plan lasts for the paid period, plus a 3-day grace. `/api/cron/billing` (daily via `vercel.json`, needs `CRON_SECRET`) sends renewal reminders 7 days ahead and moves lapsed accounts to Free. Plans set by hand in Admin never expire.

**From Zoho Inventory's feature set:**
- Credit notes (on any invoice), supplier bills and vendor payments (menu: *Supplier bills*), printable delivery challan.
- Reports (`/reports`): inventory valuation, receivables and payables aging, sales by customer, GST summary, sales register CSV, and **reorder suggestions** from real sales speed.
- **Multiple warehouses and stock transfers** (`/warehouses`). Locations are limited per plan (Free 1, Growth 3, Scale 10). Orders, receipts and returns work on the *default* warehouse; transfer stock there before selling it. Each transfer writes TRANSFER_OUT / TRANSFER_IN ledger rows.
- **Price lists**: a percentage per customer group (e.g. Wholesale -10%), applied when an order is created.
- **Shipping and tracking**: carrier and tracking number on each order, optional email to the customer, shown on the challan.
- **Payment reminders**: email a customer from the invoice page.
- Public **/pricing** page, linked from the home page.

Menu naming: *Supplier bills* is money you owe suppliers; *My plan* is what you pay Direct2Hub.

**Kits, variants, batches, serials, online payments, e-way bills** (latest):
- **Item groups (variants)**: *Products → Add variants* turns "T-shirt" + sizes + colours into one real product per combination (TEE-M-RED …), each with its own stock.
- **Kits (bundles)** (`/kits`): sold as one line with its own price and GST; reserving, dispatching and cancelling work on the parts. Kit parts are fixed once created (archive and recreate to change). Returns and adjustments are done on the parts.
- **Batch and expiry tracking**: set *Tracking = By batch* on a product. Receiving asks for a batch number and expiry; dispatch takes from the earliest-expiring non-expired batch; `/traceability` lists batches, flags expiring/expired stock, and shows which orders a batch went to (recalls). A daily job (`/api/cron/expiry`) notifies about batches expiring within 30 days. Transfers move batch records with the stock.
- **Serial numbers**: set *Tracking = By serial number*. Receiving needs one serial per unit; before dispatch you assign serials on the order; serial lookup shows where each unit went. Batch and serial details print on the delivery challan.
- **Customers pay invoices online**: each business connects its **own** Razorpay account in Settings (keys verified, encrypted with `APP_ENC_KEY`, never shown again). Invoices get a payment link you can email; payments are recorded automatically via the webhook shown in Settings, or with "Check payment status".
- **E-way bill**: invoice page → *Prepare e-way bill file* builds the JSON for the GST portal's bulk upload (no portal login or API needed here); store the returned number on the invoice. Tracking links can be saved on each order.

Limits of the tracking features (by design): stock adjustments and counts change totals but not batch records, so the Traceability page shows "stock not yet in a batch" for you to assign; stock that was never put in a batch still ships (lenient). Expired stock isn't blocked from shipping if it was never assigned to a batch, so write expired units off with an adjustment. Serial-tracked products can't be kit parts.

## Stock visibility and low-stock alerts
- **New order form:** every product in the list shows how many are available (sellable minus reserved, in the warehouse orders are filled from). Under each line you see straight away if the quantity is more than you have (and how much sits in other warehouses), or would leave you at or under your reorder level. Kits show how many can be sold from their parts.
- **New purchase order form:** choosing a product shows available, on hand, already on order and the reorder level, suggests a quantity (tops up to twice the reorder level, counting what is already on order), and pre-fills the last unit cost.
- **Low-stock alerts:** after any stock change (orders, goods received, adjustments, counts, returns, transfers, product edits) a product at or below its reorder level gets one in-app alert (the bell), and the owners and inventory managers get one email listing everything newly low. At zero it says "Out of stock", even if no reorder level is set. When stock is healthy again the alert clears itself, so the next drop alerts again. Email needs `GMAIL_USER` / `GMAIL_APP_PASSWORD` (see `.env.example`); in-app alerts always work. Owners can switch the emails off or add one more address in Settings.

## SEO and site checklist
| # | Item | Where / how |
|---|---|---|
| 1 | Server-side rendering | Every public page (home, pricing, contact, legal, sign-in) is a server component, so crawlers get full HTML. Only the cookie notice and analytics loader run in the browser. |
| 2 | robots.txt | `src/app/robots.ts`: public pages open; signed-in areas, APIs and one-time links blocked. |
| 3 | sitemap.xml | `src/app/sitemap.ts`: public pages only, with real last-modified dates. |
| 4-5 | Unique titles and descriptions | `pageMeta()` in `src/lib/seo.ts` on every public page. Signed-in pages are `noindex`. |
| 6 | One H1 per page | Each page gets exactly one H1 from its shared layout component (Legal, AuthCard, Shell, or the page itself). |
| 7 | Canonical tags | Set per page by `pageMeta()` (resolved against `NEXT_PUBLIC_SITE_URL`). |
| 8 | Open Graph images | Home, pricing and contact each have their own 1200x630 card (`opengraph-image.tsx`). |
| 9 | Custom 404 | `src/app/not-found.tsx`. |
| 10 | 301 redirects | `next.config.js`: old/guessable URLs (/signup, /plans, /privacy-policy ...) and www <-> non-www, all `statusCode: 301`. |
| 11-13 | Alt text, WebP, lazy loading | `public/images/*.webp` shown with `next/image`: descriptive `alt`, WebP output, `loading="lazy"` below the fold. |
| 14 | Organization schema | Organization + WebSite JSON-LD on the home page (real company details only; no placeholders). Pricing has SoftwareApplication offers. |
| 15 | Breadcrumbs | Visible trail plus BreadcrumbList JSON-LD on pricing, contact, privacy and terms. |
| 16 | Internal links | Header and footer link Home, Pricing, Contact, Privacy, Terms, Sign in; sections cross-link. |
| 17 | Google Analytics | Set `NEXT_PUBLIC_GA_ID`. Visitors are asked on every visit; GA4 loads only after "Allow", only on public pages, with IP anonymization and cookies off (`client_storage: none`). Nothing is stored in the browser (no cookies, localStorage or sessionStorage): the answer lives in page memory and is asked again on the next visit. "Analytics choice" in the footer reopens it. |
| 18 | Search Console | Set `NEXT_PUBLIC_GSC_VERIFICATION` to the token from Search Console's "HTML tag" method, deploy, click Verify, then submit `https://your-site/sitemap.xml`. |
| 19 | Privacy policy | `/privacy` (updated for analytics, the contact form and payment providers). Have a lawyer review it before launch. |
| 20 | Contact form | `/contact`: honeypot, rate limit, Cloudflare Turnstile when configured. Messages are saved first (read them in Admin -> Messages) and emailed to `CONTACT_TO` when email is configured. |

## Interface polish
- **Command menu:** Ctrl/⌘+K or `/` (or the search button on phones). Jump to any page, start something new, or find a product, customer, order or invoice. `g` then a letter goes straight to a page (`g o` Orders, `g i` Inventory, `g p` Products, `g v` Invoices, `g c` Customers, `g d` Dashboard, `g s` Settings). Hints appear in the menu and when you hover the sidebar. Shortcuts never fire while you type in a field.
- **Instant feedback:** every submit button shows a spinner and can't be pressed twice; webhook and automation switches flip the moment you tap them (and flip back if the server refuses); archiving a product shows an **Undo** toast instead of a confirmation dialog.
- **Double-submit safe:** new orders, customers, purchase orders, supplier bills and credit notes carry a one-time key, so a double-click or retry can't create a duplicate (payments and stock changes already did). Keys are cleaned up by the daily job.
- **Phones:** *More* and *Quick actions* are bottom sheets you can drag down to dismiss; Back closes an open sheet or menu instead of leaving the page; tap targets get an invisible larger hit area on touch screens; content stays clear of notches and the home bar; the verify page's code box offers the emailed code from the keyboard (`one-time-code`).
- **Desktop:** the sidebar *Create* menu stays open while the pointer travels diagonally toward it (the "safe triangle"), so it no longer snaps shut when you cross another item.
- **Motion:** pages cross-fade (browser View Transitions, where supported). Sheets, menus and toasts use reversible CSS transitions, so grabbing or dismissing one halfway never jumps. Everything respects "reduce motion".
- **Type and shape:** tabular numbers in tables and totals, balanced headlines, squircle corners in browsers that support `corner-shape` (Chrome 139+; others keep normal rounded corners).
- **Speed:** home, terms and privacy are pre-rendered; icons and the app manifest are served from cache while refreshing in the background; command-menu results are remembered per search and refreshed behind the scenes; the router keeps recently visited pages for 30 s (5 min for static ones). Every app screen already had a skeleton loader.
- **Not applicable here:** BlurHash placeholders (the app shows no photos) and native "predictive back" (replaced by the web back-closes-sheet behaviour above). The pricing and login pages read the URL, so they stay server-rendered.
- **Sign-up code (optional):** to let people type a code instead of clicking the link, add `{{ .Token }}` to Supabase > Authentication > Emails > Templates > *Confirm signup* (for example "Your code: {{ .Token }}").


## Email (SMTP)
All app emails (contact form, invitations, invoice reminders, low-stock alerts, shipping notices, billing reminders, automation rules) go out over SMTP with `nodemailer` (`src/lib/mail.ts`). Pick **one** of two setups in `.env`:
1. **Any SMTP provider** (Brevo, Amazon SES, Mailgun, Zoho, Postmark, your own server): `SMTP_HOST`, `SMTP_PORT` (`587` = STARTTLS, the default; `465` = SSL), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM="Direct2Hub <no-reply@yourdomain.com>"`, optional `SMTP_SECURE=true|false`. On port 587 the connection must upgrade to TLS and never falls back to plain text. Use a real domain with SPF/DKIM set up at the provider, or mail lands in spam.
2. **Gmail**: turn on 2-Step Verification, create an **App Password** (Google Account > Security), then set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (spaces are fine) and optionally `MAIL_FROM`. Gmail sends about 500 emails a day on a free account (2,000 on Workspace).
If both are set, `SMTP_*` wins. Passwords are never logged, shown or returned in error messages. As a platform operator, open `/api/health` while signed in to see whether the SMTP login works ("email (SMTP login)").
**Sign-up verification and password-reset emails are sent by Supabase, not by this app.** Put the same SMTP details in Supabase: Authentication > Emails > SMTP Settings > Enable custom SMTP. Without that, Supabase's built-in sender only allows a few emails an hour.

## Two-step sign-in (authenticator app)
Every user can turn on a 6-digit code at **Settings > Two-step sign-in** (`/security`). It uses Supabase Auth's TOTP multi-factor (on by default in Supabase; check Authentication > Sign In / Providers). After the password, accounts with it on are sent to `/mfa`; until the code is accepted the session is treated as **signed out everywhere** (pages, actions, uploads, exports). Wrong codes are rate limited (5 per 15 minutes per account) and recorded in the audit log (`mfa.failed`, `mfa.enabled`, `mfa.disabled`).
**Platform operators must use it**: the admin panel stays locked until the operator has signed in with a code. Set `ADMIN_REQUIRE_MFA=0` only for the first minutes while you set it up, then remove the line.

## Security
See `SECURITY_AUDIT.md` for the findings, what was fixed in code, and what only you can verify (Supabase RLS lock-down, Auth settings, rotating keys, a two-account isolation test). `npm test` includes `tests/security.test.ts`, which fails if a new API route lacks an authentication check, an admin page lacks `adminGuard()`, a secret appears in client code, or `.env` stops being ignored. CI (`.github/workflows/ci.yml`) also runs typecheck, tests, `npm audit` and a Git-history secret scan.

## Payments: Razorpay checkout, AutoPay and clear error messages
- **Razorpay checkout (one period)** and **Razorpay AutoPay (auto-renewal)** open Razorpay's payment window on *My plan > Pay*. The plan switches on only after the server verifies Razorpay's signature (or the webhook confirms it). Hosted-link payments started earlier still complete.
- Failed attempts are explained in plain language with a next step, never a bare error: *"This card is not eligible for recurring payments"* (offers to pay one period instead, another card, UPI or bank transfer), *"Amount exceeds maximum amount allowed"* (try netbanking or a credit card, pay monthly, bank transfer, or ask the bank to raise the limit), *"Payment could not be completed"* (retry or another method), plus declined / insufficient balance / expired card / wrong CVV / OTP / UPI / timeout. See `src/lib/payerrors.ts`.
- Webhook: Razorpay dashboard > Webhooks > `https://YOUR-SITE/api/billing/razorpay/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured`, `order.paid`, `payment.failed`, `payment_link.paid`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`, `subscription.completed`. AutoPay must be enabled on your Razorpay account (Subscriptions product).

## Added from the other version of this project
**Webhooks** (`/webhooks`): signed HTTPS calls to your own system for order created / confirmed / dispatched / cancelled, invoice created, payment received, stock low, goods received; private networks blocked; 5 retries. **Automation rules** (`/automations`): "when X happens and a condition is true, notify me or email someone". **Public API** (`/api/v1/orders`, `/api/v1/stock`) with hashed API keys, 60 requests/minute (`/integrations`). **Shopify** order import and **custom courier tracking links** (`/integrations`; needs `APP_ENC_KEY`). **Packing slip** and **Mark as delivered** on each order. **Install as an app** (PWA manifest). **One daily job** `/api/cron/daily` (billing reminders, batch-expiry notices, Shopify imports, webhook retries; `vercel.json` runs it at 03:30 UTC; needs `CRON_SECRET`).
**Also included:**
- **Backorders** (Settings, off by default). With it on, an order that can't be fully reserved is still confirmed. It is marked "waiting for stock", holds no stock, and can't be dispatched. When goods arrive (or assembly produces units) waiting orders are filled oldest first. It is all-or-nothing per order on purpose: an order never holds half its stock, so cancelling, kits, batches and serial numbers behave exactly as before. "Check stock again" is on the order page.
- **Assembly** (`/assembly`): a finished product made from other products, with its own stock. Assembling takes the parts and adds finished units in one transaction, using only available (unreserved) part stock, and is safe to resubmit. Only plain products work (no kits, no batch/serial tracking, one level deep). This is different from **Kits**, which have no stock of their own.
- **Units of measure** on every product (pcs, kg, litre and so on, shown on the inventory list, challan and packing slip) and **bin / shelf locations** per product and warehouse (inventory page; printed on the packing slip as the pick location).
- **Multi-currency** (Settings > Exchange rates, plus a currency on each customer): invoices also show the total in the customer's currency at the rate frozen when the invoice was created. GST, HSN lines and the amount due stay in rupees, so tax records are never affected. A currency with no rate is invoiced in rupees.
Item groups are covered by the existing *Add variants*.

## After pulling this version
`npm i`, then `npx prisma migrate dev --name merged_features` (the contact form, subscriptions, kits, batches and idempotency keys add tables), then `npm test`. Run `supabase/rls-lockdown.sql` once in the Supabase SQL editor (see `SECURITY_AUDIT.md`, F1).
The database tests in `tests/inventory.test.ts` and `tests/backorders-assembly.test.ts` run only when `TEST_DATABASE_URL` points at a throwaway Postgres; run them once before going live.

**Still not built:** per-order warehouse choice and picklists, live courier API tracking (carrier accounts needed), direct GST-portal e-way bill generation (GSP account needed), marketplace integrations other than Shopify, product images, customer/vendor portals.

## AI assistant, product descriptions and product pictures (free tools)
**Setup (all free, no card):** copy the new lines from `.env.example`, then run `npx prisma migrate dev -n product_description_image` (adds `description`, `imageUrl`, `imageId` to Product).
- **AI** – free keys from `GROQ_API_KEY` (console.groq.com), `GEMINI_API_KEY` (aistudio.google.com) and/or `OPENROUTER_API_KEY`. No SDK: any OpenAI-compatible endpoint works (`AI_API_KEY` + `AI_BASE_URL` + `AI_MODEL` for Ollama etc.).
  - **Use them together (default):** set two or more keys and leave `AI_PROVIDER` empty. If one is out of free quota (429), rejects its key or is down, the next one answers the same question. The one that failed is skipped for a while (until its quota resets, up to 15 min), so the next questions are not slowed down. `AI_ORDER="gemini,groq"` changes who goes first.
  - **Use one on its own:** set `AI_PROVIDER="groq"` (or `gemini`, `openrouter`). Only that provider is used, with no switching, even if other keys are set.
  - Models: `GROQ_MODEL`, `GEMINI_MODEL`, `OPENROUTER_MODEL`.
- **Pictures** – Cloudinary free plan (about 25 GB of storage/bandwidth credits). Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Photos are shrunk to a WebP in the browser before upload and served resized, in AVIF/WebP, through Cloudinary's CDN; nothing is stored in your database or server. Without these keys the picture field is hidden.

**Where it is**
- **Assistant** (sidebar, and *More* on phones, `/assistant`): ask about products, stock, low stock, orders, customers, suppliers, sales and unpaid invoices. It answers only from your own organization's data through read-only lookups (unpaid invoices only for Owner, Accountant and Analyst) and cannot change anything. 20 questions a minute per business. The chat is never saved in the browser.
- **Products → Add product / product page**: *Description* box with **✨ Write with AI** (English, हिन्दी, ಕನ್ನಡ). Type a few facts first and the AI builds on them; it is told not to invent specs. *Picture (optional)* is saved with the form on Add product and instantly on the product page. Only Owner and Inventory manager can change pictures (JPG, PNG, WebP, up to 4 MB, real file type checked on the server).
- **API** (same keys as the rest of `/api/v1`, 60 requests a minute):
  - `GET /api/v1/products?q=cap&cursor=` → sku, name, description, price, `imageUrl`, `thumbnailUrl` (100 per page, `nextCursor`).
  - `POST /api/v1/ai/describe` `{"name":"Cotton cap","notes":"adjustable, navy","language":"en"}` → `{"description":"..."}`.
  - `POST /api/v1/ai/ask` `{"question":"Which products are low on stock?"}` → `{"answer":"..."}` (products, stock, orders, customers, suppliers; no money-owed data).

## Chat bubble and Product intelligence
- **Chat bubble, bottom right.** On the **home and pricing pages** it is the website assistant: visitors and customers ask about features, pricing and getting started. It needs no account, sees no private data, and only knows the facts in `src/lib/kb.ts` (built from the real plan table, so prices can't drift). Limits: 8 messages a minute and 40 an hour per visitor, 400 an hour overall, so the free AI quota can't be drained. **After sign-in** the same bubble opens the business assistant (your own data, read-only). Both appear only when an AI key is set, and nothing is stored in the browser.
- **Product intelligence** (`/intelligence`, sidebar and *More*): pick a product to see sold in 30/90 days, days of stock left, margin, a suggested reorder quantity and plain-language findings (computed from your orders and stock, not by the AI), plus AI tools: **write the listing** (title, description, selling points, search tags, SEO title and meta description, in English/हिन्दी/ಕನ್ನಡ, with *Save description to product*), **explain the numbers**, and **ask about this product**. The start page lists what is running out soon and what has not sold in 90 days. Order staff do not see cost or margin.
