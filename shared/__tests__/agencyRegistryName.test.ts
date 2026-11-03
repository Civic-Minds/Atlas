import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configAgencyName, configFromIndexEntry, indexEntryFromConfig, registryAgencyName, splitRegistryName, withRegistryName } from '../agencyRegistryName';
import { agencyNames } from '../../src/utils/agencyName';

const CONFIG_DIR = join(import.meta.dirname, '../../config/agencies');
const configs = readdirSync(CONFIG_DIR)
  .filter(f => f.endsWith('.json') && f !== 'order.json')
  .map(f => JSON.parse(readFileSync(join(CONFIG_DIR, f), 'utf8')) as Record<string, unknown>);
const index = JSON.parse(readFileSync(join(import.meta.dirname, '../../public/data/index.json'), 'utf8')) as { agencies: Array<Record<string, unknown>> };

describe('agency name fields (#1245)', () => {
  it('builds the registry name from the official name and its common name or qualifier', () => {
    expect(registryAgencyName({ officialName: 'Montgomery Transit', commonName: 'The M' })).toBe('Montgomery Transit (The M)');
    expect(registryAgencyName({ officialName: 'MiWay', nameQualifier: 'Mississauga' })).toBe('MiWay (Mississauga)');
    expect(registryAgencyName({ officialName: 'Calgary Transit' })).toBe('Calgary Transit');
    expect(splitRegistryName('Montgomery Transit (The M)')).toEqual(['Montgomery Transit', 'The M']);
    expect(splitRegistryName('Calgary Transit')).toEqual(['Calgary Transit', null]);
  });

  it('stores every agency by its name fields, never the bracketed name', () => {
    for (const c of configs) {
      expect(c, String(c.slug)).not.toHaveProperty('name');
      expect(typeof c.officialName, String(c.slug)).toBe('string');
      expect(c.officialName, String(c.slug)).not.toMatch(/\)$/);
      expect('commonName' in c && 'nameQualifier' in c, String(c.slug)).toBe(false);
    }
  });

  it('gives index.json the same name, built from the fields', () => {
    const bySlug = new Map(index.agencies.map(a => [a.slug, a]));
    for (const c of configs) expect(bySlug.get(c.slug)?.name, String(c.slug)).toBe(configAgencyName(c));
  });

  it('puts the built name where the old one was and drops it again on the way back to the config', () => {
    const config = { slug: 'm', officialName: 'Montgomery Transit', commonName: 'The M', region: 'Alabama' };
    const entry = indexEntryFromConfig(config);
    expect(Object.keys(entry)).toEqual(['slug', 'name', 'officialName', 'commonName', 'region']);
    expect(entry.name).toBe('Montgomery Transit (The M)');
    expect(configFromIndexEntry({ ...entry, lastRefreshedAt: '2026-10-31' })).toEqual({ ...config, lastRefreshedAt: '2026-10-31' });
    // A new agency from process-gtfs has only a name until its fields are written.
    expect(configFromIndexEntry({ slug: 'n', name: 'New Transit' })).toEqual({ slug: 'n', name: 'New Transit' });
    expect(configAgencyName({ slug: 'n', name: 'New Transit' })).toBe('New Transit');
  });

  it('lets agencyNames read the fields', () => {
    const fields = { name: 'ignored', officialName: 'Edmonton Transit Service', commonName: 'ETS' };
    expect(agencyNames(fields)).toEqual(agencyNames('Edmonton Transit Service (ETS)'));
  });
});

describe('renaming an agency (process-gtfs name argument, #1245)', () => {
  it('moves the new name into the fields, keeping the bracket kind', () => {
    const entry = { slug: 'm', name: 'Montgomery Transit (The M)', officialName: 'Montgomery Transit', commonName: 'The M', region: 'Alabama' };
    expect(withRegistryName(entry, 'Montgomery Area Transit (The M)')).toEqual({ slug: 'm', name: 'Montgomery Area Transit (The M)', officialName: 'Montgomery Area Transit', commonName: 'The M', region: 'Alabama' });
    expect(withRegistryName(entry, 'Montgomery Transit (The M)')).toEqual(entry);
    expect(configFromIndexEntry(withRegistryName(entry, 'The M Transit'))).toEqual({ slug: 'm', officialName: 'The M Transit', region: 'Alabama' });
  });
});
