import { describe, it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn(), create: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: (o: any) => { m.create(o); return { sendMail: m.send, verify: m.verify }; } } }));
import { mailConfigured, mailErrorMessage, sendMail, smtpSettings, verifyMail } from "../src/lib/mail";
const clear = () => { for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_SECURE", "GMAIL_USER", "GMAIL_APP_PASSWORD", "MAIL_FROM"]) delete process.env[k]; };
beforeEach(() => { clear(); m.send.mockReset(); m.verify.mockReset(); m.create.mockReset(); m.send.mockResolvedValue({ messageId: "<id@x>" }); m.verify.mockResolvedValue(true); });

describe("SMTP settings", () => {
  it("is not configured with nothing, or with half of a pair", () => {
    expect(mailConfigured({})).toBe(false); expect(mailConfigured({ GMAIL_USER: "a@gmail.com" })).toBe(false);
    expect(mailConfigured({ SMTP_HOST: "smtp.example.com" })).toBe(false); // no sender address
    expect(mailConfigured({ SMTP_HOST: "smtp.example.com", SMTP_FROM: "A <a@x.com>", SMTP_USER: "u" })).toBe(false); // username without password
  });
  it("reads a generic SMTP provider (STARTTLS on 587 by default, SSL on 465)", () => {
    expect(smtpSettings({ SMTP_HOST: "smtp.example.com", SMTP_USER: "u@x.com", SMTP_PASS: "p", SMTP_FROM: "D <no-reply@x.com>" })).toMatchObject({ label: "smtp", port: 587, secure: false, from: "D <no-reply@x.com>" });
    expect(smtpSettings({ SMTP_HOST: "h", SMTP_PORT: "465", SMTP_USER: "u@x.com", SMTP_PASS: "p" })).toMatchObject({ secure: true, from: "Direct2Hub <u@x.com>" });
    expect(smtpSettings({ SMTP_HOST: "h", SMTP_PORT: "465", SMTP_SECURE: "false", SMTP_FROM: "a@x.com" })).toMatchObject({ secure: false, user: "" });
  });
  it("still supports Gmail with the spaces stripped from the app password", () => {
    expect(smtpSettings({ GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" })).toMatchObject({ label: "gmail", host: "smtp.gmail.com", port: 465, secure: true, pass: "abcdefghijklmnop" });
  });
  it("prefers SMTP_* over Gmail when both are set", () => { expect(smtpSettings({ SMTP_HOST: "h", SMTP_FROM: "a@x.com", GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "x" })?.label).toBe("smtp"); });
});
describe("error messages", () => {
  it("explains Gmail failures in plain words", () => {
    expect(mailErrorMessage({ code: "EAUTH", responseCode: 535, response: "535 5.7.8 Username and Password not accepted" })).toContain("App Password");
    expect(mailErrorMessage({ code: "ETIMEDOUT" })).toContain("465"); expect(mailErrorMessage({ responseCode: 550, response: "550 5.4.5 Daily user sending quota exceeded" })).toContain("limit");
    expect(mailErrorMessage(new Error("boom"))).toBe("The email couldn't be sent");
  });
  it("explains generic SMTP failures without mentioning Gmail", () => {
    expect(mailErrorMessage({ code: "EAUTH" }, "smtp")).toContain("SMTP_PASS"); expect(mailErrorMessage({ code: "ECONNREFUSED" }, "smtp")).toContain("SMTP_HOST");
    expect(mailErrorMessage({ code: "ESOCKET", message: "wrong version number" }, "smtp")).toContain("Couldn't reach"); expect(mailErrorMessage({ code: "ETLS" }, "smtp")).toContain("TLS");
  });
});
describe("sending", () => {
  it("reports missing configuration instead of throwing", async () => { const r = await sendMail({ to: "x@y.com", subject: "s", html: "<p>hi</p>" }); expect(r.ok).toBe(false); expect(JSON.stringify(r)).toContain("SMTP_HOST"); expect(m.send).not.toHaveBeenCalled(); });
  it("requires TLS on 587 and sends a text part with the entities decoded", async () => {
    Object.assign(process.env, { SMTP_HOST: "smtp.example.com", SMTP_USER: "u@x.com", SMTP_PASS: "secret-pass", SMTP_FROM: "D <no-reply@x.com>" });
    const r = await sendMail({ to: "x@y.com", subject: "Hi\r\nBcc: evil@x.com", html: "<p>Tom &amp; Jerry<br>there</p>", replyTo: "r@y.com" }); expect(r.ok).toBe(true);
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.example.com", port: 587, secure: false, requireTLS: true }));
    const sent = m.send.mock.calls[0][0]; expect(sent.subject).not.toMatch(/[\r\n]/); expect(sent.text).toContain("Tom & Jerry"); expect(sent.replyTo).toBe("r@y.com"); expect(sent.from).toBe("D <no-reply@x.com>");
  });
  it("never leaks the password on failure", async () => {
    Object.assign(process.env, { GMAIL_USER: "shop@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" });
    m.send.mockRejectedValue(Object.assign(new Error("Invalid login: abcdefghijklmnop"), { code: "EAUTH", responseCode: 535 }));
    const bad = await sendMail({ to: "x@y.com", subject: "Hi", html: "<p>x</p>" }); expect(bad.ok).toBe(false); expect(JSON.stringify(bad)).not.toContain("abcdefghijklmnop"); expect(JSON.stringify(bad)).toContain("App Password");
  });
  it("verifyMail checks the login without sending", async () => {
    expect((await verifyMail()).ok).toBe(false);
    Object.assign(process.env, { SMTP_HOST: "h", SMTP_FROM: "a@x.com" }); expect((await verifyMail()).ok).toBe(true); expect(m.send).not.toHaveBeenCalled();
    m.verify.mockRejectedValue({ code: "ECONNREFUSED" }); const r = await verifyMail(); expect(r.ok).toBe(false); expect(r.error).toContain("SMTP_HOST");
  });
});
