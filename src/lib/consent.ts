/** The visitor's analytics choice, kept ONLY in this page's memory. Nothing is written to cookies, localStorage, sessionStorage or IndexedDB, so a full page reload (a new visit) asks again. Moving between pages inside the site keeps the choice, because the script stays loaded. */
export type Consent = "granted" | "denied" | null;
let choice: Consent = null; const listeners = new Set<() => void>();
export const getConsent = (): Consent => choice;
export function setConsent(v: Consent) { choice = v; listeners.forEach((l) => l()); }
export function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
