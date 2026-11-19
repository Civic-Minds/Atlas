import fs from 'node:fs';
const root = process.argv[2];
// ---- stopPools.ts: wrap pooledReadingInWindow
let p = `${root}/pipeline/stopPools.ts`, s = fs.readFileSync(p, 'utf8');
if (!/typicalOfGaps/.test(s.split('\n').find(l => l.includes("from './headway-utils.js'")))) s = s.replace("import { BUNCHED_DEPARTURE_MINUTES,", "import { typicalOfGaps as __typicalOfGaps, BUNCHED_DEPARTURE_MINUTES,");
const tog = /typicalOfGaps as __typicalOfGaps/.test(s) ? '__typicalOfGaps' : 'typicalOfGaps';
s = s.replace('export function pooledReadingInWindow(', 'function pooledReadingInWindowImpl(');
s += `
import { appendFileSync as __apf, writeFileSync as __wf } from 'node:fs';
import { createHash as __ch } from 'node:crypto';
const __h = __ch('sha256'); let __calls = 0, __allDay = 0, __diff = 0;
const __out = process.env.PROBE_OUT ?? '/dev/null';
process.on('exit', () => { try { __wf(__out + '.digest.json', JSON.stringify({ calls: __calls, allDayCalls: __allDay, flips: __diff, inputsDigest: __h.digest('hex') })); } catch {} });
export function pooledReadingInWindow(times: readonly number[], start: number, end: number, minDeps = 3, allDay = false, own?: readonly number[]): { value: number | null; worstWait: number | null } {
  const r = pooledReadingInWindowImpl(times, start, end, minDeps, allDay, own);
  __calls++; if (allDay) __allDay++;
  const inWindow = collapseBunched(departuresInWindow(times, start, end, true));
  const ownSorted = own ? departuresInWindow(own, start, end, true) : [];
  __h.update(JSON.stringify([inWindow, ownSorted, start, end, minDeps, allDay]));
  if (inWindow.length < minDeps) return r;
  const typical = allDay ? sustainedMedianHeadwayInWindow(inWindow, start, end, minDeps, undefined, true) : medianHeadwayInWindow(inWindow, start, end, minDeps, true);
  if (typical == null || inWindow.length < 2) return r;
  const mean = (inWindow[inWindow.length - 1] - inWindow[0]) / (inWindow.length - 1);
  let longest = 0; for (let i = 1; i < inWindow.length; i++) longest = Math.max(longest, inWindow[i] - inWindow[i - 1]);
  const ownValue = ownSorted.length >= minDeps ? (allDay ? sustainedMedianHeadwayInWindow(ownSorted, start, end, minDeps, undefined, true) : medianHeadwayInWindow(ownSorted, start, end, minDeps, true)) : null;
  const floored = Math.max(typical, Math.round(mean));
  const value = ownValue != null ? Math.min(floored, ownValue) : floored;
  const gaps = (l: readonly number[]) => l.slice(1).map((t, i) => t - l[i]);
  const exactTyp = ${tog}(gaps(inWindow), allDay);
  const exactFloored = Math.max(exactTyp, mean);
  const ownExact = ownSorted.length >= 2 ? ${tog}(gaps(ownSorted), allDay) : null;
  const exactValue = ownValue != null ? Math.min(exactFloored, ownExact ?? exactFloored) : exactFloored;
  const lim1 = Math.max(POOLED_MAX_GAP_RATIO * mean, Math.round(mean) + POOLED_MAX_GAP_GRACE_MINUTES);
  const limOld = Math.max(POOLED_MAX_GAP_TYPICAL_RATIO * value, value + POOLED_MAX_GAP_GRACE_MINUTES);
  const limNew = Math.max(POOLED_MAX_GAP_TYPICAL_RATIO * exactValue, value + POOLED_MAX_GAP_GRACE_MINUTES);
  const refusedOld = longest > lim1 || longest > limOld;
  const refusedNew = longest > lim1 || longest > limNew;
  const actualRefused = r.value == null;
  if (refusedOld !== refusedNew || process.env.PROBE_ALL === '1' || (process.env.PROBE_ROUTE && ((globalThis as any).__ctx ?? {}).route === process.env.PROBE_ROUTE)) {
    __diff++;
    const c = (globalThis as any).__ctx ?? {};
    __apf(__out, JSON.stringify({ seq: __calls, ctx: { ...c }, stack: new Error().stack?.split('\\n').slice(2, 9).map(x => x.trim().replace(/^at /, '').replace(/\\(.*\\/pipeline\\//, '(')), start, end, allDay, minDeps, inWindow, ownSorted, typical, exactTyp, mean, longest, ownValue, ownExact, value, exactValue, lim1, limOld, limNew, refusedOld, refusedNew, actualRefused, outValue: r.value, outWorstWait: r.worstWait }) + '\\n');
  }
  return r;
}
`;
fs.writeFileSync(p, s);
// ---- process-core.ts: context
p = `${root}/pipeline/process-core.ts`; s = fs.readFileSync(p, 'utf8');
const a = "for (const [feature, { shortName, dirId, day }] of featureStopHeadwaySlots) {\n";
if (!s.includes(a)) throw new Error('loop head not found');
{ const i = s.lastIndexOf(a); s = s.slice(0,i) + a + "    (globalThis as any).__ctx = { routeId: feature.properties.routeId, route: shortName, dir: dirId, day, headsign: feature.properties.headsign };\n" + s.slice(i + a.length); }
const b = "        const own = isPooled ? [...(metricStopMap.get(stopId) ?? [])].sort((a, b) => a - b) : times;\n";
if (!s.includes(b)) throw new Error('stop loop not found');
s = s.replace(b, "        (globalThis as any).__ctx.stop = stopId; (globalThis as any).__ctx.site = 'stopWindow'; (globalThis as any).__ctx.pk = undefined;\n" + b);
const c = "          const pooledReading = isPooled ? pooledReadingInWindow(times, start, end, 3, false, own) : null;\n";
if (!s.includes(c)) throw new Error('period call not found');
s = s.replace(c, "          (globalThis as any).__ctx.pk = pk; (globalThis as any).__ctx.site = 'stopPeriod';\n" + c);
const d = "            const reading = pooledReadingInWindow(merged, start, end, 3, false, own);\n";
if (!s.includes(d)) throw new Error('rush call not found');
s = s.replace(d, "            (globalThis as any).__ctx.stop = stopId; (globalThis as any).__ctx.pk = pk; (globalThis as any).__ctx.site = 'rush';\n" + d);
const e = "          const value = pooledHeadwayInWindow(merged, start, end, 3, false, own);\n";
if (!s.includes(e)) throw new Error('rush overlay call not found');
s = s.replace(e, "          (globalThis as any).__ctx.stop = stopId; (globalThis as any).__ctx.pk = pk; (globalThis as any).__ctx.site = 'rushOverlay850';\n" + e);
fs.writeFileSync(p, s);
console.log('patched', root);
