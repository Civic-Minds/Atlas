/**
 * How an area is named in page text: the commonly used region name where there is one, else "the [City] area".
 * One small table, used by area and agency pages, titles and meta text so everything matches. /area/ slugs are unchanged.
 */
const REGION_NAMES: Record<string, string> = {
  toronto: 'the Greater Toronto and Hamilton Area',
  vancouver: 'Metro Vancouver',
  montreal: 'Greater Montréal',
  kitchener: 'Waterloo Region',
  'san-francisco': 'the Bay Area',
  'los-angeles': 'Greater Los Angeles',
  'new-york': 'the New York metropolitan area',
  washington: 'the Washington, D.C. area',
  chicago: 'the Chicago metropolitan area',
  dallas: 'the Dallas–Fort Worth area',
  minneapolis: 'the Twin Cities',
  riverside: 'the Inland Empire',
  'portland-or-wa': 'the Portland metro area',
  tampa: 'the Tampa Bay area',
  miami: 'South Florida',
  philadelphia: 'Greater Philadelphia',
  boston: 'Greater Boston',
  atlanta: 'Metro Atlanta',
  detroit: 'Metro Detroit',
  durham: 'the Durham–Chapel Hill area',
  'kiryas-joel': 'the Mid-Hudson region',
  'wilkes-barre': 'the Scranton–Wilkes-Barre area',
  oxnard: 'Ventura County',
  'virginia-beach': 'Hampton Roads',
  davenport: 'the Quad Cities',
  janesville: 'the Janesville–Beloit area',
  blacksburg: 'the New River Valley',
  bremerton: 'Kitsap County',
  'louisville-jefferson-county': 'the Louisville area',
};

/** "the Greater Toronto and Hamilton Area", "Metro Vancouver", "the Calgary area": reads inside a sentence. */
export function areaRegionName(area: { slug: string; name: string }): string {
  return REGION_NAMES[area.slug] ?? `the ${area.name} area`;
}

/** The same name without a leading "the", for headings and titles: "Greater Toronto and Hamilton Area", "Bay Area". */
export function areaRegionTitle(area: { slug: string; name: string }): string {
  return areaRegionName(area).replace(/^the /, '').replace(/^\w/, c => c.toUpperCase());
}

/** The same name starting a sentence: "The Greater Toronto and Hamilton Area", "Metro Vancouver". */
export function areaRegionSentenceStart(area: { slug: string; name: string }): string {
  return areaRegionName(area).replace(/^\w/, c => c.toUpperCase());
}
