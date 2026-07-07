export interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  properties: Record<string, unknown>;
}

export interface StopEntry {
  name: string;
  lat: number;
  lon: number;
}
