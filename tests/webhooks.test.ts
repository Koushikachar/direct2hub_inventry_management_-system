import { describe, it, expect, vi } from "vitest";
import { createHmac } from "crypto";
import { isPrivateIp, checkUrlShape, sign } from "../src/lib/webhooks";
describe("webhook safety", () => {
  it("blocks private, loopback, metadata and reserved addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "not-an-ip"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPrivateIp(ip)).toBe(false);
  });
  it("rejects unsafe URLs before any network call", () => {
    vi.stubEnv("NODE_ENV", "production"); // http:// is only tolerated in development
    for (const u of ["http://example.com/x", "https://user:pw@example.com/", "https://localhost/x", "https://db.internal/x", "https://intranet/x", "https://example.com:6379/x", "ftp://example.com", "nope"]) expect(() => checkUrlShape(u)).toThrow();
    expect(checkUrlShape("https://hooks.example.com/d2h?x=1").hostname).toBe("hooks.example.com");
    vi.unstubAllEnvs();
  });
  it("signs timestamp.body with HMAC-SHA256", () => { expect(sign("s", "123", "{}")).toBe(createHmac("sha256", "s").update("123.{}").digest("hex")); });
});
