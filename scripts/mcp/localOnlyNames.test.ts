import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// #1948: the shared tools answer on the hosted server too, which doesn't serve the local-only tools,
// so their answers must never point the assistant at one.
const LOCAL_ONLY = ['trip_time', 'combined_frequency'];

describe('shared MCP tool answers', () => {
  it('never name a tool only the local server serves', () => {
    const src = readFileSync(new URL('./tools.ts', import.meta.url), 'utf8');
    for (const name of LOCAL_ONLY) expect(src.includes(name), name).toBe(false);
  });
});
