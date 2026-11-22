import { describe, expect, it } from 'vitest';
import { splitPaths, splitStore, splitUrl } from '../mcpSplitStore';

describe('split store reads (multi-tool chain test, 2026-11-21)', () => {
  it('encodes a file name that already holds an encoded route key, so the server finds that exact file', () => {
    const path = splitPaths.rows('translink', 'Weekday', 'id:30053');
    expect(path).toBe('agencies/translink/rows/Weekday/id%3A30053.json');
    // A server decodes the URL once, back to the file's own name.
    const url = splitUrl('https://example.test/mcp/', path);
    expect(decodeURIComponent(new URL(url).pathname)).toBe('/mcp/agencies/translink/rows/Weekday/id%3A30053.json');
    expect(splitUrl('https://example.test/mcp', 'agencies/ttc/rows/Weekday/504.json')).toBe('https://example.test/mcp/agencies/ttc/rows/Weekday/504.json');
  });

  it('reads a file again after a failed read instead of keeping the failure', async () => {
    let calls = 0;
    const store = splitStore(async () => {
      calls++;
      if (calls === 1) throw new Error('This promise was created by a request that has since ended');
      return [{ slug: 'ttc', name: 'TTC' }];
    });
    await expect(store.rankAgencies!()).rejects.toThrow();
    await expect(store.rankAgencies!()).resolves.toEqual([{ slug: 'ttc', name: 'TTC' }]);
    await store.rankAgencies!();
    expect(calls).toBe(2);
  });
});
