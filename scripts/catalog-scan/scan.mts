// Runs the pipeline of a checkout (<tree>) over local feed zips and writes one summary JSON per
// agency to <outDir>, for diff.py and report.py to compare two checkouts. See README.md.
// usage: cd <tree> && npx tsx scan.mts <tree> <slugsFile> <outDir> <zipsRoot>
//   <zipsRoot>/<slug>/*.zip (newest by mtime), supplemental feeds in <zipsRoot>/<slug>--supplemental-<n>/
//   An agency whose <outDir>/<slug>.json exists is skipped, so a stopped scan resumes.
//   TRACE_ALL=1 keeps every pipeline trace entry.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [tree, slugsFile, outDir, zipsRoot] = process.argv.slice(2);
if (!tree || !slugsFile || !outDir || !zipsRoot) { console.error('usage: npx tsx scan.mts <tree> <slugsFile> <outDir> <zipsRoot>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const feeds = await import(pathToFileURL(`${tree}/pipeline/agencyFeeds.ts`).href);
const h = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12);
function newestZip(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const zips = readdirSync(dir).filter(f => f.endsWith('.zip')).map(f => `${dir}/${f}`);
  if (!zips.length) return null;
  return zips.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}
const BIG = new Set(['stopOrder', 'stopPositions', 'stopHeadways', 'stopPeriodHeadways', 'stopPeriodCoverageHeadways', 'headwayByHour', 'maxGapByHour', 'stopPeriodSustained', 'stopPeriodMaxGaps']);
function summarizeLine(f: any) {
  const p = f.properties, out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (BIG.has(k)) out[k] = Array.isArray(v) ? { n: v.length, first: v[0], last: v[v.length - 1], h: h(v) } : { h: h(v) };
    else out[k] = v;
  }
  const c = f.geometry?.coordinates;
  out.__geom = f.geometry ? { type: f.geometry.type, n: Array.isArray(c) ? c.length : 0, h: h(c), first: Array.isArray(c) ? c[0] : null, last: Array.isArray(c) ? c[c.length - 1] : null } : null;
  return out;
}
for (const slug of readFileSync(slugsFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)) {
  const outPath = `${outDir}/${slug}.json`;
  if (existsSync(outPath)) continue;
  const t0 = Date.now();
  const rec: any = { slug, tree };
  try {
    const cfg = JSON.parse(readFileSync(`${tree}/config/agencies/${slug}.json`, 'utf8'));
    const zip = newestZip(`${zipsRoot}/${slug}`);
    if (!zip) throw new Error('no zip');
    rec.zip = zip;
    const supp = (cfg.supplementalFeedUrls ?? []).map((url: string, i: number) => {
      const z = newestZip(`${zipsRoot}/${slug}--supplemental-${i + 1}`);
      if (!z) throw new Error(`missing supplemental ${i + 1}`);
      return { url, buf: readFileSync(z) };
    });
    (globalThis as any).__trace = []; (globalThis as any).__traceAll = process.env.TRACE_ALL === "1";
    const r = await feeds.processAgencyFeeds(readFileSync(zip), supp, cfg, {}, () => {});
    rec.trace = (globalThis as any).__trace;
    const fc = JSON.parse(r.geojson);
    const lines: Record<string, unknown> = {}; const seen = new Map<string, number>();
    let stops = 0; const stopHashes: string[] = [];
    for (const f of fc.features) {
      const p = f.properties;
      if (p.stopId != null) { stops++; stopHashes.push(h([p, f.geometry])); continue; }
      let key = `${p.routeId}|${p.directionId}|${p.day}|${p.headsign ?? ''}|${p.routeVariant ?? ''}|${p.routeBranch ?? ''}`;
      const n = (seen.get(key) ?? 0) + 1; seen.set(key, n); if (n > 1) key += `|#${n}`;
      lines[key] = summarizeLine(f);
    }
    rec.ok = true; rec.featureCount = r.featureCount; rec.lineCount = Object.keys(lines).length; rec.lines = lines;
    rec.stops = { n: stops, h: h(stopHashes.sort()) };
    const cz = JSON.parse(r.corridorsGeojson); rec.corridors = { n: cz.features.length, h: h(cz) };
    rec.stopsJson = { h: h(r.stopsJson) }; rec.tripsJson = { h: h(r.tripsJson) };
    rec.feedExpiry = r.feedExpiry;
  } catch (e: any) {
    rec.ok = false; rec.error = String(e?.message ?? e).slice(0, 400);
  }
  rec.ms = Date.now() - t0;
  writeFileSync(outPath, JSON.stringify(rec));
  console.log(`${slug} ${rec.ok ? 'ok' : 'ERR ' + rec.error} ${rec.ms}ms lines=${rec.lineCount ?? '-'} trace=${rec.trace?.length ?? 0}`);
}
