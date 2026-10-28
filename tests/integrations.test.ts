import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";
import { newKey, parseKey, hashOk } from "../src/lib/apikeys";
import { trackingUrl } from "../src/lib/couriers";
import { validShop } from "../src/lib/shopify";
import { encrypt, decrypt, encryptionReady } from "../src/lib/secrets";
describe("API keys", () => {
  it("makes a key that parses and verifies, and stores only a hash", () => {
    const k = newKey(), p = parseKey(`Bearer ${k.key}`)!; expect(p.prefix).toBe(k.prefix); expect(hashOk(p.secret, k.hash)).toBe(true); expect(hashOk(p.secret + "0", k.hash)).toBe(false); expect(k.hash).not.toContain(p.secret);
  });
  it("rejects malformed headers", () => { for (const h of [null, "", "Bearer x", "Basic abc", "Bearer d2h_live_zz_yy"]) expect(parseKey(h)).toBeNull(); });
});
describe("courier links", () => {
  it("builds a link only for https templates containing {awb}", () => {
    expect(trackingUrl("Delhivery", "A 1")).toBe("https://www.delhivery.com/track/package/A%201");
    expect(trackingUrl("DTDC", "X1", [{ name: "dtdc", trackUrl: "https://t.example/?n={awb}" }])).toBe("https://t.example/?n=X1");
    expect(trackingUrl("DTDC", "X1", [{ name: "DTDC", trackUrl: "http://t.example/?n={awb}" }])).toBeNull(); expect(trackingUrl("Unknown", "1")).toBeNull();
  });
});
describe("Shopify store names and stored secrets", () => {
  it("accepts only *.myshopify.com", () => { expect(validShop("my-store.myshopify.com")).toBe(true); for (const s of ["evil.com", "a.myshopify.com.evil.com", "x/y.myshopify.com", "", "-a.myshopify.com"]) expect(validShop(s)).toBe(false); });
  it("encrypts and decrypts with APP_ENC_KEY, and refuses a bad key", () => {
    const k = randomBytes(32).toString("base64"); const e = encrypt("shpat_secret", k); expect(e).not.toContain("shpat_secret"); expect(decrypt(e, k)).toBe("shpat_secret");
    expect(() => decrypt(e, randomBytes(32).toString("base64"))).toThrow(); expect(encryptionReady(k)).toBe(true); expect(encryptionReady("short")).toBe(false);
  });
});
