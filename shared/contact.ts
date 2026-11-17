/** The one contact address. Every mailto link in the app is built from it (CIV-1790); docs/legal/PRIVACY.md and TERMS.md quote it and contactEmail.test.ts keeps them in step. */
export const CONTACT_EMAIL = 'hey@ryanisnota.pro';

/** A mailto link to the contact address, with the subject (and body, when given) encoded. */
export function mailto(subject: string, body?: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}${body === undefined ? '' : `&body=${encodeURIComponent(body)}`}`;
}
