/**
 * CIV-2894 (Ryan, 2026-11-24): the Live page's vehicles from the cloud recorder (CIV-2073 v2 snapshots), so /apps/live
 * needs nothing running on the Mac. One read-only route, /live/vehicles?agency=<slug>, for recorded agencies only: the
 * same reading local-api gives (fromRecorder over shared/liveSource.ts), read only through the atlas-live binding, with
 * CORS for Atlas's own sites and localhost (shared/liveCloud.ts). Nothing here writes anywhere.
 */
import { fromRecorder } from '../../../local-api/live-vehicles';
import liveSegments from '../../../local-api/live-segments';
import liveDashboard from '../../../local-api/live-dashboard';
import liveRecent from '../../../local-api/live-recent';
import liveAgency from '../../../local-api/live-agency';
import liveGaps from '../../../local-api/live-gaps';
import liveStop from '../../../local-api/live-stop';
import { cloudLiveFiles, setLiveFilesSource } from '../../../local-api/liveFiles';
import { LIVE_NETWORK_COUNT_PATH, liveCloudServes, liveCloudServesVehicles, liveVehiclesCorsOrigin } from '../../../shared/liveCloud';
import { bucketNowSource, useNowSource } from '../../../scripts/mcp/liveNowData';
import { setAgencyNameLookup } from '../../../local-api/agencyName';
import { checkMcpRelease } from '../../../shared/mcpRelease';
import { splitStore, urlReader } from '../../../shared/mcpSplitStore';
import { R2_PUBLIC_URL } from '../../../shared/config';
import { RECORDER_SLUGS } from '../../../shared/liveArchiveFeeds';
import { networkCountAnswer } from '../../../shared/liveNetworkCount';
import { latestSnapshot } from '../../../shared/liveSource';
import { liveRecorderFeed } from '../../../shared/liveRecorderFeeds';

// Agency names for the handlers' sentences ("TTC 7 is held back"), from the current release's catalog, the one the MCP
// reads: the Worker has no config/agencies folder. Read once per isolate; a failed read is tried again next time.
let catalogNames: Promise<Map<string, string>> | null = null;
setAgencyNameLookup(async slug => {
  catalogNames ??= (async () => {
    const check = await checkMcpRelease(R2_PUBLIC_URL);
    if (check.kind !== 'ready') throw new Error('no release');
    return new Map((await splitStore(urlReader(check.base)).catalog()).map(a => [a.slug, a.name]));
  })().catch(e => { catalogNames = null; throw e; });
  return (await catalogNames).get(slug) ?? null;
});

/** LIVE_ARCHIVE: the recorder (atlas-live). MCP_LIVE: the daily Live analysis files (atlas-mcp-live, studio-live/). Both read only. */
interface Env { LIVE_ARCHIVE: R2Bucket; MCP_LIVE: R2Bucket }

/** CIV-2914: the Live card's own reads, served by local-api's handlers so the answers are the same; agency-gated here too. */
const ROUTE_HANDLERS: Record<string, { fetch: (req: Request) => Promise<Response> }> = {
  '/live/segments': liveSegments,
  '/live/dashboard': liveDashboard,
  '/live/recent': liveRecent,
  '/live/agency': liveAgency,
  '/live/gaps': liveGaps,
  // A stop's next arrivals, read from the agency's own feed; its key (if any) is a Worker secret, read via process.env.
  '/live/stop': liveStop,
};
let boundFiles: R2Bucket | undefined;

/**
 * CIV-2939: the latest whole-network vehicle count the recorder saved for an agency (Fleet's "In service now"), from its
 * newest snapshot (LiveSnapshotV2.networkVehicles). Read only. Served for agencies Live shows (CIV-1716, as every route
 * here): Kingston's count is recorded too, but this public reader never serves an analysis-only agency.
 */
export const NETWORK_COUNT_PATH = LIVE_NETWORK_COUNT_PATH;
async function networkCount(bucket: R2Bucket, agency: string, cors: Record<string, string>, nowSec = Math.floor(Date.now() / 1000)): Promise<Response> {
  const feed = RECORDER_SLUGS.includes(agency) && liveCloudServesVehicles(agency) ? liveRecorderFeed(agency) : null;
  if (!feed) return json({ error: 'Atlas does not record this agency.' }, 404, cors);
  const cache = { ...cors, 'Cache-Control': 'public, max-age=0, s-maxage=30' };
  const store = async (key: string) => { const obj = await bucket.get(key); return obj ? new Uint8Array(await obj.arrayBuffer()) : null; };
  const answer = networkCountAnswer(await latestSnapshot(store, agency, nowSec, feed.paceSec), nowSec);
  return answer ? json(answer, 200, cache) : json({ error: 'The recorder has no recent count for this agency.' }, 404, cache);
}

let bound: R2Bucket | undefined;
const json = (body: unknown, status: number, headers: Record<string, string>) => Response.json(body, { status, headers });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = liveVehiclesCorsOrigin(request.headers.get('Origin'));
    const cors: Record<string, string> = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const handler = ROUTE_HANDLERS[url.pathname];
    const counting = url.pathname === NETWORK_COUNT_PATH;
    if (url.pathname !== '/live/vehicles' && !handler && !counting) return json({ error: 'Not found' }, 404, cors);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'GET') return json({ error: 'Not found' }, 404, cors);
    const agency = url.searchParams.get('agency') ?? '';
    if (counting) return networkCount(env.LIVE_ARCHIVE, agency, cors);
    // CIV-2914 (CIV-1716): only agencies Live shows; an analysis-only agency (Kingston) is never served, whatever the files hold.
    if (!(handler ? liveCloudServes(agency) : liveCloudServesVehicles(agency))) return json({ error: 'Live has no cloud recording for this agency.' }, 404, cors);
    if (env.LIVE_ARCHIVE !== bound) { bound = env.LIVE_ARCHIVE; useNowSource(bucketNowSource(bound)); }
    if (handler) {
      if (env.MCP_LIVE !== boundFiles) { boundFiles = env.MCP_LIVE; setLiveFilesSource(cloudLiveFiles(async key => (await boundFiles!.get(key))?.text() ?? null)); }
      // The visitor's address, so the handlers' per-visitor rate limit counts each visitor, not the Worker.
      const ip = request.headers.get('CF-Connecting-IP');
      const res = await handler.fetch(new Request(`http://localhost/api${url.pathname.slice('/live'.length).replace(/^\//, '/live-')}${url.search}`, { headers: ip ? { 'x-real-ip': ip } : {} }));
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    }
    try {
      const answer = await fromRecorder(agency);
      if (!answer) return json({ error: 'The cloud recording has no recent snapshot for this agency.', reason: 'timeout' }, 502, { ...cors, 'Cache-Control': 'public, max-age=0, s-maxage=5' });
      const headers = new Headers(answer.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(answer.body, { status: answer.status, headers });
    } catch (e) {
      console.error(JSON.stringify({ agency, error: e instanceof Error ? e.message : String(e) }));
      return json({ error: 'Something went wrong on our side.' }, 500, cors);
    }
  },
};
