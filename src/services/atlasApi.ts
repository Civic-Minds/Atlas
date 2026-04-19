import { useAuthStore } from '../hooks/useAuthStore';

const ATLAS_BASE = '';

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
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/import/agencies`);
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
  const url = new URL(`${ATLAS_BASE}/api/screen`, window.location.origin);
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
  const url = new URL(`${ATLAS_BASE}/api/corridors`, window.location.origin);
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
  agency_id: string;
  stop_a_name?: string;
  stop_b_name?: string;
  route_short_names: string[];
  is_bunching: boolean;
  reliability_score: number;
  actual_headway_min?: number;
  scheduled_headway_min: number;
  observed_arrivals: number;
}

export interface PerformanceResponse {
  agency: string;
  windowMinutes: number;
  corridors: CorridorPerformance[];
}

export interface AuditWindow {
  start: string;
  end: string;
  version: string;
  results: CorridorPerformance[];
}

export interface AuditResult {
  agency: string;
  pivotDate: string;
  before: AuditWindow;
  after: AuditWindow;
  auditTs: string;
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
  distance_meters:      number;         // Straight-line distance between stops
  avg_speed_kmh:        number;         // Actual observed speed traversing segment
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
  const url = new URL(`${ATLAS_BASE}/api/corridors/performance`, window.location.origin);
  url.searchParams.set('agency', agency);
  url.searchParams.set('window', String(windowMinutes));
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Performance query failed: ${res.status}`);
  return res.json();
}

export async function auditServiceChange(agency: string): Promise<AuditResult> {
  const url = new URL(`${ATLAS_BASE}/api/intelligence/audit-service-change`, window.location.origin);
  url.searchParams.set('agency', agency);
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Audit query failed: ${res.status}`);
  return res.json();
}

export async function fetchSegmentBottlenecks(agency: string, limit: number = 10): Promise<BottleneckResponse> {
  const url = new URL(`${ATLAS_BASE}/api/intelligence/bottlenecks`, window.location.origin);
  url.searchParams.set('agency', agency);
  url.searchParams.set('limit', String(limit));
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Bottleneck query failed: ${res.status}`);
  return res.json();
}

export async function fetchStopDwells(agency: string, limit: number = 10): Promise<StopDwellResponse> {
  const url = new URL(`${ATLAS_BASE}/api/intelligence/dwells`, window.location.origin);
  url.searchParams.set('agency', agency);
  url.searchParams.set('limit', String(limit));
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Dwell query failed: ${res.status}`);
  return res.json();
}

// ─── Live Service ─────────────────────────────────────────────────────────────

export async function fetchLiveRoutes(agency: string): Promise<string[]> {
  const url = new URL(`${ATLAS_BASE}/api/live/routes`, window.location.origin);
  url.searchParams.set('agency', agency);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Live routes failed: ${res.status}`);
  const data = await res.json();
  return data.routes;
}

export async function fetchLiveStops(agency: string, route: string): Promise<string[]> {
  const url = new URL(`${ATLAS_BASE}/api/live/stops`, window.location.origin);
  url.searchParams.set('agency', agency);
  url.searchParams.set('route', route);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Live stops failed: ${res.status}`);
  const data = await res.json();
  return data.stops;
}

export interface StopArrival {
  vehicleId: string;
  arrivedAt: string;
  gapMins: number | null;
}

export interface StopArrivalStats {
  count: number;
  avgGapMins: number | null;
  maxGapMins: number | null;
  bunchingCount: number;
}

export interface StopArrivalResponse {
  agency: string;
  route: string;
  stop: string;
  windowMins: number;
  arrivals: StopArrival[];
  stats: StopArrivalStats;
  yesterday: { count: number; avgGapMins: number | null };
}

export interface RouteHealthHour {
  day: string;
  hour: number;
  vehicles: number;
  estHeadwayMins: number | null;
}

export interface RouteHealthResponse {
  agency: string;
  route: string;
  currentVehicles: number;
  hourly: RouteHealthHour[];
  summary: {
    worstHour: number | null;
    worstAvgGap: number | null;
    bestHour: number | null;
    bestAvgGap: number | null;
  };
}

export async function fetchRouteHealth(agency: string, route: string): Promise<RouteHealthResponse> {
  const url = new URL(`${ATLAS_BASE}/api/live/route-health`, window.location.origin);
  url.searchParams.set('agency', agency);
  url.searchParams.set('route', route);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Route health failed: ${res.status}`);
  return res.json();
}

export interface GapBucket {
  bucket: string;
  count: number;
}

export interface GapDistributionResponse {
  agency: string;
  route: string;
  totalGaps: number;
  median: number | null;
  p75: number | null;
  p90: number | null;
  bunchingPct: number;
  desertPct: number;
  diagnosis: 'bunching' | 'capacity' | 'insufficient_data';
  buckets: GapBucket[];
}

export async function fetchGapDistribution(agency: string, route: string): Promise<GapDistributionResponse> {
  const url = new URL(`${ATLAS_BASE}/api/live/gap-distribution`, window.location.origin);
  url.searchParams.set('agency', agency);
  url.searchParams.set('route', route);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Gap distribution failed: ${res.status}`);
  return res.json();
}

export interface NetworkPulseRoute {
  routeId: string;
  currentVehicles: number;
  worstGap: number | null;
  bestGap: number | null;
  avgGap: number | null;
  worstHour: number | null;
  bestHour: number | null;
}

export interface NetworkPulseResponse {
  agency: string;
  ts: string;
  count: number;
  routes: NetworkPulseRoute[];
}

export async function fetchNetworkPulse(agency: string): Promise<NetworkPulseResponse> {
  const url = new URL(`${ATLAS_BASE}/api/live/network-pulse`, window.location.origin);
  url.searchParams.set('agency', agency);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Network pulse failed: ${res.status}`);
  return res.json();
}

export interface SilentRoute {
  routeId: string;
  lastSeen: string | null;
}

export interface SilentRoutesResponse {
  agency: string;
  ts: string;
  count: number;
  routes: SilentRoute[];
}

export async function fetchSilentRoutes(agency: string): Promise<SilentRoutesResponse> {
  const url = new URL(`${ATLAS_BASE}/api/live/silent-routes`, window.location.origin);
  url.searchParams.set('agency', agency);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Silent routes failed: ${res.status}`);
  return res.json();
}

// ─── Ghost Buses ──────────────────────────────────────────────────────────────

export interface GhostRoute {
  routeId: string;
  scheduledTrips: number;
  observedTrips: number;
  ghostCount: number;
  ghostRate: number;
}

export interface GhostResponse {
  agency: string;
  windowMinutes: number;
  ts: string;
  routes: GhostRoute[];
}

export async function fetchGhostBuses(agency: string, windowMinutes: number = 60): Promise<GhostResponse> {
  const url = new URL(`${ATLAS_BASE}/api/intelligence/ghosts`, window.location.origin);
  url.searchParams.set('agency', agency);
  url.searchParams.set('window', String(windowMinutes));
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Ghost bus query failed: ${res.status}`);
  return res.json();
}

// ─── Matching Stats ───────────────────────────────────────────────────────────

export interface MatchingStat {
  agency_id: string;
  total_obs: number;
  matched_obs: number;
  avg_confidence: number;
  direct_matches: number;
  spatial_matches: number;
  unmatched: number;
  healthScore: number;
}

export interface MatchingStatsResponse {
  ts: string;
  stats: MatchingStat[];
}

export async function fetchMatchingStats(agency?: string): Promise<MatchingStatsResponse> {
  const url = new URL(`${ATLAS_BASE}/api/intelligence/matching-stats`, window.location.origin);
  if (agency) url.searchParams.set('agency', agency);
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Matching stats query failed: ${res.status}`);
  return res.json();
}

// ─── Intelligence Trends ──────────────────────────────────────────────────────

export interface TrendPoint {
  hour: string;
  agency_id: string;
  avg_vehicles: number;
  success_rate: number;
}

export interface TrendsResponse {
  ts: string;
  trends: TrendPoint[];
}

export async function fetchTrends(agency?: string): Promise<TrendsResponse> {
  const url = new URL(`${ATLAS_BASE}/api/intelligence/trends`, window.location.origin);
  if (agency) url.searchParams.set('agency', agency);
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Trends query failed: ${res.status}`);
  return res.json();
}

export async function fetchStopArrivals(
  agency: string,
  route: string,
  stop: string,
  minutes = 60
): Promise<StopArrivalResponse> {
  const url = new URL(`${ATLAS_BASE}/api/live/arrivals`, window.location.origin);
  url.searchParams.set('agency', agency);
  url.searchParams.set('route', route);
  url.searchParams.set('stop', stop);
  url.searchParams.set('minutes', String(minutes));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Stop arrivals failed: ${res.status}`);
  return res.json();
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export interface AlertThreshold {
  id: string;
  agency_account_id: string;
  target_type: 'network' | 'route' | 'stop';
  target_id: string | null;
  metric: 'bunching_pct' | 'delay_seconds' | 'match_rate' | 'ghost_pct';
  comparison: '>' | '<' | '==';
  value: number;
  cooldown_minutes: number;
  notion_enabled: boolean;
  created_at: string;
}

export async function fetchAlertThresholds(): Promise<AlertThreshold[]> {
  const url = new URL(`${ATLAS_BASE}/api/alerts/thresholds`, window.location.origin);
  const res = await fetchWithAuth(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch alert thresholds: ${res.status}`);
  return res.json();
}

export async function createAlertThreshold(data: Partial<AlertThreshold>): Promise<AlertThreshold> {
  const url = new URL(`${ATLAS_BASE}/api/alerts/thresholds`, window.location.origin);
  const res = await fetchWithAuth(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create alert threshold: ${res.status}`);
  return res.json();
}

export async function deleteAlertThreshold(id: string): Promise<void> {
  const url = new URL(`${ATLAS_BASE}/api/alerts/thresholds/${id}`, window.location.origin);
  const res = await fetchWithAuth(url.toString(), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete alert threshold: ${res.status}`);
}

// ── Simulate ─────────────────────────────────────────────────────────────────

export interface SimulateRoute {
  id: string;
  name: string;
  type: string;
  color: string;
}

export interface SimulateStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isTerminal?: boolean;
}

export interface SimulateRouteDetail {
  id: string;
  name: string;
  color: string;
  stops: SimulateStop[];
  shape: [number, number][];
}

export async function fetchSimulateRoutes(agency: string): Promise<SimulateRoute[]> {
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/import/agencies/${encodeURIComponent(agency)}/simulate/routes`);
  if (!res.ok) throw new Error(`Failed to fetch simulate routes: ${res.status}`);
  const data = await res.json();
  return data.routes ?? [];
}

export async function fetchSimulateRoute(agency: string, routeId: string): Promise<SimulateRouteDetail> {
  const res = await fetchWithAuth(
    `${ATLAS_BASE}/api/import/agencies/${encodeURIComponent(agency)}/simulate/route/${encodeURIComponent(routeId)}`
  );
  if (!res.ok) throw new Error(`Failed to fetch simulate route: ${res.status}`);
  return res.json();
}
