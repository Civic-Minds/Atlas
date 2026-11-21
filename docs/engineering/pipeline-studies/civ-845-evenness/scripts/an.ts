// Analysis of out/<SET>.json written by mr.ts. Baseline = today's gate (variant "main", no majority-refuse).
import fs from 'fs';
const EV = '/private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad/civ845-evidence';
const SET = process.env.SET ?? 'base12'; const SHOW = process.env.SHOW ?? '';
const R = JSON.parse(fs.readFileSync(`${EV}/${process.env.OUTD ?? 'out'}/${SET}.json`, 'utf8')); const B = R['main'];
const grace = (f: number) => Math.max(5, Math.round(f * 0.15));
const over = (r: any) => r.passed && !r.mrFlag && r.longest != null && r.pub != null && r.longest >= 1.5 * r.pub; // pooled value shown while a rider can wait >= 1.5x it
console.log(`SET ${SET}: stops ${Object.keys(B).length}; baseline stops published from a pooled pass: ${Object.values<any>(B).filter(r => r.passed).length}; baseline over-states (longest >= 1.5x shown): ${Object.values<any>(B).filter(over).length}`);
for (const [name, S] of Object.entries<any>(R)) {
  if (name === 'main') continue;
  let dropOverR = 0, dropRealR = 0, changed = 0, p2r = 0, other = 0, drop = 0, dropReal = 0, dropOver = 0, gain = 0, valChg = 0, overNow = 0; const lines: string[] = []; const otherL: string[] = [];
  for (const k of Object.keys(B)) {
    const a = B[k], b = S[k]; if (!b) continue; if (over(b) || (b.refused && false)) overNow++;
    if (a.pub === b.pub) continue; changed++;
    const nowRef = b.refused || b.mrFlag;
    if (a.passed && nowRef) { p2r++; valChg++; lines.push(`${k}: ${a.pub}->${b.pub} (long ${a.longest}, own ${a.ownV})`);
      if (a.pub <= a.filter && b.pub > a.filter) { if (a.longest >= 1.5 * a.pub) dropOverR++; else dropRealR++; drop++; if (a.longest != null && a.longest <= a.filter + grace(a.filter)) dropReal++; else dropOver++; } }
    else { other++; otherL.push(`${k}: ${a.pub}->${b.pub} passed ${a.passed}->${b.passed}`); }
    if (a.pub > a.filter && b.pub <= a.filter) gain++;
  }
  // refused->passing (never allowed)
  let r2p = 0; for (const k of Object.keys(B)) if (B[k].refused && S[k] && S[k].passed && !S[k].mrFlag) r2p++;
  console.log(`\n== ${name}: changed published values ${changed} = pass->refused ${p2r} + other ${other}; refused->pass ${r2p}; crossing filter (<=F to >F) ${drop} [RULER longest>=1.5x shown: over-draws removed ${dropOverR}, real frequent dropped ${dropRealR}]; fail->pass ${gain}; stops still overstating (>=1.5x) ${overNow}`);
  if (process.env.LIST) { lines.forEach(l => console.log('  ', l)); otherL.forEach(l => console.log('  OTHER', l)); }
}
// pattern-order display of chosen cases
for (const lab of SHOW.split(';').filter(Boolean)) {
  console.log(`\n--- ${lab}`);
  for (const [name, S] of Object.entries<any>(R)) {
    const rs = Object.entries<any>(S).filter(([k]) => k.startsWith(lab + '|')).map(([, r]) => r); const pats = new Map<string, number>(); rs.forEach(r => pats.set(r.pat, (pats.get(r.pat) ?? 0) + 1));
    const top = [...pats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; const seq = rs.filter(r => r.pat === top).sort((a, b) => a.idx - b.idx);
    const tag = (r: any) => `${r.pub}${r.mrFlag ? 'm' : r.refused ? 'r' : ''}`;
    console.log(name.padEnd(12), seq.map(tag).join(' '));
  }
}
