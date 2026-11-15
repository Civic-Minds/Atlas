import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const sleep = ms => new Promise(done => setTimeout(done, ms));

// Retries a flaky outside call (Geofabrik refused connections on the CIV-1179 cloud run) with
// exponential backoff: delays of baseMs, 2×, 4×, … between attempts.
export async function withRetry(task, { attempts = 6, baseMs = 10_000, label = 'request', wait = sleep, log = console.warn } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await task(attempt); } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = baseMs * 2 ** (attempt - 1);
      log(`${label} failed (attempt ${attempt} of ${attempts}: ${error?.cause?.code ?? error?.message ?? error}); retrying in ${Math.round(delay / 1000)} s`);
      await wait(delay);
    }
  }
  throw lastError;
}

// Downloads to a temporary file and renames it into place, so a dropped connection never
// leaves a partial file that a later run would take as complete.
export async function download(path, url, { fetchImpl = fetch, ...retry } = {}) {
  try { const info = await stat(path); if (info.size > 100_000) return; } catch {}
  await mkdir(resolve(path, '..'), { recursive: true });
  const partial = `${path}.partial`;
  await withRetry(async () => {
    const response = await fetchImpl(url);
    if (!response.ok || !response.body) throw new Error(`${response.status} ${url}`);
    try { await pipeline(Readable.fromWeb(response.body), createWriteStream(partial)); } catch (error) { await rm(partial, { force: true }); throw error; }
  }, { label: `Download ${url}`, ...retry });
  await rename(partial, path);
}

// Writes JSON without building the whole text in memory. A FeatureCollection is written one
// feature at a time, because four states of block groups exceed V8's string limit
// ("Invalid string length", CIV-1179). Other values are small and written whole.
export async function saveJson(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const out = createWriteStream(path);
  const write = text => (out.write(text) ? Promise.resolve() : new Promise(done => out.once('drain', done)));
  const finished = new Promise((done, fail) => { out.on('finish', done); out.on('error', fail); });
  if (value && Array.isArray(value.features)) {
    const { features, ...rest } = value;
    const head = JSON.stringify(rest);
    await write(`${head.slice(0, -1)}${head.length > 2 ? ',' : ''}"features":[`);
    for (let i = 0; i < features.length; i++) await write(`${i ? ',' : ''}\n${JSON.stringify(features[i])}`);
    await write('\n]}\n');
  } else {
    await write(`${JSON.stringify(value, null, 2)}\n`);
  }
  out.end();
  await finished;
}
