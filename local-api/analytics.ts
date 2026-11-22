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
import { ANALYTICS_RANGES, ANALYTICS_TOP_ROWS, type AnalyticsResponse, type AnalyticsRow, type AnalyticsWindow } from '../shared/analytics.js';

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

/** The three reports for one window: totals, top pages by views, countries by visitors. */
export function windowRequests(days: number) {
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }];
  return [
    { dateRanges, metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }] },
    { dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: ANALYTICS_TOP_ROWS },
    { dateRanges, dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: ANALYTICS_TOP_ROWS },
  ];
}

const num = (v: string | undefined) => Number(v ?? 0) || 0;
const rowsOf = (r: GaReport | undefined): AnalyticsRow[] => (r?.rows ?? []).map(x => ({ name: x.dimensionValues?.[0]?.value ?? '', value: num(x.metricValues[0]?.value) }));

/** One window's figures from the batchRunReports answer (reports in windowRequests' order). */
export function readWindow(days: (typeof ANALYTICS_RANGES)[number], reports: GaReport[]): AnalyticsWindow {
  const t = reports[0]?.rows?.[0]?.metricValues ?? [];
  return { days, totals: { visits: num(t[0]?.value), visitors: num(t[1]?.value), pageViews: num(t[2]?.value) }, pages: rowsOf(reports[1]), countries: rowsOf(reports[2]) };
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
