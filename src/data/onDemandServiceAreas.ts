import type { GeoJSON } from 'geojson';

/**
 * Agency-owned service-area geometry for services that do not publish route
 * shapes. Keep the source URL beside the geometry so the map never presents
 * an inferred boundary as scheduled-route data.
 */
export const BWG_ON_DEMAND_SERVICE_AREA: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: {
    agencySlug: 'bwg',
    serviceType: 'on-demand',
    sourceUrl: 'https://www.rideargo.com/cities/bwg#scroll-offset',
    sourceLabel: 'Argo service-area map',
  },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-79.55773129948528, 44.13139696540665],
      [-79.55814206717234, 44.12973015198938],
      [-79.5684572099634, 44.12717858098307],
      [-79.5696880669539, 44.12982261896309],
      [-79.5818373769259, 44.12854779970323],
      [-79.58170077280808, 44.12673550990198],
      [-79.58299733492184, 44.126637836140645],
      [-79.58593198688412, 44.12526638328981],
      [-79.58804776112108, 44.12639301417744],
      [-79.59957889898286, 44.1246268994027],
      [-79.59732900943276, 44.12046452773228],
      [-79.59971769856476, 44.11992567260202],
      [-79.60074013879994, 44.1218846982261],
      [-79.60701660566266, 44.120855559763015],
      [-79.59978956512752, 44.09316305450017],
      [-79.58511291974548, 44.09640281136157],
      [-79.58183507149586, 44.085511628277004],
      [-79.5770536731919, 44.08491648280247],
      [-79.5740491618818, 44.08687867637684],
      [-79.56503452392965, 44.0896243582541],
      [-79.55909473540221, 44.09369623716407],
      [-79.56073326072357, 44.104190342784676],
      [-79.55554293480915, 44.113751315758265],
      [-79.54953322123734, 44.11252558079329],
      [-79.5460506688907, 44.11237850370313],
      [-79.54611874450767, 44.11414352049897],
      [-79.55274370425197, 44.11610458550251],
      [-79.5554065493027, 44.117967529451874],
      [-79.55684059996976, 44.12051671280892],
      [-79.55404059174714, 44.12321290133488],
      [-79.55499905104973, 44.12654533360438],
      [-79.55103635079213, 44.12688914668769],
      [-79.55055823387339, 44.1300261455865],
      [-79.55294916264782, 44.130368863344415],
      [-79.55390576759396, 44.14262016941413],
      [-79.55773586282743, 44.14192872035048],
      [-79.55759778295163, 44.140607205411214],
      [-79.55691113269718, 44.13521996940875],
      [-79.55718551428798, 44.13281791824093],
      [-79.55773129948528, 44.13139696540665],
    ]],
  },
};

export const BWG_ON_DEMAND_AGENCY = {
  slug: 'bwg',
  name: 'BWG Transit',
  region: 'Ontario',
  center: [44.1115, -79.57] as [number, number],
  url: '',
  bbox: [44.08491648280247, -79.60701660566266, 44.14262016941413, -79.5460506688907] as [number, number, number, number],
  cities: ['Bradford, Ontario'],
  displayArea: 'Bradford West Gwillimbury',
  onDemandOnly: true,
  websiteUrl: 'https://www.townofbwg.com/living-in-bwg/roads-and-transit/transit/',
  onDemandServiceArea: {
    feature: BWG_ON_DEMAND_SERVICE_AREA,
    sourceUrl: 'https://www.rideargo.com/cities/bwg#scroll-offset',
    sourceLabel: 'Argo service-area map',
    sourceRetrievedAt: '2026-09-22',
    serviceHours: 'Mon–Fri 6:30 a.m.–7:30 p.m.; Sat 7:30 a.m.–7:30 p.m.; no Sunday service',
    bookingUrl: 'https://www.rideargo.com/cities/bwg#scroll-offset',
  },
};
