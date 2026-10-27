/**
 * Prints the agencies whose held timetable starts today or earlier (#1144), space-separated, for
 * refresh-held-feeds.yml to refresh. Prints nothing when none is due.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { heldFeedsDue } from '../pipeline/futureFeedHold.js';
import { agencyTodayYmd } from '../shared/feedAvailability.js';

const dir = 'config/agencies';
const agencies = readdirSync(dir)
  .filter(f => f.endsWith('.json') && f !== 'order.json')
  .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { slug: string; heldFeedStart?: string | null; timezone?: string | null });
process.stdout.write(heldFeedsDue(agencies, agencyTodayYmd).join(' '));
