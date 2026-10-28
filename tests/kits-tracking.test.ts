import { describe, it, expect } from "vitest";
import { explode, kitAvailable } from "../src/lib/kits";
import { parseSerials, expiryState } from "../src/lib/tracking";
import { encrypt, decrypt, encryptionReady } from "../src/lib/secrets";
import { buildEwayBill, STATE_CODE } from "../src/lib/eway";
const key = Buffer.alloc(32, 7).toString("base64");
describe("kits", () => {
  const kits = new Map([["kitA", [{ componentId: "p1", qty: 2 }, { componentId: "p2", qty: 1 }]]]);
  it("replaces a kit line by its components and leaves normal lines alone", () => { const out = explode([{ id: "l1", productId: "kitA", qty: 3 }, { id: "l2", productId: "x", qty: 5 }], kits);
    expect(out).toEqual([{ id: "l1:p1", productId: "p1", qty: 6 }, { id: "l1:p2", productId: "p2", qty: 3 }, { id: "l2", productId: "x", qty: 5 }]); });
  it("works out how many kits can be assembled", () => { expect(kitAvailable([{ perKit: 2, available: 9 }, { perKit: 1, available: 3 }])).toBe(3); expect(kitAvailable([{ perKit: 2, available: 1 }])).toBe(0); expect(kitAvailable([])).toBe(0); expect(kitAvailable([{ perKit: 1, available: -4 }])).toBe(0); });
});
describe("serial numbers and expiry", () => {
  it("parses pasted serials", () => { const r = parseSerials("SN001\nSN002, SN003;SN001\n\n  SN004  \nbad serial!"); expect(r.list).toEqual(["SN001", "SN002", "SN003", "SN004"]); expect(r.dups).toEqual(["SN001"]); expect(r.bad).toEqual(["bad serial!"]); });
  it("classifies expiry by whole days", () => { const now = new Date("2026-10-23T18:00:00Z"); expect(expiryState(null, now)).toBe("none"); expect(expiryState(new Date("2026-10-22T00:00:00Z"), now)).toBe("expired"); expect(expiryState(new Date("2026-10-23T00:00:00Z"), now)).toBe("soon");
    expect(expiryState(new Date("2026-11-22T00:00:00Z"), now)).toBe("soon"); expect(expiryState(new Date("2026-12-30T00:00:00Z"), now)).toBe("ok"); });
});
describe("secret storage", () => {
  it("round-trips and never stores plain text", () => { const blob = encrypt("rzp_secret_123", key); expect(blob.includes("rzp_secret_123")).toBe(false); expect(decrypt(blob, key)).toBe("rzp_secret_123"); expect(encrypt("a", key) === encrypt("a", key)).toBe(false); });
  it("rejects tampering and the wrong key", () => { const blob = encrypt("hello", key), parts = blob.split("."); parts[3] = Buffer.from("xxxxx").toString("base64"); expect(() => decrypt(parts.join("."), key)).toThrow(); expect(() => decrypt(blob, Buffer.alloc(32, 9).toString("base64"))).toThrow(); });
  it("needs a 32 byte key", () => { expect(encryptionReady(key)).toBe(true); expect(encryptionReady("short")).toBe(false); expect(encryptionReady(undefined)).toBe(false); });
});
describe("e-way bill", () => {
  const base = { invoiceNo: "INV-0007", invoiceDate: new Date("2026-10-23T05:00:00Z"), intra: true, lines: [{ name: "Cotton Tee", hsn: "6109", qty: 100, rate: 600, taxRate: 12, taxable: 60000, tax: 7200 }], subtotal: 60000, tax: 7200, total: 67200,
    from: { gstin: "29ABCDE1234F1Z5", name: "Acme", address: "1 MG Road", place: "Bengaluru", pincode: "560001" }, to: { gstin: "29PQRSX5678L1Z2", name: "Buyer", address: "5 Park St", place: "Mysuru", pincode: "570001", state: null },
    transport: { mode: "1" as const, distance: 150, vehicleNo: "ka 01 ab 1234", transporterId: "", transporterName: "", docNo: "", docDate: "" } };
  it("builds an intra-state bill with split taxes", () => { const r = buildEwayBill(base); expect(r.ok).toBe(true); if (!r.ok) return; const b = (r.data as any).billLists[0];
    expect(b.docDate).toBe("23/10/2026"); expect(b.fromStateCode).toBe(29); expect(b.cgstValue).toBe(3600); expect(b.sgstValue).toBe(3600); expect(b.igstValue).toBe(0); expect(b.vehicleNo).toBe("KA01AB1234"); expect(b.itemList[0].cgstRate).toBe(6); expect(b.totInvValue).toBe(67200); });
  it("uses IGST and URP for an unregistered buyer in another state", () => { const r = buildEwayBill({ ...base, intra: false, to: { ...base.to, gstin: null, state: "Tamil Nadu", pincode: "600001" } }); expect(r.ok).toBe(true); if (!r.ok) return; const b = (r.data as any).billLists[0];
    expect(b.toGstin).toBe("URP"); expect(b.toStateCode).toBe(33); expect(b.igstValue).toBe(7200); expect(b.itemList[0].igstRate).toBe(12); expect(b.itemList[0].cgstRate).toBe(0); });
  it("lists everything that is missing", () => { const r = buildEwayBill({ ...base, from: { ...base.from, gstin: "" , pincode: "12" }, lines: [{ ...base.lines[0], hsn: "" }], transport: { ...base.transport, vehicleNo: "" } });
    expect(r.ok).toBe(false); if (r.ok) return; expect(r.errors.length).toBe(4); });
  it("has a state code for every state", () => { expect(Object.keys(STATE_CODE).length).toBe(36); });
});
import { parseOptions, variantCombos } from "../src/lib/variants";
describe("variants", () => {
  it("parses option lists", () => { expect(parseOptions("S, M,\nL, M ,")).toEqual(["S", "M", "L"]); expect(parseOptions("")).toEqual([]); });
  it("builds every size/colour combination with SKUs", () => { const v = variantCombos("TEE", [["S", "M"], ["Red", "Dark Blue"]]); expect(v?.length).toBe(4); expect(v?.[0]).toEqual({ label: "S / Red", sku: "TEE-S-RED" }); expect(v?.[3]).toEqual({ label: "M / Dark Blue", sku: "TEE-M-DARKBLUE" }); });
  it("handles one option list, none, too many, and colliding SKUs", () => { expect(variantCombos("X", [["A", "B"], []])?.map((x) => x.sku)).toEqual(["X-A", "X-B"]); expect(variantCombos("X", [[], []])).toBe(null);
    expect(variantCombos("X", [Array.from({ length: 8 }, (_, i) => "a" + i), Array.from({ length: 8 }, (_, i) => "b" + i)])).toBe(null); expect(variantCombos("X", [["Red!", "Red?"]])).toBe(null); });
});
