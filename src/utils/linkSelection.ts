/**
 * Whether a route, stop or on-demand value from a link can never open a card (#1191): it isn't "slug::id" (a route
 * or stop), or its agency isn't in the catalog. Null while the catalog is still loading, so a link isn't dropped
 * before Atlas knows which agencies exist. A well-formed value for a known agency is false here: whether that route,
 * stop or zone is in the agency's data is decided once the data loads.
 */
export function linkValueUnknown(
  value: string,
  catalog: ReadonlyArray<{ slug: string }>,
  kind: 'route' | 'stop' | 'onDemand',
): boolean | null {
  const separator = value.indexOf('::');
  const slug = separator >= 0 ? value.slice(0, separator) : value;
  const id = separator >= 0 ? value.slice(separator + 2) : '';
  // A route or stop names its agency and its id; an on-demand value may name only the agency.
  if (!/^[a-z0-9-]+$/.test(slug) || (kind !== 'onDemand' && !id) || (separator >= 0 && !id)) return true;
  if (catalog.length === 0) return null;
  return !catalog.some(a => a.slug === slug);
}
