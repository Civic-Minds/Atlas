import { useAuthStore } from '../hooks/useAuthStore';

const ATLAS_BASE = '/api';

// ── Agency list ──────────────────────────────────────────────────────────────

export interface AgencyMeta {
  slug: string;
  display_name: string;
  country_code: string | null;
  region: string | null;
  feed_version_id: string | null;
  route_count: number | null;
  effective_from: string | null;
  effective_to: string | null;
}

export async function fetchAgencies(): Promise<AgencyMeta[]> {
  const res = await fetch(`${ATLAS_BASE}/api/import/agencies`);
  if (!res.ok) throw new Error(`Failed to fetch agencies: ${res.status}`);
  return res.json();
}

// ── Screen ───────────────────────────────────────────────────────────────────

export interface ScreenParams {
  agency: string;
  maxHeadway: number;
  windowStart: number; // minutes from midnight, e.g. 420 = 7:00am
  windowEnd: number;   // minutes from midnight, e.g. 1140 = 7:00pm
  dayType: 'Weekday' | 'Saturday' | 'Sunday';
  directions: 'one' | 'both';
}

export interface ScreenRoute {
  gtfs_route_id: string;
  route_short_name: string;
  route_long_name: string | null;
  mode_category: string | null;
  tier: string | null;         // present for directions=one, absent for both
  avg_headway: string;
  base_headway: string;
  peak_headway: string | null;
  service_span_start: number;
  service_span_end: number;
  trip_count: number;
  reliability_score: string | null;
  circuity_index: number | null;
}

export interface ScreenResponse {
  agency: string;
  feedVersionId: string;
  dayType: string;
  count: number;
  routes: ScreenRoute[];
}

export async function screenRoutes(params: ScreenParams): Promise<ScreenResponse> {
  const url = new URL(`${ATLAS_BASE}/api/screen`);
  url.searchParams.set('agency',      params.agency);
  url.searchParams.set('maxHeadway',  String(params.maxHeadway));
  url.searchParams.set('windowStart', String(params.windowStart));
  url.searchParams.set('windowEnd',   String(params.windowEnd));
  url.searchParams.set('dayType',     params.dayType);
  url.searchParams.set('directions',  params.directions);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Screen query failed: ${res.status}`);
  return res.json();
}

// ── Corridors ────────────────────────────────────────────────────────────────

export interface CorridorParams {
  agency: string;
  minRoutes?: number;
  maxHeadway: number;
  windowStart: number;
  windowEnd: number;
  dayType: 'Weekday' | 'Saturday' | 'Sunday';
}

export interface Corridor {
  link_id: string;
  stop_a_id: string;
  stop_b_id: string;
  stop_a_name: string | null;
  stop_b_name: string | null;
  route_ids: string[];
  route_short_names: string[];
  route_count: number;
  trip_count: number;
  avg_headway: string;
  peak_headway: string | null;
  reliability_score: string | null;
}

export interface CorridorResponse {
  agency: string;
  feedVersionId: string;
  dayType: string;
  count: number;
  corridors: Corridor[];
}

export async function fetchCorridors(params: CorridorParams): Promise<CorridorResponse> {
  const url = new URL(`${ATLAS_BASE}/api/corridors`);
  url.searchParams.set('agency',      params.agency);
  url.searchParams.set('maxHeadway',  String(params.maxHeadway));
  url.searchParams.set('windowStart', String(params.windowStart));
  url.searchParams.set('windowEnd',   String(params.windowEnd));
  url.searchParams.set('dayType',     params.dayType);
  if (params.minRoutes) url.searchParams.set('minRoutes', String(params.minRoutes));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Corridors query failed: ${res.status}`);
  return res.json();
}

// ── Import ───────────────────────────────────────────────────────────────────

export interface ImportResult {
  feedVersionId: string;
  routeCount: number;
  stopCount: number;
  tripCount: number;
  analysisResultCount: number;
  effectiveFrom: string;
  effectiveTo: string;
}

export async function importFeed(
  file: File,
  accountSlug: string,
  accountName: string,
  label?: string,
): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('accountSlug', accountSlug);
  form.append('accountName', accountName);
  if (label) form.append('label', label);
  const res = await fetch(`${ATLAS_BASE}/api/import`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Import failed: ${res.status}`);
  }
  return res.json();
}
// ── Real-time Intelligence ──────────────────────────────────────────────────

async function fetchWithAuth(url: string | URL, init?: RequestInit): Promise<Response> {
  const user = useAuthStore.getState().user;
  // Use getIdToken to get a fresh string JWT
  const token = user ? await user.getIdToken() : null;

  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, { ...init, headers });
}

export interface CorridorPerformance {
  link_id: string;
  stop_a_id: string;
  stop_b_id: string;
  stop_a_name: string | null;
  stop_b_name: string | null;
  route_short_names: string[];
  scheduled_headway_min: number;
  actual_headway_min: number | null;
  reliability_score: number;
  observed_arrivals: number;
  is_bunching: boolean;
}

export interface PerformanceResponse {
  agency: string;
  window_minutes: number;
  corridors: CorridorPerformance[];
}

export interface SegmentBottleneck {
  route_id:             string;
  route_name:           string;
  from_stop_id:         string;
  from_stop_name:       string;
  to_stop_id:           string;
  to_stop_name:         string;
  obs_count:            number;
  avg_delay_delta:      number;
  total_delay_added:    number;
}

export interface BottleneckResponse {
  agency: string;
  ts: string;
  bottlenecks: SegmentBottleneck[];
}

export interface StopDwell {
  stop_id: string;
  stop_name: string;
  route_id: string;
  route_name: string;
  obs_count: number;
  avg_dwell_seconds: number;
  max_dwell_seconds: number;
}

export interface StopDwellResponse {
  agency: string;
  ts: string;
  dwells: StopDwell[];
}

export async function fetchCorridorPerformance(agency: string, windowMinutes: number = 60): Promise<PerformanceResponse> {
  const url = new URL(`${ATLAS_BASE}/api/corridors/performance`);
  url.searchParams.set('agency', agency);
  url.searchParams.set('window', String(windowMinutes));
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Performance query failed: ${res.status}`);
  return res.json();
}

export async function fetchSegmentBottlenecks(agency: string, limit: number = 10): Promise<BottleneckResponse> {
  const url = new URL(`${ATLAS_BASE}/api/intelligence/bottlenecks`);
  url.searchParams.set('agency', agency);
  url.searchParams.set('limit', String(limit));
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Bottleneck query failed: ${res.status}`);
  return res.json();
}

export async function fetchStopDwells(agency: string, limit: number = 10): Promise<StopDwellResponse> {
  const url = new URL(`${ATLAS_BASE}/api/intelligence/dwells`);
  url.searchParams.set('agency', agency);
  url.searchParams.set('limit', String(limit));
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Dwell query failed: ${res.status}`);
  return res.json();
}
