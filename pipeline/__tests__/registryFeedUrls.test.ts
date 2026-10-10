import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isDatedMobilityDatabaseSnapshot,
  isRetiredMobilityDatabaseMirror,
} from '../feedSourceCandidates.js';

// Agencies still on a frozen source, each with the reason it was left in place.
// Remove an entry once its feed is moved to a stable URL.
const KNOWN_FROZEN_SOURCES: Record<string, string> = {
  metrostlouis: 'moving to the official metrostlouis.org feed in #610',
  'dc-streetcar': 'expired at MDB latest too; needs an official source',
  'fred-transit': 'MDB feed deprecated, successor has no latest.zip',
  glendalebeeline: 'MDB feed deprecated, successor has no latest.zip',
  'xpress-ga': 'expired at MDB latest too; needs an official source',
  grt: 'MDB feed deprecated, successor has no latest.zip',
  hocts: 'MDB feed inactive and expired',
  glensfallstransit: 'MDB latest.zip returns 403; feed folded into CDTA',
};

const root = resolve(__dirname, '../..');
const agencyDir = resolve(root, 'config/agencies');

function feedUrls(config: Record<string, unknown>): string[] {
  const urls: string[] = [];
  for (const key of ['feedUrl', 'mdbFeedUrl']) {
    if (typeof config[key] === 'string') urls.push(config[key] as string);
  }
  for (const key of ['supplementalFeedUrls', 'feedFallbackUrls']) {
    const list = config[key];
    if (Array.isArray(list)) urls.push(...list.filter((url): url is string => typeof url === 'string'));
  }
  return urls;
}

describe('agency registry feed URLs', () => {
  it('never point at the retired MDB mirror or a dated MDB snapshot (#627, #629)', () => {
    const offenders: string[] = [];
    for (const name of readdirSync(agencyDir)) {
      if (!name.endsWith('.json')) continue;
      const config = JSON.parse(readFileSync(resolve(agencyDir, name), 'utf8'));
      if (Array.isArray(config) || !config.slug || config.slug in KNOWN_FROZEN_SOURCES) continue;
      for (const url of feedUrls(config)) {
        if (isRetiredMobilityDatabaseMirror(url) || isDatedMobilityDatabaseSnapshot(url)) {
          offenders.push(`${config.slug}: ${url}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
