import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTokenEnv } from '../mcp/liveNowData';

describe("route_now's read-only token (CIV-1870)", () => {
  const file = join(mkdtempSync(join(tmpdir(), 'mcp-read-')), 'token.env');
  writeFileSync(file, '# comment\nATLAS_MCP_R2_READ_ACCOUNT_ID=acct\nexport ATLAS_MCP_R2_READ_KEY_ID="kid"\nATLAS_MCP_R2_READ_SECRET=sec\nR2_SECRET_ACCESS_KEY=write-key\n');

  it('takes the three read-only values from the credentials file, and nothing else from it', () => {
    const e = readTokenEnv({}, file);
    expect([e.ATLAS_MCP_R2_READ_ACCOUNT_ID, e.ATLAS_MCP_R2_READ_KEY_ID, e.ATLAS_MCP_R2_READ_SECRET]).toEqual(['acct', 'kid', 'sec']);
    expect(e.R2_SECRET_ACCESS_KEY).toBeUndefined();
  });
  it('keeps values already in the environment, and does without a file', () => {
    const set = { ATLAS_MCP_R2_READ_ACCOUNT_ID: 'a', ATLAS_MCP_R2_READ_KEY_ID: 'b', ATLAS_MCP_R2_READ_SECRET: 'c' };
    expect(readTokenEnv(set, file)).toEqual(set);
    expect(readTokenEnv({}, join(tmpdir(), 'no-such-file.env'))).toEqual({});
  });
});
