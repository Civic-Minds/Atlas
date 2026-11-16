/** Loads shared/liveAgencyConfig for a slug, with the timezone from config/agencies/<slug>.json (Node only). */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { liveAgencyConfig, type LiveAgencyConfig } from '../shared/liveAgencyConfig.js';

const CONFIG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'agencies');

export function loadLiveAgencyConfig(slug: string, configDir = CONFIG_DIR): LiveAgencyConfig {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`live agency: bad slug ${JSON.stringify(slug)}`);
  const path = join(configDir, `${slug}.json`);
  if (!existsSync(path)) throw new Error(`live agency ${slug}: no ${path}`);
  const agency = JSON.parse(readFileSync(path, 'utf8')) as { timezone?: string };
  return liveAgencyConfig(slug, agency.timezone);
}
