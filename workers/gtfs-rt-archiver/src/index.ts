/**
 * atlas-gtfs-rt-archiver
 *
 * Runs every 5 minutes. Fetches the GTFS-RT TripUpdates feed for each
 * configured agency and writes the raw protobuf binary to R2 at:
 *   atlas-live/{slug}/{YYYY-MM-DD}/{unix-seconds}.pb
 *
 * No parsing happens here — analysis runs later against the stored files.
 */

interface Env {
  BUCKET: R2Bucket;
}

const FEEDS: { slug: string; url: string }[] = [
  { slug: 'burlington', url: 'https://opendata.burlington.ca/gtfs-rt/GTFS_TripUpdates.pb' },
  { slug: 'hamilton',   url: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_TripUpdates.pb' },
];

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);          // YYYY-MM-DD
    const ts = Math.floor(now.getTime() / 1000);          // unix seconds

    const results = await Promise.allSettled(
      FEEDS.map(async ({ slug, url }) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const key = `${slug}/${date}/${ts}.pb`;
        await env.BUCKET.put(key, buf, { httpMetadata: { contentType: 'application/octet-stream' } });
        return `${slug}: ${buf.byteLength} bytes → ${key}`;
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') console.log(r.value);
      else console.error(r.reason);
    }
  },
};
