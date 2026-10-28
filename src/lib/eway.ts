import type { InvLine } from "./gst";
/** Builds the JSON that the e-way bill portal's "Generate in bulk" upload accepts, from an invoice plus transport details. We do not talk to the GST portal: the user uploads the file there. */
export const STATE_CODE: Record<string, string> = { "Jammu and Kashmir": "01", "Himachal Pradesh": "02", Punjab: "03", Chandigarh: "04", Uttarakhand: "05", Haryana: "06", Delhi: "07", Rajasthan: "08", "Uttar Pradesh": "09", Bihar: "10", Sikkim: "11", "Arunachal Pradesh": "12", Nagaland: "13", Manipur: "14", Mizoram: "15", Tripura: "16", Meghalaya: "17", Assam: "18", "West Bengal": "19", Jharkhand: "20", Odisha: "21", Chhattisgarh: "22", "Madhya Pradesh": "23", Gujarat: "24",
  "Dadra and Nagar Haveli and Daman and Diu": "26", Maharashtra: "27", Karnataka: "29", Goa: "30", Lakshadweep: "31", Kerala: "32", "Tamil Nadu": "33", Puducherry: "34", "Andaman and Nicobar Islands": "35", Telangana: "36", "Andhra Pradesh": "37", Ladakh: "38" };
export const EWAY_THRESHOLD = 50000;
export type EwayInput = { invoiceNo: string; invoiceDate: Date; intra: boolean; lines: InvLine[]; subtotal: number; tax: number; total: number;
  from: { gstin: string; name: string; address: string; place: string; pincode: string }; to: { gstin: string | null; name: string; address: string; place: string; pincode: string; state: string | null };
  transport: { mode: "1" | "2" | "3" | "4"; distance: number; vehicleNo: string; transporterId: string; transporterName: string; docNo: string; docDate: string } };
const r2 = (n: number) => Math.round(n * 100) / 100, ddmmyyyy = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replace(/\//g, "/");
export const VEHICLE_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
export function buildEwayBill(i: EwayInput): { ok: true; json: string; data: unknown } | { ok: false; errors: string[] } {
  const e: string[] = [], pin = (p: string) => /^[1-9][0-9]{5}$/.test(p), fromState = i.from.gstin.slice(0, 2), toState = i.to.gstin ? i.to.gstin.slice(0, 2) : i.to.state ? STATE_CODE[i.to.state] : undefined;
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(i.from.gstin)) e.push("Add your business GSTIN in Settings first");
  if (!pin(i.from.pincode)) e.push("Enter a 6-digit pincode for the place goods are sent from"); if (!pin(i.to.pincode)) e.push("Enter a 6-digit pincode for the place goods are sent to");
  if (!toState) e.push("The customer needs a GSTIN or a state on the Customers page");
  if (!i.from.place.trim() || !i.to.place.trim()) e.push("Enter the from and to places (town or city)");
  const veh = i.transport.vehicleNo.replace(/[\s-]/g, "").toUpperCase(); if (veh && !VEHICLE_RE.test(veh)) e.push("Vehicle number looks wrong (example KA01AB1234)");
  if (!veh && !i.transport.transporterId) e.push("Enter a vehicle number, or a transporter ID to add the vehicle later");
  if (!Number.isInteger(i.transport.distance) || i.transport.distance < 0 || i.transport.distance > 4000) e.push("Distance must be a whole number of km (0 lets the portal work it out)");
  const items = i.lines.map((l, n) => { const h = String(l.hsn ?? "").replace(/\D/g, ""); if (h.length < 4) e.push(`Item "${l.name}" needs an HSN code of at least 4 digits (add it on the product page)`);
    const half = i.intra ? l.taxRate / 2 : 0;
    return { itemNo: n + 1, productName: l.name.slice(0, 100), productDesc: l.name.slice(0, 100), hsnCode: Number(h) || 0, quantity: l.qty, qtyUnit: "NOS", taxableAmount: r2(l.taxable), sgstRate: half, cgstRate: half, igstRate: i.intra ? 0 : l.taxRate, cessRate: 0 }; });
  if (e.length) return { ok: false, errors: [...new Set(e)] };
  const tax = r2(i.tax), cg = i.intra ? r2(Math.floor(tax * 50) / 100) : 0, data = { version: "1.0.0621", billLists: [{ userGstin: i.from.gstin, supplyType: "O", subSupplyType: 1, docType: "INV", docNo: i.invoiceNo, docDate: ddmmyyyy(i.invoiceDate), transactionType: 1,
    fromGstin: i.from.gstin, fromTrdName: i.from.name.slice(0, 100), fromAddr1: i.from.address.slice(0, 120), fromAddr2: "", fromPlace: i.from.place.slice(0, 50), fromPincode: Number(i.from.pincode), fromStateCode: Number(fromState), actualFromStateCode: Number(fromState),
    toGstin: i.to.gstin || "URP", toTrdName: i.to.name.slice(0, 100), toAddr1: i.to.address.slice(0, 120), toAddr2: "", toPlace: i.to.place.slice(0, 50), toPincode: Number(i.to.pincode), toStateCode: Number(toState), actualToStateCode: Number(toState),
    totalValue: r2(i.subtotal), cgstValue: cg, sgstValue: i.intra ? r2(tax - cg) : 0, igstValue: i.intra ? 0 : tax, cessValue: 0, otherValue: 0, totInvValue: r2(i.total),
    transMode: Number(i.transport.mode), transDistance: i.transport.distance, transporterName: i.transport.transporterName.slice(0, 100), transporterId: i.transport.transporterId, transDocNo: i.transport.docNo, transDocDate: i.transport.docDate ? i.transport.docDate.split("-").reverse().join("/") : "", vehicleNo: veh, vehicleType: "R",
    mainHsnCode: items[0].hsnCode, itemList: items }] };
  return { ok: true, json: JSON.stringify(data, null, 2), data };
}
