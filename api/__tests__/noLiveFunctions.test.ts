import { readdirSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// Every file in api/ deploys as a public Vercel function. Live and realtime endpoints (feed proxies,
// the atlas-live archive readers and their helpers) stay in local-api/, served only by
// api-dev-server.ts, until Live ships. Deploying them would reopen the cost and abuse risk closed in #867.
describe('deployed api/ functions', () => {
  it('include no Live or realtime endpoints', () => {
    const files = readdirSync(join(__dirname, '..')).filter(f => f.endsWith('.ts'));
    const live = files.filter(f => /^live|history-adherence|^concurrency/.test(f));
    expect(live).toEqual([]);
  });
});
