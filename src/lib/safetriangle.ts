/** "Amazon safe triangle": when the pointer leaves a menu trigger heading toward its flyout, keep the flyout open while the pointer stays inside the triangle
 *  between where it left and the flyout's two near corners. Without this the flyout closes the moment the pointer crosses a neighbouring item on the way over. */
export type Pt = { x: number; y: number };
const side = (p: Pt, a: Pt, b: Pt) => (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
export function inTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const d1 = side(p, a, b), d2 = side(p, b, c), d3 = side(p, c, a), neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
export type Box = { left: number; right: number; top: number; bottom: number };
/** The flyout sits to the right of its trigger, so the near edge is its left side. `from` is the last pointer position inside the trigger. */
export function inSafeTriangle(pointer: Pt, from: Pt, flyout: Box): boolean {
  return inTriangle(pointer, from, { x: flyout.left, y: flyout.top }, { x: flyout.left, y: flyout.bottom });
}
export const inBox = (p: Pt, b: Box) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
/** Should the flyout stay open? Yes while the pointer is in the flyout, in the trigger, or travelling through the safe triangle. */
export function keepOpen(pointer: Pt, from: Pt, trigger: Box, flyout: Box): boolean {
  return inBox(pointer, flyout) || inBox(pointer, trigger) || inSafeTriangle(pointer, from, flyout);
}
