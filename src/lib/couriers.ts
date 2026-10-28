/** Tracking pages for couriers we are sure about. Owners can add their own (name + URL with {awb}) under Integrations. */
const BUILTIN: Record<string, string> = { delhivery: "https://www.delhivery.com/track/package/{awb}" };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function trackingUrl(carrier: string, awb: string, custom: { name: string; trackUrl: string }[] = []) {
  const tpl = custom.find((c) => norm(c.name) === norm(carrier))?.trackUrl ?? BUILTIN[norm(carrier)];
  return tpl && tpl.startsWith("https://") && tpl.includes("{awb}") ? tpl.replace("{awb}", encodeURIComponent(awb)) : null;
}
