import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PageShell from '../PageShell';

// CIV-1708 (Ryan, 2026-11-15: "on the for transit planners page the header doesnt float"): the shared page shell
// always pins the site header to the top, so it stays put while scrolling on every standalone page.
describe('shared page header stays at the top', () => {
  for (const variant of ['docs', 'wide'] as const) {
    it(`pins the site header (${variant})`, () => {
      const { container } = render(<PageShell variant={variant}><p>Body</p></PageShell>);
      const pin = container.querySelector('[data-page-header]');
      expect(pin).not.toBeNull();
      expect(pin!.className).toMatch(/\bsticky\b/);
      expect(pin!.className).toMatch(/\btop-0\b/);
      expect(pin!.querySelector('header')).not.toBeNull();
    });
  }
});
