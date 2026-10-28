# SECURITY AUDIT SUMMARY — Direct2Hub (merged build, static review before production)

**Critical: 0 confirmed, 1 potential pending your manual check (F1).**
**High: 1 (F2, fixed in code).**
**Medium: 4 (F4 fixed in code; F3, F5, F6 need you).**
**Low: 8 (F9, F10, F11 and F14 fixed in code; F7, F8, F12, F13 need you).**

**What I did:** read all 19 API routes, every Supabase/auth/mail/rate-limit/crypto/webhook/SSRF module, the admin actions, the role-management actions, the middleware and next.config headers, `.gitignore`/`.env.example`, the RLS script and the lockfile; grepped all server actions (~900 lines) and every page for queries by `id` without `orgId`, for `NEXT_PUBLIC_*`, raw SQL, `dangerouslySetInnerHTML`, browser storage and direct session reads.
**What I could NOT do:** open your live Supabase project, Vercel config or running site; read Git history (the zips contain no `.git`); run `npm install`, `npm audit`, the TypeScript compiler or Vitest (this sandbox has no network). I syntax-checked every file I changed, ran the new static security tests through a small harness (20/20 pass) and the SMTP module against a stub. "Fixed" below means *changed in this zip*, not *verified against your real database and Supabase*. This audit does not mean the application is "secure".

## Findings

**F1 — Supabase Data API may expose every table (NEEDS MANUAL VERIFICATION)** — Severity: High, potentially Critical
- Location: `prisma/schema.prisma`, `supabase/rls-lockdown.sql`. Evidence: the schema creates ~45 tables in `public`, including `PaymentGateway` (customers' encrypted Razorpay keys), `SubscriptionPayment`, `User`, `ApiKey`. Supabase serves `public` over REST and `NEXT_PUBLIC_SUPABASE_ANON_KEY` is in every browser bundle by design. The script in the repo enables RLS on every table and revokes `anon`/`authenticated` (it loops over all tables, so the new ones are covered), but nothing proves you ran it.
- Why/abuse: if it was not run, anyone can read or write any tenant's data with the public key, bypassing every check in this app.
- Fix: run `supabase/rls-lockdown.sql` once, and again after adding tables in future (new tables get no grants by default, but RLS stays off until re-run).
- Verification: `curl "https://<project>.supabase.co/rest/v1/Product?select=*" -H "apikey: <anon>" -H "Authorization: Bearer <anon>"` must return `[]` or "permission denied". Repeat for `User`, `PaymentGateway`, `SubscriptionPayment`.

**F2 — `createOrg` and `acceptInvite` read the raw Supabase session, skipping the verified-email and two-step checks** — Severity: High (fixed in code)
- Location: `src/app/actions.ts`. Evidence: both called `sbServer().auth.getUser()` directly. Every other path uses `getUser()` in `src/lib/auth.ts`, which treats unverified emails as signed out.
- Why/abuse: with Supabase "Confirm email" OFF (a dashboard switch, F3), an attacker signs up with an address your owner has invited (they can guess or learn it), never verifies it, and accepts the invitation: the invitation check only compared the unverified email. They join the victim organization with the invited role. Separately, an account with a 6-digit code could be used for these two actions with the password alone.
- Fix: both now call `getUser()`; `tests/security.test.ts` fails if either goes back to the raw session. The `org` cookie also gets `Secure` in production.
- Verification: with "Confirm email" off, sign up with an invited address and try `/invite/<token>`; it must send you to sign in, not join.

**F3 — Supabase Auth can be called directly, bypassing the app's rules (NEEDS MANUAL, Supabase dashboard)** — Severity: Medium
- Evidence: sign-up and sign-in use the public anon key, so Turnstile, the app's rate limit and the 12-character/breach password rule (server actions) can be skipped by calling `/auth/v1/signup` yourself.
- Fix in Supabase > Authentication: "Confirm email" ON; minimum password length 12; leaked-password protection (Pro plan); CAPTCHA (Turnstile); review rate limits; TOTP multi-factor enabled; custom SMTP (see README).
- Verification: `curl -X POST https://<project>.supabase.co/auth/v1/signup -H "apikey: <anon>" -H "Content-Type: application/json" -d '{"email":"t@example.com","password":"Password12345!"}'` must be rejected; an unconfirmed account must not reach `/dashboard`.

**F4 — No second factor for sign-in** — Severity: Medium (fixed in code, needs Supabase TOTP enabled)
- Evidence: password-only sign-in; the platform-admin role is granted by email (`PLATFORM_ADMIN_EMAILS`), so one stolen password meant full access to every tenant.
- Fix: `/security` (authenticator app via Supabase MFA). `middleware.ts` checks the assurance level; an account with a verified factor but no code is **signed out everywhere** (`getUser()` returns null; `/login` sends it to `/mfa`). The admin panel requires a code unless `ADMIN_REQUIRE_MFA=0`. Code attempts: 5 per 15 minutes per account, 20 per IP; failures are audit-logged. The check fails closed if the assurance lookup errors.
- Not yet verified: I could not run it against Supabase. Test below.
- Verification: enable it on a test account, sign out, sign in: you must land on `/mfa`; opening `/dashboard` or POSTing any action in another tab must not work until the code is accepted; as an operator without a factor, `/admin` must redirect to `/security`.

**F5 — Dependency lockfile is out of sync and advisories are unchecked (NEEDS MANUAL)** — Severity: Medium
- Evidence: `package.json` lists `nodemailer` and `@types/nodemailer`; `package-lock.json` has neither (`npm ci` will fail, and a plain `npm i` will pick versions nobody reviewed). Locked: next 15.5.28, prisma 6.19.3, @supabase/supabase-js 2.117.3. I could not run `npm audit` offline; the previous audit of an older build reported advisories in `next`'s bundled PostCSS and in `prisma`.
- Fix: `npm i`, commit the new `package-lock.json`, run `npm audit --omit=dev` and `npm outdated`; upgrade `next`/`prisma` in a branch, then `npm run build && npm test`. Never `npm audit fix --force` blindly. CI now runs `npm ci`, typecheck, tests, `npm audit --omit=dev --audit-level=high` and a secret scan; `dependabot.yml` opens weekly update PRs.
- Verification: CI green on a fresh clone.

**F6 — Cross-tenant isolation is a code reading, not a test (NEEDS MANUAL)** — Severity: Medium
- Evidence (what I found): every tenant read/write takes `orgId` from the server session via `ctx()`. All ~60 queries by bare `id` fall into three groups: updates on a row just loaded with an `orgId` filter, provider webhooks/returns that match on a provider reference **and** a verified signature or a re-read from Razorpay/Stripe, or platform-admin actions behind `adminGuard()`. `setOrg` and `ctx()` only accept an org the user belongs to. Role actions (`inviteStaff`, `changeRole`, `removeMember`) are OWNER-only, scoped to the org, refuse self-change, and cannot grant PLATFORM_OPERATOR. By design an OWNER can promote another member to OWNER, and a second owner can then remove the first: only promote people you would trust with the whole business.
- What this does not prove: I did not execute anything. A missed query would not show in a grep.
- Fix/verification: add a Playwright test with two accounts: A creates a product/order/invoice, B requests `/products/<A's id>`, `/orders/<id>`, `/invoices/<id>`, `/api/invoices/<id>/eway`, and posts forms with A's ids; all must 404 or fail. `tests/security.test.ts` already blocks the easy regressions (a route without authentication, an admin page without `adminGuard()`, a client-supplied `orgId`).

**F7 — Rate limiting is per server instance unless Upstash is configured; client IP is trusted from `x-forwarded-for`** — Severity: Low/Medium (NEEDS MANUAL)
- Location: `src/lib/ratelimit.ts`, `ip()` in `src/app/actions.ts`. Evidence: without `UPSTASH_REDIS_REST_URL/TOKEN` limits live in memory (serverless instances don't share them). Behind a proxy that does not overwrite `X-Forwarded-For`, a caller can invent an IP per request; Vercel sets it itself.
- Fix: set the Upstash variables; on any host other than Vercel make the proxy overwrite the header. Verify: 6th sign-in attempt within 15 minutes is refused on production.

**F8 — CSP allows `'unsafe-inline'` scripts** — Severity: Low (known). Next.js needs nonces for a strict policy. Everything else in the policy is tight (`frame-ancestors 'none'`, `object-src 'none'`, listed hosts only). Verify with securityheaders.com; consider nonces later.

**F9 — Cron secret compared with `!==` (timing)** — Low (fixed). `src/lib/cronauth.ts` compares hashes in constant time; all four cron routes use it; a test forbids going back.

**F10 — Unauthenticated per-business payment webhook did decryption work without any throttle** — Low (fixed). `/api/pay/razorpay/webhook/[orgId]` now limits 120 requests/min per IP and refuses bodies over 200 KB before touching the database. Signature check unchanged.

**F11 — Product CSV export was cacheable; staff roles see unit cost** — Low (header fixed; role question is yours). Product export now sends `no-store`. `ORDER_STAFF` can see and export `unit cost` (the product list shows it too), while financial reports are blocked for that role. Decide whether cost should be hidden from order staff.

**F12 — Git history not checked** — Low (NEEDS MANUAL). The zips have no `.git`, so I only scanned the files (no real keys found; `.env` is ignored, `.env.example` is empty). If any key was ever committed, deleting it is not enough: rotate it (Supabase DB password and keys, SMTP/Gmail password, Razorpay/Stripe keys, `APP_ENC_KEY` re-encrypts stored gateway keys, Turnstile, Upstash, `CRON_SECRET`). CI now runs gitleaks over the full history. Local: `gitleaks detect` or `trufflehog git file://.`.

**F13 — Logs and monitoring** — Low (NEEDS MANUAL). Logs contain error codes and a few `error.message` strings from Prisma (`notify.ts`, `backorders.ts`, `webhooks.ts`); no passwords, tokens or Authorization headers are logged and mail errors are reduced to a code. Failed second-step attempts are written to the audit log (`mfa.failed`). Failed password sign-ins are only in Supabase Auth logs. Set alerts for: spikes of failed sign-ins, `mfa.failed`, 401s on `/api/v1/*`, 400 "bad signature" on the webhook routes, and new `PLATFORM_OPERATOR` memberships.

**F14 — Email sending** — Low (fixed). Mail now works with any SMTP provider (and still with Gmail). TLS is mandatory on port 587; subject lines cannot carry line breaks (header injection); passwords never appear in logs or errors; the operator health view shows whether the SMTP login works. **Supabase sends sign-up and reset emails itself**: set custom SMTP there too, or its built-in sender limits you to a few emails an hour.

## What I checked and found no issue (evidence)
- **Secrets:** no service-role key anywhere; only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`, `TURNSTILE_SITE_KEY`, company details and GA/GSC ids are `NEXT_PUBLIC_*` (a test enforces this list). Gateway keys are AES-256-GCM encrypted with `APP_ENC_KEY` and never shown again.
- **Payments:** prices come from your own `SubscriptionPayment` row, never the browser; Razorpay/Stripe signatures are checked before JSON is parsed (a test enforces the order); amounts are compared to the stored total; activation is idempotent.
- **SSRF:** outgoing webhooks are https-only, standard ports, DNS resolved once and the IP pinned, private/link-local/cloud-metadata ranges blocked, redirects never followed; Shopify hosts must match `*.myshopify.com` with `redirect: "error"`.
- **Injection/XSS:** all raw SQL uses tagged-template parameters; no `eval`, `$queryRawUnsafe`; the only `dangerouslySetInnerHTML` is JSON-LD with `<` escaped; CSV exports neutralise `= + - @`.
- **Sessions/CSRF:** cookies HttpOnly, Secure in production, SameSite=Lax; no browser storage; client-sent `x-d2h-*` identity headers are deleted in middleware; server actions use Next's origin check.
- **Invitations/API keys:** hashed single-use tokens bound to the invited email; API keys hashed, constant-time compared, 60 requests/minute, suspended orgs blocked.
- **Uploads:** only a CSV import (size and row limits, re-validated on commit). No file storage, so no bucket rules to review.
- **Not applicable:** AI calls (none), file storage buckets (none).

## ATTACKER TEST
- **A) Not signed in:** app pages redirect to `/login`; `/admin` returns 404; actions need a session; `/api/*` need a session, API key, cron secret or provider signature (test-enforced). Remaining: direct Supabase REST/Auth calls (F1, F3) and brute force (limited, F7).
- **B) Normal member:** role checks run in the server action (`guard`); non-owners cannot invite, change roles, set gateway keys or webhooks; order staff cannot export financial reports; admin actions call `adminGuard()` (and now need a second factor).
- **C) Malicious user going after another tenant:** changing an id in a URL or form hits queries that add the session's `orgId`; webhooks and returns need provider proof. Not proven by a running test (F6); and the Supabase API path is open until F1 is checked.

## PRE-LAUNCH SECURITY CHECKLIST
[NEEDS MANUAL REVIEW] Git history scanned for secrets · [NEEDS MANUAL REVIEW] Keys rotated if ever exposed · [PASS] No secrets in frontend code · [PASS] `.env` ignored · [NEEDS MANUAL REVIEW] Supabase RLS lock-down applied and curl-tested (F1) · [PASS] Server-side authorization in actions and routes (code review + tests) · [PASS] Admin actions protected, second factor required · [NEEDS MANUAL REVIEW] Two-account isolation test (F6) · [PASS] Verified email enforced in code (incl. invitations, F2) · [NEEDS MANUAL REVIEW] Supabase Auth settings (F3) · [NEEDS MANUAL REVIEW] Two-step sign-in tested on a real Supabase project (F4) · [PASS] Rate limiting present, [NEEDS MANUAL REVIEW] Upstash configured (F7) · [PASS] Input validation (Zod) · [PASS] Parameterized queries · [PASS] No script-injection sinks · [PASS] Upload limits (CSV only) · [PASS] Security headers, [NEEDS MANUAL REVIEW] CSP tuning (F8) · [PASS] Debug off in production, safe error pages · [FAIL] Lockfile out of sync / advisories unchecked (F5) · [NEEDS MANUAL REVIEW] Backups and a tested restore · [NEEDS MANUAL REVIEW] Failed-login alerts (F13) · [PASS] CI workflow with least privilege and secret scan (not yet run) · [NEEDS MANUAL REVIEW] SMTP login works and SPF/DKIM set (F14) · [N/A] AI calls, storage buckets

## TOP 5 THINGS TO FIX BEFORE LAUNCH
1. Run `supabase/rls-lockdown.sql` and prove it with the anon `curl` test (F1).
2. Set the Supabase Auth rules: Confirm email ON, 12-character minimum, leaked-password protection, CAPTCHA, TOTP enabled, custom SMTP (F3); then turn on your own two-step sign-in and test `/admin` (F4).
3. Run `npm i`, commit the lockfile, `npm audit`, upgrade `next`/`prisma`, get CI green (F5).
4. Scan Git history and rotate anything ever committed; set `UPSTASH_*` and `CRON_SECRET`, `APP_ENC_KEY` (F12, F7).
5. Write the two-account Playwright isolation test and run it against a staging database (F6).

## Still needs manual penetration testing or production verification
Live Supabase configuration (RLS, Auth, MFA, SMTP), tenant isolation with two real accounts, header/CSP behaviour on your host, the real Razorpay/Stripe webhook round-trips in test mode, email deliverability and reset-link behaviour, backup restore, load and abuse behaviour of expensive endpoints (reports, CSV import, search) and a third-party penetration test before handling real customer data.
