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
      if (attempt === attempts || error?.permanent) break;
      const delay = baseMs * 2 ** (attempt - 1);
      log(`${label} failed (attempt ${attempt} of ${attempts}: ${error?.cause?.code ?? error?.message ?? error}); retrying in ${Math.round(delay / 1000)} s`);
      await wait(delay);
    }
  }
  throw lastError;
}

export const USER_AGENT = 'Atlas coverage study (github.com/Civic-Minds/Atlas)';

// Downloads to a temporary file and renames it into place, so a dropped connection never
// leaves a partial file that a later run would take as complete. A 4xx answer is final (the
// file isn't there), so it is not retried.
export async function download(path, url, { fetchImpl = fetch, ...retry } = {}) {
  try { const info = await stat(path); if (info.size > 100_000) return; } catch {}
  await mkdir(resolve(path, '..'), { recursive: true });
  const partial = `${path}.partial`;
  await withRetry(async () => {
    const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok || !response.body) throw Object.assign(new Error(`${response.status} ${url}`), { permanent: response.status >= 400 && response.status < 500 });
    try { await pipeline(Readable.fromWeb(response.body), createWriteStream(partial)); } catch (error) { await rm(partial, { force: true }); throw error; }
  }, { label: `Download ${url}`, ...retry });
  await rename(partial, path);
}

// Tries each source in order ({ path, url, attempts }), each with its own retries, and returns
// the first that downloads. Used for Geofabrik first, then the openstreetmap.fr mirror
// (Geofabrik refused GitHub's runners on the CIV-1179 cloud runs).
export async function downloadFirst(sources, { log = console.warn, ...options } = {}) {
  let lastError;
  for (const source of sources) {
    try { await download(source.path, source.url, { ...options, log, attempts: source.attempts ?? options.attempts }); return source; } catch (error) {
      lastError = error;
      log(`Giving up on ${source.url} (${error?.cause?.code ?? error?.message ?? error})`);
    }
  }
  throw lastError ?? new Error('No download sources');
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
