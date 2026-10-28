import nodemailer, { type Transporter } from "nodemailer";
type R = { ok: true; id: string } | { ok: false; error: string };
type Env = Record<string, string | undefined>;

/** All app email goes out over SMTP. Two ways to configure it (the first one found wins):
 *  1) Any SMTP provider (Brevo, SES, Mailgun, Zoho, your own server...):
 *       SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS; default 587), SMTP_USER, SMTP_PASS, SMTP_FROM ("Direct2Hub <no-reply@yourdomain>"), optional SMTP_SECURE=true|false
 *  2) Gmail (smtp.gmail.com:465): GMAIL_USER and GMAIL_APP_PASSWORD (a 16-character App Password, not the normal password), optional MAIL_FROM.
 *  Gmail allows about 500 emails a day on a free account (2,000 on Workspace). Passwords are never logged or returned. */
export type SmtpSettings = { label: "smtp" | "gmail"; host: string; port: number; secure: boolean; user: string; pass: string; from: string };
const stripSpaces = (s?: string) => (s ?? "").replace(/\s+/g, ""); // Google shows the App Password as 4 groups of 4 letters
const truthy = (v?: string) => /^(1|true|yes|on)$/i.test((v ?? "").trim());

export function smtpSettings(env: Env = process.env): SmtpSettings | null {
  const host = env.SMTP_HOST?.trim();
  if (host) {
    const user = env.SMTP_USER?.trim() ?? "", pass = env.SMTP_PASS ?? "", port = Number(env.SMTP_PORT) || 587;
    const from = env.SMTP_FROM?.trim() || env.MAIL_FROM?.trim() || (user.includes("@") ? `Direct2Hub <${user}>` : "");
    if (!from || (user && !pass)) return null; // a sender address is required; a username needs its password
    const secure = env.SMTP_SECURE !== undefined && env.SMTP_SECURE !== "" ? truthy(env.SMTP_SECURE) : port === 465;
    return { label: "smtp", host, port, secure, user, pass, from };
  }
  const user = env.GMAIL_USER?.trim(), pass = stripSpaces(env.GMAIL_APP_PASSWORD);
  if (user && pass) return { label: "gmail", host: "smtp.gmail.com", port: 465, secure: true, user, pass, from: env.MAIL_FROM?.trim() || `Direct2Hub <${user}>` };
  return null;
}
export const mailConfigured = (env: Env = process.env) => !!smtpSettings(env);

let cached: { key: string; t: Transporter } | null = null;
function transporter(s: SmtpSettings): Transporter {
  const key = `${s.host}:${s.port}:${s.secure}:${s.user}:${s.pass.length}`;
  if (cached?.key === key) return cached.t;
  const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, ...(s.secure ? {} : { requireTLS: true }), // on port 587 the connection must upgrade to TLS; it never falls back to plain text
    ...(s.user ? { auth: { user: s.user, pass: s.pass } } : {}), connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  cached = { key, t }; return t;
}
/** Turns a raw SMTP failure into something a person can act on. Secrets are never included. */
export function mailErrorMessage(e: any, label: "smtp" | "gmail" = "gmail"): string {
  const code = String(e?.code ?? ""), resp = Number(e?.responseCode ?? 0), text = String(e?.response ?? e?.message ?? "");
  const authFail = code === "EAUTH" || resp === 535 || /Username and Password not accepted|BadCredentials|Authentication (failed|unsuccessful)/i.test(text);
  if (label === "gmail") {
    if (authFail) return "Gmail rejected the login. Use a 16-character App Password (2-Step Verification must be on), not your normal password.";
    if (resp === 534 || /Application-specific password required/i.test(text)) return "Gmail needs an App Password. Turn on 2-Step Verification, then create one under Google Account > Security > App passwords.";
  } else if (authFail) return "The mail server rejected the login. Check SMTP_USER and SMTP_PASS (many providers need an API key or app password here).";
  if (resp === 550 && /rate|limit|quota|exceeded/i.test(text) || /Daily user sending (quota|limit) exceeded|rate limit/i.test(text) || resp === 452 || resp === 421) return label === "gmail" ? "Gmail's daily sending limit was reached. Try again tomorrow or move to Google Workspace." : "The mail server's sending limit was reached. Try again later or raise the limit with your provider.";
  if (resp >= 550 && resp < 560) return "The recipient's address was rejected by the mail server.";
  if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNREFUSED", "ENOTFOUND", "EDNS"].includes(code)) return label === "gmail" ? "Couldn't reach Gmail's mail server. Check the internet connection or firewall (port 465)." : "Couldn't reach the mail server. Check SMTP_HOST and SMTP_PORT, and that the host allows outgoing connections on that port.";
  if (code === "ETLS" || /STARTTLS|SSL routines|wrong version number/i.test(text)) return "The TLS setting doesn't match the port. Use port 465 with SMTP_SECURE=true, or port 587 with SMTP_SECURE=false.";
  return "The email couldn't be sent";
}
/** Checks the SMTP login without sending anything (used by the operator health view). */
export async function verifyMail(): Promise<{ ok: boolean; error?: string }> {
  const s = smtpSettings(); if (!s) return { ok: false, error: "Email isn't configured" };
  try { await transporter(s).verify(); return { ok: true }; } catch (e: any) { cached = null; return { ok: false, error: mailErrorMessage(e, s.label) }; }
}
const plain = (html: string) => html.replace(/<(br|\/p|\/li|\/tr)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
/** "ok" means the server accepted the message, not that it was delivered. Secrets are never logged. */
export async function sendMail(a: { to: string; subject: string; html: string; replyTo?: string }): Promise<R> {
  const s = smtpSettings();
  if (!s) return { ok: false, error: "Email isn't configured (set SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM, or GMAIL_USER and GMAIL_APP_PASSWORD)" };
  try {
    const info = await transporter(s).sendMail({ from: s.from, to: a.to, subject: a.subject.replace(/[\r\n]+/g, " ").slice(0, 200), html: a.html, text: plain(a.html), ...(a.replyTo ? { replyTo: a.replyTo } : {}) });
    return { ok: true, id: String(info.messageId ?? "") };
  } catch (e: any) { cached = null; console.error("mail error", e?.code, e?.responseCode); return { ok: false, error: mailErrorMessage(e, s.label) }; }
}
