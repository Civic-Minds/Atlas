import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// CIV-3178 (Ryan, 2026-11-28, picked 1: "when possible, this should be on one line"): the panel footer reads
// "Docs · Terms · Privacy · © 2026 Civic Minds" on one line, wrapping the © part only on a phone, with no full stop.
describe('the info panel footer is one line (CIV-3178)', () => {
  const panel = readFileSync('src/components/InfoPanel.tsx', 'utf8');
  const footer = panel.slice(panel.indexOf('data-testid="info-panel-footer"'), panel.indexOf('</div>\n              </div>', panel.indexOf('data-testid="info-panel-footer"')));
  it('keeps the links and the © in one row, the © wrapping only on a phone', () => {
    expect(footer).toMatch(/<span aria-hidden="true" className="max-sm:hidden">·<\/span>\s*<span className="max-sm:basis-full whitespace-nowrap">© \{new Date\(\)\.getFullYear\(\)\} Civic Minds<\/span>/);
    expect(footer).not.toMatch(/<p>©/);
  });
  it('has no full stop after Civic Minds', () => {
    expect(footer).not.toMatch(/Civic Minds\./);
  });
});
