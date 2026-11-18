/**
 * Reads the MCP's ready-made JSON files from a folder laid out like the published ones (the split release, or the private
 * Live bucket's dry run): the local server's stand-in for the hosted Worker's readers (CIV-1864). Null for a missing file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function folderReader(dir: string): (path: string) => Promise<unknown | null> {
  return async path => { const f = join(dir, path); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
}
