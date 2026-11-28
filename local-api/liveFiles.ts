/**
 * Local only (CIV-2186; Ryan: "the polling happens in the cloud so why is anything happening on my Mac?"): where the local
 * Live endpoints read their route analysis files (`<slug>-<route>-segments.json`, `-gaps.json`, `<slug>-agency.json`).
 *
 * - **The cloud, by default.** The daily studio-live-refresh.yml builds every recorded agency's files (TTC included) and
 *   writes them to the private Live bucket (MCP_LIVE_BUCKET) under studio-live/runs/<run>/<slug>/, naming the current run
 *   per agency in studio-live/current.json (scripts/studioLiveRun.ts). This reads that pointer and the files it names
 *   with the READ-ONLY keys picked out of the main checkout's .env.local (mcp-coverage.ts mainCheckoutEnv: account,
 *   read-only key pair and bucket only; the write keys never enter this process). Nothing is written to disk: files are
 *   kept in memory per run, so a new run is read once.
 * - **A folder, only when asked.** Setting LIVE_SEGMENTS_DIR (a local same-zip comparison, or the endpoint tests) reads that
 *   folder instead, as before.
 *
 * Only names found in the pointer or the folder listing are ever read; nothing from a request reaches a key or a path.
 */
import { readFile, readdir, stat } from 'fs/promises';
import { resolve } from 'path';
import { privateBucket } from './privateBucket.js';
import { STUDIO_LIVE_POINTER, studioLiveRunPrefix, type StudioLivePointer } from '../scripts/studioLiveRun.js';

export interface LiveFiles {
  /** Every file name the source has. */
  list(): Promise<string[]>;
  /** A listed file's text; null when it isn't there. */
  read(name: string): Promise<string | null>;
  /** Changes whenever the file's contents may have (its run, or its modified time): for callers' own caches. */
  stamp(name: string): Promise<string | null>;
}

/** The folder source: LIVE_SEGMENTS_DIR's files. */
export function folderLiveFiles(dir: string): LiveFiles {
  const names = () => readdir(dir).catch(() => [] as string[]);
  return {
    list: names,
    read: async name => ((await names()).includes(name) ? readFile(resolve(dir, name), 'utf8').catch(() => null) : null),
    stamp: async name => ((await names()).includes(name) ? String((await stat(resolve(dir, name))).mtimeMs) : null),
  };
}

/** How long a read pointer is trusted before it is read again (the cloud writes it once a day). */
const POINTER_TTL_MS = 5 * 60_000;

/** The file names a pointer names, each with the object key it is read from and its run. */
export function pointerFiles(pointer: StudioLivePointer): Map<string, { key: string; run: string }> {
  const out = new Map<string, { key: string; run: string }>();
  for (const [slug, a] of Object.entries(pointer.agencies)) {
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    for (const f of a.files) if (/^[A-Za-z0-9-]+\.json$/.test(f)) out.set(f, { key: `${studioLiveRunPrefix(a.run)}${slug}/${f}`, run: a.run });
  }
  return out;
}

/** The cloud source over a reader of the private bucket. */
export function cloudLiveFiles(get: (key: string) => Promise<string | null>, now: () => number = Date.now): LiveFiles {
  let pointer: { at: number; files: Map<string, { key: string; run: string }> } | null = null;
  const texts = new Map<string, Promise<string | null>>();
  const files = async () => {
    if (!pointer || now() - pointer.at > POINTER_TTL_MS) {
      const raw = await get(STUDIO_LIVE_POINTER).catch(() => null);
      pointer = { at: now(), files: raw ? pointerFiles(JSON.parse(raw) as StudioLivePointer) : new Map() };
    }
    return pointer.files;
  };
  return {
    list: async () => [...(await files()).keys()],
    read: async name => {
      const f = (await files()).get(name);
      if (!f) return null;
      let t = texts.get(f.key);
      if (!t) { t = get(f.key).catch(() => null); texts.set(f.key, t); t.then(v => { if (v == null) texts.delete(f.key); }); }
      return t;
    },
    stamp: async name => (await files()).get(name)?.run ?? null,
  };
}

let shared: LiveFiles | null = null;

/** Tests and the old-vs-new check: use this source in place of the cloud (null goes back to the real one). */
export function setLiveFilesSource(source: LiveFiles | null): void { shared = source; }

/** The source every local Live endpoint reads: the folder when LIVE_SEGMENTS_DIR is set, else the cloud. */
export function liveFiles(): LiveFiles {
  const dir = process.env.LIVE_SEGMENTS_DIR;
  if (dir) return folderLiveFiles(resolve(dir));
  if (shared) return shared;
  // CIV-2914: no read-only keys throws (privateBucket), never an empty source that reads as "no files built".
  const bucket = privateBucket();
  shared = cloudLiveFiles(key => bucket.get(key));
  return shared;
}
