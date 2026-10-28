export const GST_RATES = [0, 5, 12, 18, 28];
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"];
export type InvLine = { name: string; hsn: string; qty: number; rate: number; taxRate: number; taxable: number; tax: number };
export const invNo = (n: number) => `INV-${String(n).padStart(4, "0")}`;
export const cnNo = (n: number) => `CN-${String(n).padStart(4, "0")}`;
export const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Whole-paise arithmetic (no floating-point drift). Prices are treated as tax-exclusive. Same state: CGST + SGST halves; different state: IGST. */
export function buildInvoice(items: { name: string; hsn: string | null; qty: number; rate: number; taxRate: number }[], intra: boolean) {
  const lines: InvLine[] = items.map((i) => { const taxable = Math.round(i.qty * i.rate * 100), tax = Math.round((taxable * i.taxRate) / 100);
    return { name: i.name, hsn: i.hsn ?? "", qty: i.qty, rate: i.rate, taxRate: i.taxRate, taxable: taxable / 100, tax: tax / 100 }; });
  const subP = lines.reduce((s, l) => s + Math.round(l.taxable * 100), 0), taxP = lines.reduce((s, l) => s + Math.round(l.tax * 100), 0);
  const cgstP = intra ? Math.floor(taxP / 2) : 0, sgstP = intra ? taxP - cgstP : 0;
  return { lines, subtotal: subP / 100, tax: taxP / 100, total: (subP + taxP) / 100, cgst: cgstP / 100, sgst: sgstP / 100, igst: intra ? 0 : taxP / 100 };
}
/** Price for a customer on a price list: percent -10 = 10% off, 5 = 5% markup. Rounded to the paisa. */
export const listPrice = (price: number, percent: number) => Math.round(price * (100 + percent)) / 100;
