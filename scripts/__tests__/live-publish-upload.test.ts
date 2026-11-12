import { describe, expect, it } from 'vitest';
import { checkReportSet, wouldGoBackwards, type ReportManifest } from '../live-publish-upload';

const manifest = (over: Partial<ReportManifest> = {}): ReportManifest => ({
  schema: 1, agency: 'ttc', thisWeek: { from: '2026-11-05', to: '2026-11-11' }, lastWeek: { from: '2026-10-29', to: '2026-11-04' }, routes: ['504', '512'], ...over,
});
const set = (m: ReportManifest, extra: Record<string, string> = {}) => new Map(Object.entries({
  'manifest.json': JSON.stringify(m), 'agency.json': '{"status":"ready"}', '504.json': '{"status":"ready"}', '512.json': '{"status":"held"}', ...extra,
}));

describe('live-publish-upload', () => {
  it('accepts a complete report set and lists exactly its files', () => {
    expect(checkReportSet('ttc', set(manifest()))).toEqual({ files: ['504.json', '512.json', 'agency.json', 'manifest.json'] });
  });

  it('refuses anything that is not a complete report set', () => {
    const problem = (texts: Map<string, string>) => (checkReportSet('ttc', texts) as { problem: string }).problem;
    expect(problem(set(manifest(), { '../x.json': '{}' }))).toMatch(/unexpected file name/);
    expect(problem(set(manifest(), { 'notes.txt': 'x' }))).toMatch(/unexpected file name/);
    expect(problem(set(manifest(), { '504.json': '{broken' }))).toMatch(/not valid JSON/);
    expect(problem(set(manifest({ agency: 'stm' })))).toMatch(/is for "stm"/);
    expect(problem(set(manifest({ thisWeek: null })))).toMatch(/no weeks/);
    expect(problem(set(manifest({ routes: [] })))).toMatch(/lists no routes/);
    expect(problem(set(manifest({ routes: ['504', '512', '505'] })))).toMatch(/no file for listed route\(s\): 505/);
    expect(problem(set(manifest(), { '999.json': '{}' }))).toMatch(/does not list: 999.json/);
    const noAgency = set(manifest()); noAgency.delete('agency.json');
    expect(problem(noAgency)).toMatch(/must both be there/);
  });

  it('refuses to replace newer published data with older, and allows the same or newer', () => {
    const published = JSON.stringify(manifest());
    expect(wouldGoBackwards(published, manifest({ thisWeek: { from: '2026-10-08', to: '2026-10-14' } }))).toBe(true);
    expect(wouldGoBackwards(published, manifest())).toBe(false);
    expect(wouldGoBackwards(published, manifest({ thisWeek: { from: '2026-11-12', to: '2026-11-18' } }))).toBe(false);
    expect(wouldGoBackwards(null, manifest())).toBe(false);
  });
});
