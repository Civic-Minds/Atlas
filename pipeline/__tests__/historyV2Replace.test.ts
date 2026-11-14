import { describe, expect, it } from 'vitest';
import { checkWeekendOnlyAddition, replacementBackupKey } from '../historyV2Replace.js';

// CIV-1430: the approved-replacement check (history:upload --replace-approved).
describe('checkWeekendOnlyAddition (CIV-1430)', () => {
  it('the replacement check works on bytes: a reordered key is refused', () => {
    expect(checkWeekendOnlyAddition('{"routes":{"1":{"rep":{"h":1}}},"refDate":"x"}', '{"refDate":"x","routes":{"1":{"rep":{"h":1}}}}').ok).toBe(false);
  });

  it('the backup key is under its own prefix, by ticket, and differs for different old bodies', () => {
    const a = replacementBackupKey('CIV-1430', 'history-v2/mbta/20181202.json', 'a');
    expect(a).toMatch(/^history-v2-replaced\/CIV-1430\/mbta\/20181202\.[0-9a-f]{16}\.json$/);
    expect(replacementBackupKey('CIV-1430', 'history-v2/mbta/20181202.json', 'b')).not.toBe(a);
  });
});
