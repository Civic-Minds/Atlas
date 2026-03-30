export interface Agency {
  id: string;
  name: string;
  vehiclePositionsUrl: string;
  tripUpdatesUrl?: string;
  headers?: Record<string, string>;
  matchRealtime?: boolean;
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
  observedAt:    Date;
}

export interface GtfsStopTime {
  tripId: string;
  stopId: string;
  stopSequence: number;
  arrivalTime: number;   // Minutes from midnight
  departureTime: number;
}
