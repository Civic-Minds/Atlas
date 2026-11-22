import { describe, expect, it } from 'vitest';
import * as data from '../mcp/atlasData';
import { handlers } from '../mcp/tools';
import { FIGURE_LABELS } from '../mcp/toolHelpers';
import { memoryStore } from '../../shared/mcpMemoryStore';
import type { McpAgency } from '../../shared/mcpStore';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';

// CIV-2087 (#1685): History and Changes give the map's grade, the frequency tools the typical wait; each answer says which.
describe('figure labels', () => {
  it('schedule_changes says its figures are the map\'s grade', async () => {
    const comparison = { slug: 'hsr', day: 'Weekday', before: { file: 'a.zip', date: '20261001' }, after: { file: 'b.zip', date: '20261101' }, leftOut: [], unchanged: [], lines: {},
      changes: [{ route: '1', name: 'King', before: { headway: { amPeak: 15 }, trips: 100 }, after: { headway: { amPeak: 16 }, trips: 100 } }] } as unknown as StudioBeforeAfterFile;
    data.useStore(memoryStore({ catalog: [{ slug: 'hsr', name: 'Hamilton Street Railway' } as McpAgency], files: { hsr: [] }, comparisons: { hsr: comparison } }));
    const res = await handlers.schedule_changes({ agency: 'Hamilton Street Railway' }) as Record<string, unknown>;
    expect(res.figure).toContain(FIGURE_LABELS.grade);
  });

  it('names the two figures in plain words', () => {
    expect(FIGURE_LABELS.typical).toBe('the typical wait');
    expect(FIGURE_LABELS.grade).toBe("the slowest regular wait in this part of the day (the map's grade)");
  });
});
