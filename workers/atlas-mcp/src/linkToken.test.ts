import { describe, expect, it } from 'vitest';
import { linkToken } from './linkToken';

const T = 'abcdefghijklmnopqrstuvwxyz012345';
const read = (path: string, headers: Record<string, string> = {}) => {
  const url = new URL(`https://mcp.example${path}`);
  return linkToken(new Request(url, { method: 'POST', headers }), url);
};

describe('tester token from a link (CIV-1854: Copilot Studio documents header and query keys)', () => {
  it('reads the private link path', () => expect(read(`/t/${T}/mcp`)).toBe(T));
  it('reads a bearer header, an X-Api-Key header or a ?key= query on /mcp', () => {
    expect(read('/mcp', { Authorization: `Bearer ${T}` })).toBe(T);
    expect(read('/mcp', { 'X-Api-Key': T })).toBe(T);
    expect(read(`/mcp?key=${T}`)).toBe(T);
  });
  it('turns away /mcp with no token or a malformed one', () => {
    expect(read('/mcp')).toBe('');
    expect(read('/mcp?key=short')).toBe('');
    expect(read('/t/bad token/mcp')).toBe('');
  });
  it('leaves other paths alone', () => {
    expect(read('/health')).toBeUndefined();
    expect(read('/admin/testers')).toBeUndefined();
  });
});
