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
import { cloudLiveFiles, setLiveFilesSource } from '../../../local-api/liveFiles';
import { liveCloudServes, liveCloudServesVehicles, liveVehiclesCorsOrigin } from '../../../shared/liveCloud';
import { bucketNowSource, useNowSource } from '../../../scripts/mcp/liveNowData';

/** LIVE_ARCHIVE: the recorder (atlas-live). MCP_LIVE: the daily Live analysis files (atlas-mcp-live, studio-live/). Both read only. */
interface Env { LIVE_ARCHIVE: R2Bucket; MCP_LIVE: R2Bucket }

/** CIV-2914: the Live card's own reads, served by local-api's handlers so the answers are the same; agency-gated here too. */
const ROUTE_HANDLERS: Record<string, { fetch: (req: Request) => Promise<Response> }> = {
  '/live/segments': liveSegments,
  '/live/dashboard': liveDashboard,
  '/live/recent': liveRecent,
  '/live/agency': liveAgency,
  '/live/gaps': liveGaps,
};
let boundFiles: R2Bucket | undefined;

let bound: R2Bucket | undefined;
const json = (body: unknown, status: number, headers: Record<string, string>) => Response.json(body, { status, headers });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = liveVehiclesCorsOrigin(request.headers.get('Origin'));
    const cors: Record<string, string> = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const handler = ROUTE_HANDLERS[url.pathname];
    if (url.pathname !== '/live/vehicles' && !handler) return json({ error: 'Not found' }, 404, cors);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'GET') return json({ error: 'Not found' }, 404, cors);
    const agency = url.searchParams.get('agency') ?? '';
    // CIV-2914 (CIV-1716): only agencies Live shows; an analysis-only agency (Kingston) is never served, whatever the files hold.
    if (!(handler ? liveCloudServes(agency) : liveCloudServesVehicles(agency))) return json({ error: 'Live has no cloud recording for this agency.' }, 404, cors);
    if (env.LIVE_ARCHIVE !== bound) { bound = env.LIVE_ARCHIVE; useNowSource(bucketNowSource(bound)); }
    if (handler) {
      if (env.MCP_LIVE !== boundFiles) { boundFiles = env.MCP_LIVE; setLiveFilesSource(cloudLiveFiles(async key => (await boundFiles!.get(key))?.text() ?? null)); }
      const res = await handler.fetch(new Request(`http://localhost/api${url.pathname.slice('/live'.length).replace(/^\//, '/live-')}${url.search}`));
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
