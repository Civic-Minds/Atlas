export interface Agency {
  id: string;
  name: string;
  vehiclePositionsUrl: string;
  tripUpdatesUrl?: string;
  headers?: Record<string, string>;
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
  observedAt:    Date;
}
