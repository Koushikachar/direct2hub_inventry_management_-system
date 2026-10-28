import { describe, it, expect } from "vitest";
import { parseCsv, validateRows } from "../src/lib/csv";
describe("csv import validation", () => {
  const run = (t: string, ex: string[] = []) => validateRows(parseCsv(t), new Set(ex));
  it("reports the row number of each bad row and keeps good rows", () => {
    const r = run('sku,name,price,unit_cost\nA,"Tee, M",499,200\nB,,x,5\nA,Dup,1,1\nC,Old,1,1', ["C"]);
    expect(r.valid.map(v => v.sku)).toEqual(["A"]); expect(r.valid[0].name).toBe("Tee, M");
    expect(r.errors.map(e => e.row)).toEqual([3, 4, 5]);
    expect(r.errors[1].msg).toMatch(/Duplicate SKU/); expect(r.errors[2].msg).toMatch(/already exists/);
  });
  it("flags missing required columns", () => { expect(run("sku,name\nA,B").errors[0].msg).toMatch(/price, unit_cost/); });
  it("rejects fractional stock", () => { expect(run("sku,name,price,unit_cost,opening_stock\nA,B,1,1,2.5").errors).toHaveLength(1); });
});

import { validateSuppliers } from "../src/lib/csv";
describe("supplier import validation", () => {
  it("flags duplicates, existing names and bad emails by row", () => {
    const r = validateSuppliers(parseCsv("name,phone,email\nAcme,1,a@b.co\nacme,2,\nOld Co,3,\nBad,4,nope"), new Set(["old co"]));
    expect(r.valid.map(v => v.name)).toEqual(["Acme"]); expect(r.errors.map(e => e.row)).toEqual([3, 4, 5]);
  });
});
