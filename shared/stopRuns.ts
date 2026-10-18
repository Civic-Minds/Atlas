/**
 * CIV-321: decode a stop-run string written by pipeline/tripSets.ts encodeStopRuns: comma-separated
 * runs, each "v" (one stop) or "v*n" (n stops), an empty v meaning no value. Returns one entry per
 * stop; malformed input yields what parses (never throws).
 */
export function decodeStopRuns(encoded: string | undefined | null): Array<number | null> {
  if (!encoded) return encoded === '' ? [null] : [];
  const out: Array<number | null> = [];
  for (const run of encoded.split(',')) {
    const [raw, count] = run.split('*');
    const n = count == null ? 1 : Math.max(0, Number(count) || 0);
    const v = raw === '' ? null : Number(raw);
    const value = v == null || !Number.isFinite(v) ? null : v;
    for (let i = 0; i < n; i++) out.push(value);
  }
  return out;
}
