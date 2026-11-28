import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LATE_LABEL, lateOwnLimitSentence, onTimeWindowWords } from '../../../shared/liveWording';
import { agencyPossessive } from '../../../shared/agencyArticle';

// CIV-3171 (Ryan, 2026-11-28, picked 1): Studio Live's late key lives in Measurements as a row labelled just "Late" ("Just "Late"
// no Late 5+ mins I think"), built like the Bunching row, in place of the bottom "Late · 5+ min" pill.
const read = (path: string) => readFileSync(path, 'utf8');

describe('Measurements carries the Late row, Studio Live has no late pill (CIV-3171)', () => {
  it('Studio Live no longer shows the late key pill', () => {
    expect(read('src/apps/studio/Live.tsx')).not.toMatch(/LiveMapKeyPill/);
  });

  it('the Late row is the Bunching row\'s LinkCard, labelled just "Late"', () => {
    const panel = read('src/components/InfoPanel.tsx');
    expect(panel).toMatch(/<LinkCard as="button" onClick=\{\(\) => setView\('measure-bunching'\)\} icon="chevron">\{BUNCHING_LABEL\}<\/LinkCard>/);
    expect(panel).toMatch(/<LinkCard as="button" onClick=\{\(\) => setView\('measure-late'\)\} icon="chevron">\{LATE_LABEL\}<\/LinkCard>/);
    expect(LATE_LABEL).toBe('Late');
  });

  it('an agency with its own limit reads it, with no colon (Ryan: "I don\'t like : but sure"); draft until his word-for-word OK', () => {
    const text = lateOwnLimitSentence(agencyPossessive('TTC'), onTimeWindowWords('ttc'));
    expect(text).toBe('Late means more than 5 min behind schedule, the TTC’s own limit.');
    expect(text).not.toContain(':');
  });
});
