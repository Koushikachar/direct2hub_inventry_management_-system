import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
/** AES-256-GCM for secrets stored in the database (customers' payment-gateway keys). APP_ENC_KEY = 32 random bytes, base64: `openssl rand -base64 32`. Losing the key means the stored keys must be re-entered. */
const keyOf = (k = process.env.APP_ENC_KEY) => { const b = Buffer.from(k ?? "", "base64"); if (b.length !== 32) throw new Error("APP_ENC_KEY must be 32 bytes, base64 encoded"); return b; };
export const encryptionReady = (k = process.env.APP_ENC_KEY) => { try { keyOf(k); return true; } catch { return false; } };
export function encrypt(plain: string, k = process.env.APP_ENC_KEY) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", keyOf(k), iv), ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}
export function decrypt(blob: string, k = process.env.APP_ENC_KEY) {
  const [v, iv, tag, ct] = blob.split("."); if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised secret format");
  const d = createDecipheriv("aes-256-gcm", keyOf(k), Buffer.from(iv, "base64")); d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}
