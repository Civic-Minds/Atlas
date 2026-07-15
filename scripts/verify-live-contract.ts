const baseUrl = (process.env.ATLAS_URL ?? 'https://atlas-gamma-two.vercel.app').replace(/\/$/, '');
const agency = process.env.ATLAS_AGENCY ?? 'ttc';
const end = Math.floor(Date.now() / 1000);
const start = end - 60 * 60;

interface ProviderResponse {
  schemaVersion?: string;
  status?: string;
  ageSeconds?: number;
  records?: unknown[];
  snapshots?: unknown[];
  error?: string;
}

async function read(path: string): Promise<{ response: Response; body: ProviderResponse }> {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(15_000) });
  let body: ProviderResponse;
  try {
    body = await response.json() as ProviderResponse;
  } catch {
    throw new Error(`${path} returned non-JSON (${response.status})`);
  }
  return { response, body };
}

try {
  const snapshot = await read(`/api/live-snapshot?agency=${encodeURIComponent(agency)}&feed=vehicles`);
  if (!snapshot.response.ok || snapshot.body.schemaVersion !== 'atlas.live.v1' || snapshot.body.status === 'unavailable') {
    throw new Error(`snapshot gate failed: HTTP ${snapshot.response.status}, status=${snapshot.body.status ?? 'unknown'}, error=${snapshot.body.error ?? 'none'}`);
  }

  const replay = await read(`/api/live-replay?agency=${encodeURIComponent(agency)}&feed=vehicles&start=${start}&end=${end}&limit=10`);
  if (!replay.response.ok || replay.body.schemaVersion !== 'atlas.live.v1' || !(replay.body.snapshots?.length)) {
    throw new Error(`replay gate failed: HTTP ${replay.response.status}, snapshots=${replay.body.snapshots?.length ?? 0}, error=${replay.body.error ?? 'none'}`);
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    agency,
    snapshotStatus: snapshot.body.status,
    snapshotAgeSeconds: snapshot.body.ageSeconds ?? null,
    vehicleRecords: snapshot.body.records?.length ?? 0,
    replaySnapshots: replay.body.snapshots.length,
  }, null, 2));
} catch (error) {
  console.error(`Atlas live contract verification failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
