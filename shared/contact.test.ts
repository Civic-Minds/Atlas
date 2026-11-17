import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL, mailto } from './contact';

const ROOT = join(__dirname, '..');
const addresses = (file: string) => readFileSync(join(ROOT, file), 'utf8').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];

describe('contact email', () => {
  it('builds mailto links from the one address', () => {
    expect(mailto('Atlas Feedback')).toBe(`mailto:${CONTACT_EMAIL}?subject=Atlas%20Feedback`);
    expect(mailto('Atlas Feedback', 'Page: /\n')).toBe(`mailto:${CONTACT_EMAIL}?subject=Atlas%20Feedback&body=Page%3A%20%2F%0A`);
    expect(mailto('')).toBe(`mailto:${CONTACT_EMAIL}?subject=`);
  });

  // The legal markdown can't import the constant, so it must quote the same address.
  for (const file of ['docs/legal/PRIVACY.md', 'docs/legal/TERMS.md']) {
    it(`${file} quotes the shared address`, () => {
      const found = addresses(file);
      expect(found.length).toBeGreaterThan(0);
      expect(found.filter(a => a !== CONTACT_EMAIL)).toEqual([]);
    });
  }
});
