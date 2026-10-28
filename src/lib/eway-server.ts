import { db } from "./db"; import { buildEwayBill, EWAY_THRESHOLD } from "./eway"; import { invNo, type InvLine } from "./gst";
export type EwayQuery = Record<string, string | undefined>;
const q = (v: string | undefined, max = 120) => (v ?? "").trim().slice(0, max);
/** Loads an invoice and builds its e-way bill file from the transport details typed on the page. */
export async function ewayFor(orgId: string, invoiceId: string, p: EwayQuery) {
  const [inv, org] = await Promise.all([db.invoice.findFirst({ where: { id: invoiceId, orgId } }), db.organization.findUnique({ where: { id: orgId } })]); if (!inv || !org) return null;
  const mode = (["1", "2", "3", "4"].includes(p.mode ?? "") ? p.mode : "1") as "1" | "2" | "3" | "4";
  const r = buildEwayBill({ invoiceNo: invNo(inv.number), invoiceDate: inv.createdAt, intra: inv.intraState, lines: inv.lines as unknown as InvLine[], subtotal: Number(inv.subtotal), tax: Number(inv.taxTotal), total: Number(inv.total),
    from: { gstin: (org.gstin ?? "").toUpperCase(), name: org.name, address: q(p.fromAddr) || (org.address ?? ""), place: q(p.fromPlace, 50), pincode: q(p.fromPin, 6) },
    to: { gstin: inv.customerGstin ? inv.customerGstin.toUpperCase() : null, name: inv.customerName, address: q(p.toAddr) || (inv.customerAddress ?? ""), place: q(p.toPlace, 50), pincode: q(p.toPin, 6), state: inv.customerState },
    transport: { mode, distance: Math.floor(Number(p.distance ?? 0)) || 0, vehicleNo: q(p.vehicle, 20), transporterId: q(p.transporterId, 15).toUpperCase(), transporterName: q(p.transporterName, 100), docNo: q(p.docNo, 20), docDate: q(p.docDate, 10) } });
  return { inv, org, result: r, required: Number(inv.total) > EWAY_THRESHOLD };
}
