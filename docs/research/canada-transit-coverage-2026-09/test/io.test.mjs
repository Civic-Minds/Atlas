import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { download, saveJson, withRetry } from '../src/io.mjs';
import { graph } from '../src/coverage.mjs';

const quiet = { wait: async () => {}, log: () => {} };
const refused = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });

test('withRetry backs off and succeeds after refused connections', async () => {
  const delays = []; let calls = 0;
  const value = await withRetry(async () => { if (++calls < 3) throw refused(); return 'ok'; }, { baseMs: 100, wait: async ms => delays.push(ms), log: () => {} });
  assert.equal(value, 'ok');
  assert.deepEqual(delays, [100, 200]);
});

test('withRetry gives up after the last attempt with the last error', async () => {
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw refused(); }, { attempts: 3, ...quiet }), /fetch failed/);
  assert.equal(calls, 3);
});

test('download retries and never leaves a partial file in place', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coverage-io-'));
  const path = join(dir, 'state.osm.pbf'); const body = 'x'.repeat(200_000); let calls = 0;
  const fetchImpl = async () => { if (++calls < 3) throw refused(); return new Response(body); };
  await download(path, 'https://example.test/state.osm.pbf', { fetchImpl, ...quiet });
  assert.equal(calls, 3);
  assert.equal((await stat(path)).size, body.length);
  await assert.rejects(stat(`${path}.partial`));
  // A failed download leaves nothing behind for the next run to mistake as complete.
  const failed = join(dir, 'failed.osm.pbf');
  await assert.rejects(download(failed, 'https://example.test/failed', { fetchImpl: async () => { throw refused(); }, attempts: 2, ...quiet }));
  await assert.rejects(stat(failed));
});

test('download skips a file that is already there', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coverage-io-'));
  const path = join(dir, 'state.osm.pbf'); await writeFile(path, 'y'.repeat(200_000));
  await download(path, 'https://example.test/x', { fetchImpl: async () => { throw new Error('should not fetch'); }, ...quiet });
});

test('saveJson streams a FeatureCollection that round-trips, and writes other values whole', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coverage-io-'));
  const collection = { type: 'FeatureCollection', name: 'blocks', features: Array.from({ length: 3 }, (_, i) => ({ type: 'Feature', properties: { GEOID: String(i), POP100: i * 10 }, geometry: { type: 'Point', coordinates: [i, i] } })) };
  await saveJson(join(dir, 'a.geojson'), collection);
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'a.geojson'), 'utf8')), collection);
  await saveJson(join(dir, 'empty.geojson'), { features: [] });
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'empty.geojson'), 'utf8')), { features: [] });
  await saveJson(join(dir, 'b', 'c.json'), { status: 'skipped' });
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'b', 'c.json'), 'utf8')), { status: 'skipped' });
});

test('walking graph indexes points per cell: shared points join, distinct points stay apart', () => {
  const line = coordinates => ({ type: 'Feature', geometry: { type: 'LineString', coordinates } });
  const g = graph({ features: [line([[0, 0], [0.005, 0], [0.015, 0]]), line([[0.005, 0], [0.005, 0.005]])] });
  assert.equal(g.nodes.length, 4);
  assert.equal(g.edges, 3);
  assert.equal(g.nodes[1].edges.length, 3);
  // No single map holds every point; each cell holds its own.
  assert.equal(g.cells.size, 2);
  assert.equal([...g.cells.values()].reduce((sum, bucket) => sum + bucket.size, 0), 4);
});
