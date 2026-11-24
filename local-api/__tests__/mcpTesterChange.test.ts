import { describe, expect, it } from 'vitest';
import { change } from '../mcp-testers';
import { MCP_TESTERS_CHANGE_HEADER } from '../../shared/mcpTesters';

const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const ask = (query: string, headers: Record<string, string> = { [MCP_TESTERS_CHANGE_HEADER]: '1', origin: 'http://localhost:5182' }) =>
  new Request(`http://localhost:5001/api/mcp-testers?${query}`, { method: 'POST', headers });

// CIV-2202: the MCP page makes and stops tester links through the local API; the admin token stays in that process.
describe('making and stopping tester links through the local API', () => {
  it('makes a link and gives back only its name and link', async () => {
    const sent: Array<[string, unknown]> = [];
    const res = await change(ask('make=Ada%20L'), async (path, body) => {
      sent.push([path, body]);
      return reply(201, { name: 'Ada L', link: 'https://pilot.example/t/abc/mcp', note: 'Shown once.' });
    });
    expect(sent).toEqual([['/admin/testers', { name: 'Ada L' }]]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ada L', link: 'https://pilot.example/t/abc/mcp' });
  });

  it('stops a link, with the name encoded in the path', async () => {
    const sent: string[] = [];
    const res = await change(ask('stop=Ada%2FL'), async path => { sent.push(path); return reply(200, { revoked: true }); });
    expect(sent).toEqual(['/admin/testers/Ada%2FL/revoke']);
    expect(await res.json()).toEqual({ revoked: true });
  });

  it('passes on the server’s refusal, such as a name already used', async () => {
    const res = await change(ask('make=Ada'), async () => reply(409, { error: 'A tester named "Ada" already exists.' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'A tester named "Ada" already exists.' });
  });

  it('refuses a change without the page’s header, or from another site, and never asks the server', async () => {
    let asked = 0;
    const post = async () => { asked++; return reply(201, { name: 'x', link: 'y' }); };
    expect((await change(ask('make=Ada', { origin: 'http://localhost:5182' }), post)).status).toBe(403);
    expect((await change(ask('make=Ada', { [MCP_TESTERS_CHANGE_HEADER]: '1', origin: 'https://evil.example' }), post)).status).toBe(403);
    expect(asked).toBe(0);
  });
});
