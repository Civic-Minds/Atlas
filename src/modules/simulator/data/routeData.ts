// Route Data Types & Helpers — Agency-agnostic
// Routes are derived from uploaded GTFS data, not hardcoded.

import { haversineDistance } from '../../../core/utils';
import { GtfsData } from '../../../types/gtfs';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isTerminal?: boolean;
}

export interface RouteConfig {
  id: string;
  name: string;
  color: string;
  stops: Stop[];
  // Polyline for the full route shape
  shape: [number, number][];
}

export interface AvailableRoute {
  id: string;
  name: string;
  type: string;
  color: string;
}

// Palette for auto-assigning route colors when GTFS doesn't provide one
const ROUTE_COLORS = [
  '#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#EC4899', '#14B8A6', '#F97316', '#3B82F6',
];

/**
 * Extracts a list of available routes from parsed GTFS data.
 * Returns route_id + display name (short_name or long_name).
 */
export function getAvailableRoutes(gtfs: GtfsData): AvailableRoute[] {
  return gtfs.routes
    .map((r, i) => ({
      id: r.route_id,
      name: r.route_short_name
        ? `${r.route_short_name}${r.route_long_name ? ' — ' + r.route_long_name : ''}`
        : r.route_long_name || r.route_id,
      type: r.route_type,
      color: r.route_color ? `#${r.route_color}` : ROUTE_COLORS[i % ROUTE_COLORS.length],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/**
 * Builds a RouteConfig for the Simulator from GTFS data.
 * Extracts stops in sequence and the shape polyline for a given route.
 */
export function buildRouteConfig(
  gtfs: GtfsData,
  routeId: string,
  directionId: string = '0',
  colorIndex: number = 0
): RouteConfig | null {
  const { routes, trips, stopTimes, stops, shapes } = gtfs;

  const route = routes.find(r => r.route_id === routeId);
  if (!route) return null;

  // Find the first trip for this route + direction to get the stop sequence
  const trip = trips.find(
    t => t.route_id === routeId && (t.direction_id || '0') === directionId
  );
  if (!trip) return null;

  // Get stop times for this trip, sorted by sequence
  const tripStopTimes = stopTimes
    .filter(st => st.trip_id === trip.trip_id)
    .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));

  if (tripStopTimes.length < 2) return null;

  // Build stop list
  const stopMap = new Map(stops.map(s => [s.stop_id, s]));
  const routeStops: Stop[] = [];

  for (let i = 0; i < tripStopTimes.length; i++) {
    const st = tripStopTimes[i];
    const stop = stopMap.get(st.stop_id);
    if (!stop) continue;

    routeStops.push({
      id: stop.stop_id,
      name: stop.stop_name,
      lat: parseFloat(stop.stop_lat),
      lng: parseFloat(stop.stop_lon),
      isTerminal: i === 0 || i === tripStopTimes.length - 1,
    });
  }

  if (routeStops.length < 2) return null;

  // Build shape polyline
  let shape: [number, number][] = [];
  if (trip.shape_id) {
    const matchedShape = shapes.find(s => s.id === trip.shape_id);
    if (matchedShape) {
      shape = matchedShape.points;
    }
  }

  // Fallback: if no shape, connect the stops directly
  if (shape.length === 0) {
    shape = routeStops.map(s => [s.lat, s.lng] as [number, number]);
  }

  // Route color: prefer GTFS color, fallback to palette
  const color = route.route_color
    ? `#${route.route_color}`
    : ROUTE_COLORS[colorIndex % ROUTE_COLORS.length];

  const displayName = route.route_short_name
    ? `${route.route_short_name}${route.route_long_name ? ' — ' + route.route_long_name : ''}`
    : route.route_long_name || routeId;

  return {
    id: routeId,
    name: displayName,
    color,
    stops: routeStops,
    shape,
  };
}

// Pre-calculate total route distance
export function getTotalRouteDistance(stops: Stop[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    total += haversineDistance(
      stops[i - 1].lat, stops[i - 1].lng,
      stops[i].lat, stops[i].lng
    );
  }
  return total;
}
