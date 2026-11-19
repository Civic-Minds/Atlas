// CIV-845 evidence: majority-refuse per same-sharer-set section, replayed on REAL pipeline code snapshots.
// Usage: SET=base12|wide|hsr|pin tsx mr.ts   -> writes out/<SET>.json (per variant x mr stop records) and prints summary.
import fs from 'fs';
import { loadPatterns, TF } from '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/realx.ts';
const HERE = '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad';
const EV = HERE + '/civ845-evidence';
TF.f = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; }; // floored times, as the pipeline reads them

type Case = [string, string, string, string, string, string, number, number, number]; // label,dir,stopsDir,route,dirId,date,start,end,filter
const PER: [string, number, number, number][] = [['AM', 360, 540, 15], ['Mid', 540, 900, 15], ['PM', 900, 1140, 15], ['Eve', 1140, 1380, 20]];
const base12: Case[] = [
  ['900 EB eve', 'drt', 'drt', '900', '0', '2026-11-18', 1140, 1380, 20], ['900 WB eve', 'drt', 'drt', '900', '1', '2026-11-18', 1140, 1380, 20],
  ['901 N AM', 'drt', 'drt', '901', '0', '2026-11-18', 360, 540, 20], ['901 S AM', 'drt', 'drt', '901', '1', '2026-11-18', 360, 540, 20],
  ['901 N eve', 'drt', 'drt', '901', '0', '2026-11-18', 1140, 1380, 20], ['901 S eve', 'drt', 'drt', '901', '1', '2026-11-18', 1140, 1380, 20],
  ['102 N eve', 'ttc102', 'ttc', '102', '1', '2026-10-21', 1140, 1380, 20], ['102 S eve', 'ttc102', 'ttc', '102', '0', '2026-10-21', 1140, 1380, 20],
  ['102 N mid', 'ttc102', 'ttc', '102', '1', '2026-10-21', 540, 900, 15], ['102 S mid', 'ttc102', 'ttc', '102', '0', '2026-10-21', 540, 900, 15],
  ['102 N am', 'ttc102', 'ttc', '102', '1', '2026-10-21', 360, 540, 15], ['102 S am', 'ttc102', 'ttc', '102', '0', '2026-10-21', 360, 540, 15]];
const feeds: [string, string, string][] = [['drt', 'drt', '2026-11-18'], ['ttc102', 'ttc', '2026-10-21'], ['ttc5241', 'ttc', '2026-10-21'], ['ttcm', 'ttc', '2026-10-21'], ['ttc5', 'ttc', '2026-10-21']];
const routes: Record<string, string[]> = { drt: ['900', '901'], ttc102: ['102'], ttc5241: ['52', '41'], ttcm: ['25', '29', '35', '54', '95', '10', '85', '32'], ttc5: ['5'] };
const wide: Case[] = []; for (const [dir, sd, date] of feeds) for (const r of routes[dir]) for (const d of ['0', '1']) for (const [pn, st, en, f] of PER) wide.push([`${dir}:${r}${d} ${pn}`, dir, sd, r, d, date, st, en, f]);
const pin: Case[] = [];
for (const d of ['0', '1']) { pin.push([`52 d${d} mid Wed`, 'ttc5241', 'ttc', '52', d, '2026-10-21', 540, 900, 15], [`41 d${d} mid Sat`, 'ttc5241', 'ttc', '41', d, '2026-10-24', 540, 900, 15], [`900 d${d} mid`, 'drt', 'drt', '900', d, '2026-11-18', 540, 900, 20]); }
const hsr: Case[] = []; // HSR 05 (Hamilton feed 20261226-fresh.zip), filters 10 and 15
for (const d of ['0', '1']) for (const [pn, st, en] of PER) for (const f of [10, 15]) hsr.push([`HSR05 d${d} ${pn} f${f}`, 'feeds/hamilton', 'feeds/hamilton', '05', d, '2026-11-18', st, en, f]);
const marg: Case[] = []; for (const d of ['0','1']) for (const [pn, st, en] of PER) marg.push([`52 d${d} ${pn} f10`, 'ttc5241', 'ttc', '52', d, '2026-10-21', st, en, 10]);
const SETS: Record<string, Case[]> = { base12, wide, pin, hsr, marg };
const SET = process.env.SET ?? 'base12'; const cases = SETS[SET];
const BASE = (d: string) => d.startsWith('feeds/') ? EV + '/' + d : HERE + '/' + d;

const VARIANTS = (process.env.VARIANTS ?? 'main,branch').split(',');
const cache = new Map<string, any>();
const load = (dir: string, sd: string, route: string, dirId: string, date: string) => { const k = [dir, route, dirId, date].join('|'); if (!cache.has(k)) cache.set(k, loadPatterns(BASE(dir), BASE(sd), route, dirId, date)); return cache.get(k); };

async function evalVariant(vname: string, mr: boolean) {
  const root = `${vname.startsWith('exact') ? HERE + '/civ1959' : EV}/snap/${vname}/pipeline`;
  const sp = await import(`${root}/stopPools.ts`); const hu = await import(`${root}/headway-utils.ts`);
  const out: Record<string, any> = {};
  for (const [label, dir, sd, route, dirId, date, start, end, filter] of cases) {
    const L = load(dir, sd, route, dirId, date);
    const spats = L.pats.map((p: any) => ({ memberKey: p.key, routeId: p.key.split('|')[0], headsigns: [...p.headsigns].sort(), stopOrder: p.order }));
    const sharers = sp.computeStopSharers(spats, L.stops, L.parent); const depsOf = new Map(L.pats.map((p: any) => [p.key, p.deps]));
    const best = new Map<string, { n: number; rec: any }>();
    for (const p of L.pats) {
      const pooled = sp.buildPooledStopMap(p.deps, sharers.get(p.key), (k: string) => depsOf.get(k), L.parent, p.deps);
      const recs = p.order.map((stop: string, idx: number) => {
        const own = [...(p.deps.get(stop) ?? [])].sort((a: number, b: number) => a - b);
        const times = [...(pooled.map.get(stop) ?? own)].sort((a: number, b: number) => a - b);
        const isP = pooled.pooledStops.has(stop);
        const rd = isP ? sp.pooledReadingInWindow(times, start, end, 3, false, own) : { value: null, worstWait: null };
        const ownV = hu.medianHeadwayInWindow(hu.forCrossMidnightWindow([...own], end), start, end, 3, true);
        const w = sp.collapseBunched(hu.departuresInWindow(times, start, end, true)); let longest: number | null = null;
        if (isP && w.length >= 3) { longest = 0; for (let i = 1; i < w.length; i++) longest = Math.max(longest, w[i] - w[i - 1]); }
        const sh = isP ? [...(sharers.get(p.key)?.get(L.parent.get(stop) ?? stop) ?? [])].sort().join('+') : '';
        const refused = isP && rd.value == null && rd.worstWait != null; const passed = isP && rd.value != null;
        return { stop, idx, isP, sig: sh, value: rd.value, refused, passed, ownV, longest, mrFlag: false, pub: 0 };
      });
      const setPub = (r: any) => { const plain = r.isP ? (r.mrFlag ? null : r.value) : r.ownV; r.pub = plain ?? r.ownV ?? r.longest ?? null; };
      // sections: contiguous pooled stops with the same sharer set
      let a = 0; const sections: [number, number][] = [];
      for (let i = 1; i <= recs.length; i++) if (i === recs.length || recs[i].sig !== recs[a].sig) { if (recs[a].sig !== '') sections.push([a, i]); a = i; }
      for (const r of recs) { r.secId = ''; r.secN = 0; r.secRef = 0; }
      for (const [s, e] of sections) {
        const sl = recs.slice(s, e); const withReading = sl.filter((r: any) => r.refused || r.passed); const nRef = sl.filter((r: any) => r.refused).length;
        const majority = withReading.length > 0 && nRef * 2 > withReading.length;
        for (const r of sl) { r.secId = `${label}|${p.key}|${s}-${e - 1}`; r.secN = withReading.length; r.secRef = nRef; if (mr && majority && r.passed) r.mrFlag = true; }
      }
      for (const r of recs) setPub(r);
      for (const r of recs) { if (r.pub == null) continue; const n = p.deps.get(r.stop)?.length ?? 0; const cur = best.get(r.stop);
        if (!cur || n > cur.n) best.set(r.stop, { n, rec: { ...r, label, filter, pat: p.key, own: undefined } }); }
    }
    for (const [st, b] of best) out[`${label}|${st}`] = b.rec;
  }
  return out;
}
(async()=>{
const res: Record<string, any> = {};
for (const v of VARIANTS) for (const mr of [false, true]) { res[`${v}${mr ? '+MR' : ''}`] = await evalVariant(v, mr); console.error('done', v, mr); }
const OUTD = HERE + '/civ1959/' + (process.env.OUTD ?? 'out'); fs.mkdirSync(OUTD, { recursive: true }); fs.writeFileSync(`${OUTD}/${SET}.json`, JSON.stringify(res));
console.log(SET, 'cases', cases.length, 'variants', Object.keys(res).join(','), 'stops', Object.keys(res[Object.keys(res)[0]]).length);

})();
