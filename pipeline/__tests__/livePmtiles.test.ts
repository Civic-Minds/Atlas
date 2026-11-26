import { describe, expect, it } from 'vitest';
import { livePmtilesUrl } from '../livePmtiles';

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('livePmtilesUrl (CIV-2995)', () => {
  it("reads the live release's tiles, never the root archive", async () => {
    expect(await livePmtilesUrl('https://data.example/', reply(200, { pmtilesKey: 'atlas/releases/release-x/atlas.pmtiles' })))
      .toBe('https://data.example/atlas/releases/release-x/atlas.pmtiles');
  });

  it('refuses a pointer without release tiles, or one it cannot read', async () => {
    await expect(livePmtilesUrl('https://data.example', reply(200, { pmtilesKey: 'atlas.pmtiles' }))).rejects.toThrow(/no release map tiles/);
    await expect(livePmtilesUrl('https://data.example', reply(404, {}))).rejects.toThrow(/could not be read \(404\)/);
  });
});
