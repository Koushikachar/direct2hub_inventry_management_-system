/** Prices are in rupees, tax-exclusive. Edit them here: this is the only place plan prices live. */
export type PlanInfo = { label: string; products: number; members: number; locations: number; monthly: number; yearly: number };
export const PLANS: Record<string, PlanInfo> = {
  FREE: { label: "Free", products: 100, members: 3, locations: 1, monthly: 0, yearly: 0 },
  GROWTH: { label: "Growth", products: 5000, members: 15, locations: 3, monthly: 999, yearly: 9990 },
  SCALE: { label: "Scale", products: 100000, members: 100, locations: 10, monthly: 2999, yearly: 29990 } };
