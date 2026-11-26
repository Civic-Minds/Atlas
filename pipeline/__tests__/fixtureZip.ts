import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';

const zips = new Map<string, Promise<Buffer>>();

/**
 * A GTFS fixture folder as a zip, built once per folder per test file (CIV-2976 T3: six tests pasted this and re-zipped
 * on every call). Callers only read the buffer.
 */
export function zipDir(dir: string): Promise<Buffer> {
  const key = resolve(dir);
  let zip = zips.get(key);
  if (!zip) {
    const z = new JSZip();
    for (const file of readdirSync(key)) z.file(file, readFileSync(join(key, file)));
    zip = z.generateAsync({ type: 'nodebuffer' });
    zips.set(key, zip);
  }
  return zip;
}
