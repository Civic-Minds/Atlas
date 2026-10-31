/**
 * An agency's names as config/agencies/<slug>.json stores them (#1245): the official name, plus at most one of
 * its common name ("Edmonton Transit Service" → "ETS") or the qualifier that tells same-named agencies apart
 * ("BC Transit" → "Kelowna", "exo" → "Trains"). The registry `name` in index.json and the catalogs is built
 * from them, "Official (common or qualifier)", and keeps its old form exactly: search, sorting, the short-name
 * table and the published files are keyed on it. Display forms come from agencyNames() (src/utils/agencyName.ts).
 */
export interface AgencyNameFields {
  officialName: string;
  /** The name riders use, when it differs from the official one: an acronym or brand ("BART", "The M", "SFMTA - Muni"). */
  commonName?: string;
  /** What sets it apart from agencies with the same name: a place or service ("Mississauga", "Portland, OR", "Trains"). */
  nameQualifier?: string;
}

/** The registry name: "Edmonton Transit Service (ETS)", "MiWay (Mississauga)", or the official name alone. */
export function registryAgencyName(fields: AgencyNameFields): string {
  const extra = fields.commonName ?? fields.nameQualifier;
  return extra ? `${fields.officialName} (${extra})` : fields.officialName;
}

/** "Edmonton Transit Service (ETS)" as ["Edmonton Transit Service", "ETS"]; [name, null] with no bracket at the end. */
export function splitRegistryName(name: string): [string, string | null] {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name.trim());
  return m && m[1].trim() ? [m[1].trim(), m[2].trim()] : [name.trim(), null];
}

/** The registry `name` of a config entry: built from its name fields, or an older entry's own `name` (a new agency from process-gtfs). */
export function configAgencyName(config: Record<string, unknown>): string | null {
  if (typeof config.officialName === 'string' && config.officialName.trim()) return registryAgencyName(config as unknown as AgencyNameFields);
  return typeof config.name === 'string' && config.name.trim() ? config.name : null;
}

/** A config entry as index.json carries it: `name` added in front of the name fields, everything else in place. */
export function indexEntryFromConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (typeof config.officialName !== 'string') return config;
  const entry: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === 'name') continue;
    if (key === 'officialName') entry.name = configAgencyName(config);
    entry[key] = value;
  }
  return entry;
}

/** An index.json entry written back to its config file: the built `name` dropped when the name fields are there. */
export function configFromIndexEntry<T extends Record<string, unknown>>(entry: T): T {
  if (typeof entry.officialName !== 'string') return entry;
  const { name: _built, ...config } = entry;
  return config as T;
}
