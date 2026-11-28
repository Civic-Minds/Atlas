import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { studioLegacyLocation, studioPageOwnsMap } from '../studioAgencies';

describe("Studio's map clicks (#1957)", () => {
  it('an open Studio page takes the map; Studio with no page leaves it to the map', () => {
    expect(studioPageOwnsMap('/studio')).toBe(false);
    expect(studioPageOwnsMap('/studio/')).toBe(false);
    expect(studioPageOwnsMap('/studio/fleet/ttc')).toBe(true);
    expect(studioPageOwnsMap('/studio/schedules/ttc/504')).toBe(true);
    expect(studioPageOwnsMap('/studio/live')).toBe(true);
  });

  it("the map's own ?route= is not an old Studio address (opening Fleet with a route card open went back to /studio)", () => {
    expect(studioLegacyLocation('?route=ttc%3A%3A18&day=Weekday')).toBeNull();
    expect(studioLegacyLocation('?page=live&agency=ttc&route=504')).toEqual({ page: 'live', agency: 'ttc', route: '504' });
    expect(studioLegacyLocation('?panel=closed')).toEqual({ page: null, agency: null, route: null });
  });

  it('App hands the map to a page only when one is open, and shows the route card on Studio with no page', () => {
    // #1957: pageView={inStudio} switched the map's own clicks off on /studio, where no page draws or picks anything.
    const app = readFileSync(resolve(__dirname, '../../src/App.tsx'), 'utf8');
    expect(app).toMatch(/pageView=\{inStudio && !studioNoPage\}/);
    expect(app).toMatch(/showSelectionUi=\{[^}]*studioNoPage[^}]*\}/);
    expect(app).toMatch(/const studioNoPage = inStudio && !studioPageOwnsMap\(pathname\)/);
  });
});
