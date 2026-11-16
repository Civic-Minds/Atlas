// Where a US state's OpenStreetMap extract can be downloaded, in the order to try (CIV-1179).
// Geofabrik is first. Its fallback is the openstreetmap.fr mirror, which has a few states as
// their own files and the rest only inside its four Census-region files (us-west, us-south,
// us-midwest, us-northeast), so a state not found there falls back to its region's file. The
// walking network is cut to each agency's area afterwards, so a region file gives the same
// result as the state's own. Alaska and Hawaii are in no mirror region.

export const stateSlug = name => name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');

const REGIONS = {
  'us-northeast': ['Connecticut', 'Maine', 'Massachusetts', 'New Hampshire', 'Rhode Island', 'Vermont', 'New Jersey', 'New York', 'Pennsylvania'],
  'us-midwest': ['Illinois', 'Indiana', 'Michigan', 'Ohio', 'Wisconsin', 'Iowa', 'Kansas', 'Minnesota', 'Missouri', 'Nebraska', 'North Dakota', 'South Dakota'],
  'us-south': ['Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Maryland', 'North Carolina', 'South Carolina', 'Virginia', 'West Virginia', 'Alabama', 'Kentucky', 'Mississippi', 'Tennessee', 'Arkansas', 'Louisiana', 'Oklahoma', 'Texas'],
  'us-west': ['Arizona', 'Colorado', 'Idaho', 'Montana', 'Nevada', 'New Mexico', 'Utah', 'Wyoming', 'California', 'Oregon', 'Washington'],
};
export const mirrorRegion = name => Object.entries(REGIONS).find(([, states]) => states.some(state => state.toLowerCase() === name.toLowerCase()))?.[0] ?? null;

const MIRROR = 'https://download.openstreetmap.fr/extracts/north-america';

/** Sources for one state, as { path, url, attempts }, with paths under sourceRoot. */
export function stateSources(name, sourceRoot) {
  const slug = stateSlug(name);
  const sources = [{ path: `${sourceRoot}/${slug}-latest.osm.pbf`, url: `https://download.geofabrik.de/north-america/us/${slug}-latest.osm.pbf`, attempts: 3 }];
  const region = mirrorRegion(name);
  if (region) {
    const mirrorName = slug.replaceAll('-', '_');
    sources.push({ path: `${sourceRoot}/${slug}-latest.osm.pbf`, url: `${MIRROR}/${region}/${mirrorName}-latest.osm.pbf`, attempts: 6 });
    sources.push({ path: `${sourceRoot}/${region}-latest.osm.pbf`, url: `${MIRROR}/${region}-latest.osm.pbf`, attempts: 6 });
  }
  return sources;
}
