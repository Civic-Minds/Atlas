/**
 * CIV-2894 (Ryan, 2026-11-24): the Live page's vehicles from the cloud recorder (CIV-2073 v2 snapshots), so /apps/live
 * needs nothing running on the Mac. One read-only route, /live/vehicles?agency=<slug>, for recorded agencies only: the
 * same reading local-api gives (fromRecorder over shared/liveSource.ts), read only through the atlas-live binding, with
 * CORS for Atlas's own sites and localhost (shared/liveCloud.ts). Nothing here writes anywhere.
 */
import { fromRecorder } from '../../../local-api/live-vehicles';
import { RECORDER_SLUGS } from '../../../shared/liveArchiveFeeds';
import { liveVehiclesCorsOrigin } from '../../../shared/liveCloud';
import { bucketNowSource, useNowSource } from '../../../scripts/mcp/liveNowData';

interface Env { LIVE_ARCHIVE: R2Bucket }

let bound: R2Bucket | undefined;
const json = (body: unknown, status: number, headers: Record<string, string>) => Response.json(body, { status, headers });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = liveVehiclesCorsOrigin(request.headers.get('Origin'));
    const cors: Record<string, string> = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    if (url.pathname !== '/live/vehicles') return json({ error: 'Not found' }, 404, cors);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'GET') return json({ error: 'Not found' }, 404, cors);
    const agency = url.searchParams.get('agency') ?? '';
    if (!RECORDER_SLUGS.includes(agency)) return json({ error: 'Live has no cloud recording for this agency.' }, 404, cors);
    if (env.LIVE_ARCHIVE !== bound) { bound = env.LIVE_ARCHIVE; useNowSource(bucketNowSource(bound)); }
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
