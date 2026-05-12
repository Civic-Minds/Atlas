import { create } from 'zustand';

const AGENCY_CENTERS: Record<string, [number, number]> = {
  ttc: [43.6532, -79.3832],
  mbta: [42.3601, -71.0589],
  muni: [37.7749, -122.4194],
  trimet: [45.5051, -122.675],
  metrotransit: [44.9778, -93.265],
  octranspo: [45.4215, -75.6972],
  mtabus: [40.7128, -74.006],
  translink: [49.2827, -123.1207],
  wego: [36.1627, -86.7816],
  mcts: [43.0389, -87.9065],
  septa: [39.9526, -75.1652],
  edmonton: [53.5461, -113.4938],
  vta: [37.3382, -121.8863],
  drt: [43.8971, -78.8658],
  actransit: [37.8044, -122.2712],
  sta: [47.6588, -117.426],
  gcrta: [41.4993, -81.6944],
  halifax: [44.6488, -63.5752],
  'nyc-subway': [40.7580, -73.9855],
};

const DEFAULT_AGENCY = 'sta';

interface Agency {
  slug: string;
  display_name: string;
}

interface AtlasStore {
  agencies: Agency[];
  selectedAgency: string;
  center: [number, number];
  setAgencies: (agencies: Agency[]) => void;
  selectAgency: (slug: string) => void;
}

export const useAtlasStore = create<AtlasStore>((set) => ({
  agencies: [],
  selectedAgency: DEFAULT_AGENCY,
  center: AGENCY_CENTERS[DEFAULT_AGENCY],
  setAgencies: (agencies) => set({ agencies }),
  selectAgency: (slug) =>
    set({
      selectedAgency: slug,
      center: AGENCY_CENTERS[slug] ?? AGENCY_CENTERS[DEFAULT_AGENCY],
    }),
}));
