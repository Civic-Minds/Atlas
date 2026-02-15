// Route Data Types & Helpers

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

// Registry of available routes
export const AVAILABLE_ROUTES = [
  { id: '504', name: '504 King' },
  { id: '501', name: '501 Queen' },
  { id: '510', name: '510 Spadina' },
];

import { haversineDistance } from '../../../core/utils';

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
