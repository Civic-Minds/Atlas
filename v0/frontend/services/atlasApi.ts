import { useAuthStore } from '../hooks/useAuthStore';

const ATLAS_BASE = '';

// ── Shared Types ─────────────────────────────────────────────────────────────

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const { user } = useAuthStore.getState();
  const token = user ? await user.getIdToken() : '';
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  return fetch(url, { ...options, headers });
}

// ── Agency list ──────────────────────────────────────────────────────────────

export interface AgencyMeta {
  slug: string;
  display_name: string;
  country_code: string;
  region: string;
  feed_version_id?: string;
  route_count?: number;
  effective_from?: string;
  effective_to?: string;
}

export async function fetchAgencies(): Promise<AgencyMeta[]> {
  const res = await fetch(`${ATLAS_BASE}/api/agencies`);
  if (!res.ok) throw new Error(`Failed to fetch agencies: ${res.status}`);
  return res.json();
}

// ── Health & Trends ──────────────────────────────────────────────────────────

export interface HealthTrendPoint {
  timestamp: string;
  matchRate: number;
  reliabilityScore: number;
  score: number;
}

export interface HealthTrendResponse {
  agency: string;
  ts: string;
  trend: HealthTrendPoint[];
}

export async function fetchHealthTrend(agency: string): Promise<HealthTrendResponse> {
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/intelligence/health-trend?agency=${encodeURIComponent(agency)}`);
  if (!res.ok) throw new Error(`Failed to fetch health trend: ${res.status}`);
  return res.json();
}

export interface MatchingStat {
  agency_id: string;
  total_obs: number;
  matched_obs: number;
  avg_confidence: string;
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
  const url = agency 
    ? `${ATLAS_BASE}/api/intelligence/matching-stats?agency=${encodeURIComponent(agency)}`
    : `${ATLAS_BASE}/api/intelligence/matching-stats`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error(`Failed to fetch matching stats: ${res.status}`);
  return res.json();
}

// ── Pulse & Gaps ─────────────────────────────────────────────────────────────

export interface NetworkPulseRoute {
  routeId: string;
  currentVehicles: number;
  worstGap: number | null;
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
  const res = await fetch(`${ATLAS_BASE}/api/live/network-pulse?agency=${encodeURIComponent(agency)}`);
  if (!res.ok) throw new Error(`Failed to fetch network pulse: ${res.status}`);
  return res.json();
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
    const res = await fetch(`${ATLAS_BASE}/api/live/route-health?agency=${encodeURIComponent(agency)}&route=${encodeURIComponent(route)}`);
    if (!res.ok) throw new Error(`Failed to fetch route health: ${res.status}`);
    return res.json();
}

export interface GapDistributionBucket {
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
    diagnosis: 'insufficient_data' | 'bunching' | 'capacity';
    buckets: GapDistributionBucket[];
}

export async function fetchGapDistribution(agency: string, route: string): Promise<GapDistributionResponse> {
    const res = await fetch(`${ATLAS_BASE}/api/live/gap-distribution?agency=${encodeURIComponent(agency)}&route=${encodeURIComponent(route)}`);
    if (!res.ok) throw new Error(`Failed to fetch gap distribution: ${res.status}`);
    return res.json();
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface SegmentBottleneck {
  route_id: string;
  route_name: string;
  from_stop_id: string;
  from_stop_name: string;
  to_stop_id: string;
  to_stop_name: string;
  obs_count: number;
  avg_delay_delta: number;
  total_delay_added: number;
  avg_observed_seconds: number;
  distance_meters: number;
  avg_speed_kmh: number;
}

export interface BottleneckResponse {
  agency: string;
  ts: string;
  bottlenecks: SegmentBottleneck[];
}

export async function fetchSegmentBottlenecks(agency: string, limit: number = 10): Promise<BottleneckResponse> {
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/intelligence/bottlenecks?agency=${encodeURIComponent(agency)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch bottlenecks: ${res.status}`);
  return res.json();
}

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

export async function fetchGhostBuses(agency: string, window: number = 60): Promise<GhostResponse> {
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/intelligence/ghosts?agency=${encodeURIComponent(agency)}&window=${window}`);
  if (!res.ok) throw new Error(`Failed to fetch ghost buses: ${res.status}`);
  return res.json();
}

export interface StopDwell {
  route_id: string;
  route_name: string;
  stop_id: string;
  stop_name: string;
  obs_count: number;
  avg_dwell_seconds: number;
  max_dwell_seconds: number;
}

export interface DwellResponse {
  agency: string;
  ts: string;
  dwells: StopDwell[];
}

export async function fetchStopDwells(agency: string, limit: number = 10): Promise<DwellResponse> {
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/intelligence/dwells?agency=${encodeURIComponent(agency)}&limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch stop dwells: ${res.status}`);
  return res.json();
}

export interface StopAdherenceRecord {
  stopId: string;
  stopSequence: number | null;
  stopName: string | null;
  sampleCount: number;
  avgDelaySeconds: number;
  medianDelaySeconds: number;
  onTimePct: number;
  earlyCount: number;
  lateCount: number;
  onTimeCount: number;
}

export interface StopAdherenceResponse {
  agency: string;
  route: string;
  hours: number;
  ts: string;
  stops: StopAdherenceRecord[];
}

export async function fetchStopAdherence(agency: string, route: string, hours: number = 24): Promise<StopAdherenceResponse> {
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/intelligence/stop-adherence?agency=${encodeURIComponent(agency)}&route=${encodeURIComponent(route)}&hours=${hours}`);
  if (!res.ok) throw new Error(`Failed to fetch stop adherence: ${res.status}`);
  return res.json();
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export interface AlertThreshold {
    id: string;
    agency_account_id: string;
    target_type: string;
    target_id?: string;
    metric: string;
    comparison: string;
    value: number;
    cooldown_minutes: number;
    notion_enabled: boolean;
    last_fired_at: string | null;
    created_at: string;
}

export async function fetchAlertThresholds(): Promise<AlertThreshold[]> {
    const res = await fetchWithAuth(`${ATLAS_BASE}/api/alerts/thresholds`);
    if (!res.ok) throw new Error(`Failed to fetch thresholds: ${res.status}`);
    return res.json();
}

export async function createAlertThreshold(data: any): Promise<AlertThreshold> {
    const res = await fetchWithAuth(`${ATLAS_BASE}/api/alerts/thresholds`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to create threshold: ${res.status}`);
    return res.json();
}

export async function deleteAlertThreshold(id: string): Promise<void> {
    const res = await fetchWithAuth(`${ATLAS_BASE}/api/alerts/thresholds/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete threshold: ${res.status}`);
}

// ── Screener & Catalog ───────────────────────────────────────────────────────

export interface ScreenRoute {
  gtfs_route_id: string;
  route_short_name: string;
  route_long_name: string;
  mode_category: string;
  tier: string;
  avg_headway: string;
  base_headway: string;
  peak_headway: string;
  service_span_start: number;
  service_span_end: number;
  trip_count: number;
  reliability_score: string;
  circuity_index?: number; // Added to fix StrategicAudit TS error
}

export interface ScreenResponse {
  agency: string;
  feedVersionId: string;
  dayType: string;
  count: number;
  routes: ScreenRoute[];
}

export async function screenRoutes(params: any): Promise<ScreenResponse> {
  const search = new URLSearchParams(params).toString();
  const res = await fetch(`${ATLAS_BASE}/api/screen?${search}`);
  if (!res.ok) throw new Error(`Failed to screen routes: ${res.status}`);
  return res.json();
}

// ── Live Utilities ───────────────────────────────────────────────────────────

export async function fetchLiveRoutes(agency: string): Promise<string[]> {
  const res = await fetch(`${ATLAS_BASE}/api/live/routes?agency=${encodeURIComponent(agency)}`);
  if (!res.ok) throw new Error(`Failed to fetch live routes: ${res.status}`);
  const data = await res.json();
  return data.routes;
}

export async function fetchLiveStops(agency: string, route: string): Promise<string[]> {
  const res = await fetch(`${ATLAS_BASE}/api/live/stops?agency=${encodeURIComponent(agency)}&route=${encodeURIComponent(route)}`);
  if (!res.ok) throw new Error(`Failed to fetch live stops: ${res.status}`);
  const data = await res.json();
  return data.stops;
}

export async function fetchSilentRoutes(agency: string): Promise<any> {
    const res = await fetch(`${ATLAS_BASE}/api/intelligence/ghosts?agency=${encodeURIComponent(agency)}`);
    return res.json();
}

export interface StopArrival {
    vehicleId: string;
    arrivedAt: string;
    gapMins: number | null;
}

export interface StopArrivalResponse {
    agency: string;
    route: string;
    stop: string;
    windowMins: number;
    arrivals: StopArrival[];
    stats: {
        count: number;
        avgGapMins: number | null;
        maxGapMins: number | null;
        bunchingCount: number;
    };
    yesterday: {
        count: number;
        avgGapMins: number | null;
    };
}

export async function fetchStopArrivals(agency: string, route: string, stop: string, minutes: number = 60): Promise<StopArrivalResponse> {
    const res = await fetch(`${ATLAS_BASE}/api/live/arrivals?agency=${encodeURIComponent(agency)}&route=${encodeURIComponent(route)}&stop=${encodeURIComponent(stop)}&minutes=${minutes}`);
    if (!res.ok) throw new Error(`Failed to fetch arrivals: ${res.status}`);
    return res.json();
}

// ── Simulator (R&D) ──────────────────────────────────────────────────────────

export async function fetchSimulateRoutes(agency: string): Promise<any> {
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/import/agencies/${encodeURIComponent(agency)}/simulate/routes`);
  if (!res.ok) throw new Error(`Failed to fetch simulate routes: ${res.status}`);
  return res.json();
}

export async function fetchSimulateRoute(agency: string, routeId: string): Promise<any> {
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/import/agencies/${encodeURIComponent(agency)}/simulate/route/${encodeURIComponent(routeId)}`);
  if (!res.ok) throw new Error(`Failed to fetch simulate route: ${res.status}`);
  return res.json();
}

// ── Corridors & Audit ────────────────────────────────────────────────────────

export interface CorridorPerformance {
  link_id: string;
  stop_a_id?: string;
  stop_b_id?: string;
  stop_a_name: string;
  stop_b_name: string;
  route_ids?: string[];
  route_short_names: string[];
  scheduled_headway_min: number;
  actual_headway_min: number;
  reliability_score: number;
  is_bunching: boolean;
  observed_arrivals?: number;
}

export interface CorridorResponse {
  agency: string;
  corridors: CorridorPerformance[];
}

export async function fetchCorridors(params?: any): Promise<CorridorResponse> {
  const search = new URLSearchParams(params).toString();
  const res = await fetch(`${ATLAS_BASE}/api/corridors?${search}`);
  if (!res.ok) throw new Error(`Failed to fetch corridors: ${res.status}`);
  return res.json();
}

export async function fetchCorridorPerformance(agency: string, window: number = 60): Promise<CorridorResponse> {
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/corridors/performance?agency=${encodeURIComponent(agency)}&window=${window}`);
  if (!res.ok) throw new Error(`Failed to fetch corridor performance: ${res.status}`);
  return res.json();
}

export interface AuditResult {
  agency: string;
  pivotDate: string;
  before: { start: string; end: string; version: string; results: CorridorPerformance[] };
  after: { start: string; end: string; version: string; results: CorridorPerformance[] };
}

export async function auditServiceChange(agency: string): Promise<AuditResult> {
  const res = await fetchWithAuth(`${ATLAS_BASE}/api/intelligence/audit-service-change?agency=${encodeURIComponent(agency)}`);
  if (!res.ok) throw new Error(`Failed to audit service change: ${res.status}`);
  return res.json();
}

// ── Backward Compatibility (Temporary) ───────────────────────────────────────

export async function fetchTrends(): Promise<any> { return { trends: [] }; }
export async function fetchMatchDiagnostics(agency?: string): Promise<any> {
    const res = await fetchWithAuth(`${ATLAS_BASE}/api/intelligence/match-diagnostics${agency ? `?agency=${encodeURIComponent(agency)}` : ''}`);
    return res.json();
}
export async function importFeed(feedFile: File | string, slug: string, name: string): Promise<any> {
    const formData = new FormData();
    formData.append('feed', feedFile);
    formData.append('name', name);
    const res = await fetchWithAuth(`${ATLAS_BASE}/api/import/agencies/${encodeURIComponent(slug)}`, {
        method: 'POST',
        body: formData,
    });
    return res.json();
}
export type TrendPoint = any;
export type MatchDiagnosticEntry = any;
export type Corridor = any;
export type ScreenParams = any;
export type SilentRoute = any;
