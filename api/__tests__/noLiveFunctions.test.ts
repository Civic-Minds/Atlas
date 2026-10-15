import { readdirSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// Every file in api/ deploys as a public Vercel function. Live's analysis endpoints read the
// atlas-live archive and local files, so they stay in local-api/ (served only by api-dev-server.ts)
// until Live ships: deploying them would reopen the cost and abuse risk closed in #867.
describe('deployed api/ functions', () => {
  it('include no Live analysis endpoints', () => {
    const files = readdirSync(join(__dirname, '..')).filter(f => f.endsWith('.ts'));
    const live = files.filter(f => /^live-/.test(f) && f !== 'live-vehicles.ts');
    expect(live).toEqual([]);
  });
});
