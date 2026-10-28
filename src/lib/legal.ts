/** Set these in .env / Vercel so the legal pages show your real details. */
export const LEGAL = {
  company: process.env.NEXT_PUBLIC_COMPANY_NAME || "[Company name]",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "[contact email]",
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || "[registered address]",
  updated: "24 October 2026",
};
export const legalReady = !!(process.env.NEXT_PUBLIC_COMPANY_NAME && process.env.NEXT_PUBLIC_CONTACT_EMAIL);
