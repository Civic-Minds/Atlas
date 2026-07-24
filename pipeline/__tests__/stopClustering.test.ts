import { describe, expect, it } from 'vitest';
import { runStopClustering } from '../build-pmtiles';

describe('runStopClustering', () => {
  it('groups same-agency stops with the exact same name', () => {
    const stops: any[] = [
      {
        type: 'Feature',
        properties: { stopName: 'Union Station', agencySlug: 'ttc' },
        geometry: { type: 'Point', coordinates: [-79.38, 43.65] }
      },
      {
        type: 'Feature',
        properties: { stopName: 'Union Station', agencySlug: 'ttc' },
        geometry: { type: 'Point', coordinates: [-79.38 + 0.003, 43.65] }
      }
    ];

    runStopClustering(stops);

    expect(stops[0].properties.hubId).toBeDefined();
    expect(stops[0].properties.hubId).toBe(stops[1].properties.hubId);
  });

  it('groups stops of any agency within 150m proximity', () => {
    const stops: any[] = [
      {
        type: 'Feature',
        properties: { stopName: 'Bus Stop A', agencySlug: 'pace' },
        geometry: { type: 'Point', coordinates: [-79.38, 43.65] }
      },
      {
        type: 'Feature',
        properties: { stopName: 'Subway Platform B', agencySlug: 'cta' },
        geometry: { type: 'Point', coordinates: [-79.38, 43.65 + 80 / 111320] }
      }
    ];

    runStopClustering(stops);

    expect(stops[0].properties.hubId).toBe(stops[1].properties.hubId);
  });

  it('groups stops up to 250m if they share a significant name token', () => {
    const stops: any[] = [
      {
        type: 'Feature',
        properties: { stopName: 'Rosemont CTA Station', agencySlug: 'pace' },
        geometry: { type: 'Point', coordinates: [-79.38, 43.65] }
      },
      {
        type: 'Feature',
        properties: { stopName: 'Rosemont', agencySlug: 'cta' },
        geometry: { type: 'Point', coordinates: [-79.38, 43.65 + 200 / 111320] }
      }
    ];

    runStopClustering(stops);

    expect(stops[0].properties.hubId).toBe(stops[1].properties.hubId);
  });

  it('does not group far stops with different names', () => {
    const stops: any[] = [
      {
        type: 'Feature',
        properties: { stopName: 'Rosemont CTA Station', agencySlug: 'pace' },
        geometry: { type: 'Point', coordinates: [-79.38, 43.65] }
      },
      {
        type: 'Feature',
        properties: { stopName: 'O\'Hare', agencySlug: 'cta' },
        geometry: { type: 'Point', coordinates: [-79.38, 43.65 + 500 / 111320] }
      }
    ];

    runStopClustering(stops);

    expect(stops[0].properties.hubId).not.toBe(stops[1].properties.hubId);
  });

  it('assigns isHubRef to exactly one representative stop per hub, preferring rail/hubs', () => {
    const stops: any[] = [
      {
        type: 'Feature',
        properties: { stopName: 'Rosemont CTA Station', agencySlug: 'pace-bus', isRail: false, isHub: false, routeIds: ['811'] },
        geometry: { type: 'Point', coordinates: [-79.38, 43.65] }
      },
      {
        type: 'Feature',
        properties: { stopName: 'Rosemont', agencySlug: 'cta', isRail: true, isHub: true, routeIds: ['Blue'] },
        geometry: { type: 'Point', coordinates: [-79.38, 43.65 + 100 / 111320] }
      }
    ];

    runStopClustering(stops);

    expect(stops[0].properties.hubId).toBe(stops[1].properties.hubId);
    expect(stops[0].properties.isHubRef).toBeUndefined();
    expect(stops[1].properties.isHubRef).toBe(true); // The CTA rail station should be the representative
  });
});
