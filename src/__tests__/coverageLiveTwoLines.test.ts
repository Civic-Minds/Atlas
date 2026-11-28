import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(resolve(__dirname, '../pages/StudioCoveragePage.tsx'), 'utf8');

// CIV-3190 (Ryan: "should this be 2 lines so its less wide"): the Live column holds two tags a line, as Studio's does, so
// its four tags (Recorded · Real-time · Report · Lateness) sit on two lines through the shared TagList's wrap.
describe('Studio coverage: Live tags on two lines (CIV-3190)', () => {
  it('sizes the Live column for two tags a line, the same width as Studio', () => {
    expect(page).toMatch(/key: 'live', header: H\.live, width: TWO_TAG_COLUMN_REM,/);
    expect(page).toMatch(/key: 'studio', header: H\.studio, width: TWO_TAG_COLUMN_REM,/);
    expect(page).not.toMatch(/key: 'live'[^\n]*width: WIDE \+ 12/);
  });

  it('draws the tags with the shared TagList, which wraps inside its column', () => {
    expect(page).toContain('<TagList tags={livePills(r, live)} />');
    expect(readFileSync(resolve(__dirname, '../components/ui/TagList.tsx'), 'utf8')).toContain('flex-wrap');
  });
});
