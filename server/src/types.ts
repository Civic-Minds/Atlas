export interface Agency {
  id: string;
  name: string;
  vehiclePositionsUrl: string;
  tripUpdatesUrl?: string;
  headers?: Record<string, string>;
  matchRealtime?: boolean;
  pollingIntervalMs?: number;
  limit?: {
    requestsPerHour: number;
    notes?: string;
  };
}

export interface VehiclePosition {
  agencyId:      string;
  vehicleId:     string;
  tripId:        string;
  routeId:       string;
  lat:           number;
  lon:           number;
  speed:         number | null;
  bearing:       number | null;
  stopId:        string | null;
  stopSequence:  number | null;
  currentStatus: number | null;
  delaySeconds:  number | null;  // New in 0.13.0 Phase 2
  matchConfidence: number | null; // Spatially matched confidence
  isDetour?:      boolean;       // New in Phase 2+ (Detour Awareness)
  distFromShape?:  number;        // Meters from assigned GTFS shape
  observedAt:    Date;
}

export interface GtfsStopTime {
  tripId: string;
  stopId: string;
  stopSequence: number;
  arrivalTime: number;   // Minutes from midnight
  departureTime: number;
  stopLat?: number;
  stopLon?: number;
}

export interface SegmentMetric {
  agencyId:             string;
  tripId:               string;
  routeId:              string;
  fromStopId:           string;
  toStopId:             string;
  observedSeconds:      number;
  scheduledSeconds:     number;
  delayDeltaSeconds:    number;
  observedAt:           Date;
}

export interface StopDwellMetric {
  agencyId:             string;
  tripId:               string;
  routeId:              string;
  stopId:               string;
  dwellSeconds:         number;
  observedAt:           Date;
}
