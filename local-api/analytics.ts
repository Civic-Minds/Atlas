/**
 * Local only (CIV-2068): the internal Analytics page's figures, from the Google Analytics 4 Data API. Signs in as a
 * read-only service account whose key file is on this Mac (~/Developer/Credentials/Google Analytics read-only for
 * Atlas.json) and reads the property named in ~/Developer/Credentials/Google Analytics read-only for Atlas.env
 * (GA4_PROPERTY_ID; the GA4_KEY_FILE and GA4_PROPERTY_ID environment variables win). Reads only (the analytics.readonly
 * scope). Without the key or the property it answers `available: false`. The key never leaves this process.
 */
import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ANALYTICS_RANGES, ANALYTICS_TOP_ROWS, type AnalyticsDay, type AnalyticsResponse, type AnalyticsRow, type AnalyticsTotals, type AnalyticsWindow } from '../shared/analytics.js';

const CREDENTIALS = join(homedir(), 'Developer/Credentials');
const KEY_FILE = join(CREDENTIALS, 'Google Analytics read-only for Atlas.json');
const PROPERTY_FILE = join(CREDENTIALS, 'Google Analytics read-only for Atlas.env');
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function json(body: AnalyticsResponse, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

interface ServiceAccount { client_email: string; private_key: string }

function serviceAccount(): ServiceAccount | null {
  const file = process.env.GA4_KEY_FILE ?? KEY_FILE;
  if (!existsSync(file)) return null;
  try {
    const k = JSON.parse(readFileSync(file, 'utf8')) as Partial<ServiceAccount>;
    return k.client_email && k.private_key ? { client_email: k.client_email, private_key: k.private_key } : null;
  } catch { return null; }
}

function propertyId(): string | null {
  const fromEnv = process.env.GA4_PROPERTY_ID;
  const fromFile = existsSync(PROPERTY_FILE) ? readFileSync(PROPERTY_FILE, 'utf8').match(/^\s*(?:export\s+)?GA4_PROPERTY_ID\s*=\s*['"]?(\d+)/m)?.[1] : undefined;
  const id = fromEnv ?? fromFile ?? null;
  return id && /^\d+$/.test(id) ? id : null;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

/** A service-account access token (OAuth 2.0 JWT bearer grant), kept until a minute before it expires. */
let cached: { token: string; until: number } | null = null;
async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.until > now) return cached.token;
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signature = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(signature)}` }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const t = await res.json() as { access_token: string; expires_in: number };
  cached = { token: t.access_token, until: now + t.expires_in - 60 };
  return t.access_token;
}

interface GaReport { rows?: { dimensionValues?: { value: string }[]; metricValues: { value: string }[] }[] }

/**
 * The five reports for one window (batchRunReports' limit): totals for the window and the one before it, top pages by
 * views, countries by visitors, sources by visits, and visitors per day.
 */
export function windowRequests(days: number) {
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }];
  const withPrevious = [...dateRanges, { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` }];
  const top = (dimension: string, metric: string) => ({ dateRanges, dimensions: [{ name: dimension }], metrics: [{ name: metric }], orderBys: [{ metric: { metricName: metric }, desc: true }], limit: ANALYTICS_TOP_ROWS });
  return [
    { dateRanges: withPrevious, metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }] },
    top('pagePath', 'screenPageViews'),
    top('country', 'activeUsers'),
    top('sessionSource', 'sessions'),
    { dateRanges, dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ dimension: { dimensionName: 'date' } }] },
  ];
}

const num = (v: string | undefined) => Number(v ?? 0) || 0;
const rowsOf = (r: GaReport | undefined): AnalyticsRow[] => (r?.rows ?? []).map(x => ({ name: x.dimensionValues?.[0]?.value ?? '', value: num(x.metricValues[0]?.value) }));

/** With two date ranges GA adds a dateRange dimension ("date_range_0", "date_range_1") and doesn't promise the order. */
function totalsFor(report: GaReport | undefined, range: 'date_range_0' | 'date_range_1'): AnalyticsTotals {
  const rows = report?.rows ?? [];
  const row = rows.find(r => r.dimensionValues?.[0]?.value === range) ?? (range === 'date_range_0' && !rows[0]?.dimensionValues ? rows[0] : undefined);
  const t = row?.metricValues ?? [];
  return { visits: num(t[0]?.value), visitors: num(t[1]?.value), pageViews: num(t[2]?.value) };
}

const ymdToMs = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));
const msToYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');

/** Visitors per day, oldest first; GA leaves out a day with no visits, so a gap between two days is filled with 0. */
export function dailyOf(report: GaReport | undefined): AnalyticsDay[] {
  const got = new Map((report?.rows ?? []).map(r => [r.dimensionValues?.[0]?.value ?? '', num(r.metricValues[0]?.value)] as const));
  const dates = [...got.keys()].filter(d => /^\d{8}$/.test(d)).sort();
  if (!dates.length) return [];
  const out: AnalyticsDay[] = [];
  for (let ms = ymdToMs(dates[0]); ms <= ymdToMs(dates[dates.length - 1]); ms += 86_400_000) {
    const date = msToYmd(ms);
    out.push({ date, visitors: got.get(date) ?? 0 });
  }
  return out;
}

/** One window's figures from the batchRunReports answer (reports in windowRequests' order). */
export function readWindow(days: (typeof ANALYTICS_RANGES)[number], reports: GaReport[]): AnalyticsWindow {
  return {
    days,
    totals: totalsFor(reports[0], 'date_range_0'),
    previous: totalsFor(reports[0], 'date_range_1'),
    pages: rowsOf(reports[1]),
    countries: rowsOf(reports[2]),
    sources: rowsOf(reports[3]),
    daily: dailyOf(reports[4]),
  };
}

export default {
  async fetch(): Promise<Response> {
    const sa = serviceAccount(), property = propertyId();
    if (!sa || !property) return json({ available: false });
    try {
      const token = await accessToken(sa);
      const windows = await Promise.all(ANALYTICS_RANGES.map(async days => {
        const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:batchRunReports`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: windowRequests(days) }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`report ${res.status}`);
        return readWindow(days, ((await res.json()) as { reports: GaReport[] }).reports);
      }));
      return json({ available: true, windows });
    } catch {
      return json({ available: false });
    }
  },
};
