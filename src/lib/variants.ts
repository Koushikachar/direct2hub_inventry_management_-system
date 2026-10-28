/** Item groups: one product idea (a T-shirt) turned into one real product per size/colour combination, each with its own SKU and stock. */
export const MAX_VARIANTS = 60;
export const parseOptions = (text: string, max = 20) => [...new Set(text.split(/[\n\r,;]+/).map((s) => s.trim()).filter(Boolean))].slice(0, max);
const part = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
/** All combinations of the option lists (empty lists are skipped), each with a label and a SKU such as TEE-M-RED. Returns null when there are no options or too many combinations. */
export function variantCombos(baseSku: string, lists: string[][]) {
  const used = lists.filter((l) => l.length); if (!used.length) return null;
  let combos: string[][] = [[]]; for (const l of used) combos = combos.flatMap((c) => l.map((v) => [...c, v]));
  if (combos.length > MAX_VARIANTS) return null;
  const out = combos.map((c, i) => ({ label: c.join(" / "), sku: [baseSku.trim(), ...c.map((v) => part(v) || String(i + 1))].join("-") }));
  return new Set(out.map((o) => o.sku)).size === out.length ? out : null; // two options that shorten to the same SKU would collide
}
