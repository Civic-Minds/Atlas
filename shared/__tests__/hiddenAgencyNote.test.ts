import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAgencyCatalog } from '../agencyCatalog';
import { CATALOG_MODES } from '../../scripts/agencyIndexGeneration';
import { HIDDEN_AGENCY_REASONS, hiddenAgencyNote, hiddenAgencyNoteFor } from '../hiddenAgencyNote';

const root = resolve(import.meta.dirname, '../..');
const configDir = resolve(root, 'config/agencies');
const readConfig = (slug: string) => JSON.parse(readFileSync(resolve(configDir, `${slug}.json`), 'utf8')) as Record<string, unknown>;
const allConfigs = readdirSync(configDir)
  .filter(name => name.endsWith('.json') && name !== 'order.json')
  .map(name => readConfig(name.replace(/\.json$/, '')));

// CIV-1060: Ryan's approved wording, word for word (2026-11-13).
const APPROVED: Record<string, string> = {
  hocts: 'This agency’s trips can’t be shown because its data doesn’t say which days they run.',
  roswell: 'This agency’s route lines can’t be shown because its data doesn’t include them.',
  'tangipahoa-parish': 'This agency’s route lines can’t be shown because its data doesn’t include them.',
};

describe('hidden-agency notes (CIV-1060)', () => {
  it('builds every note from the one pattern', () => {
    expect(hiddenAgencyNote('[what]', '[why]')).toBe('This agency’s [what] can’t be shown because its data [why].');
    for (const { what, why } of Object.values(HIDDEN_AGENCY_REASONS)) {
      expect(hiddenAgencyNote(what, why)).toMatch(/^This agency’s .+ can’t be shown because its data .+\.$/);
    }
    expect(hiddenAgencyNoteFor(undefined)).toBeNull();
    expect(hiddenAgencyNoteFor('not-a-reason')).toBeNull();
  });

  it('pins the three approved sentences', () => {
    for (const [slug, sentence] of Object.entries(APPROVED)) {
      expect(hiddenAgencyNoteFor(readConfig(slug).hiddenReason)).toBe(sentence);
    }
  });

  it('gives only hidden agencies a known reason, and no correction note beside it', () => {
    for (const agency of allConfigs.filter(a => a.hiddenReason !== undefined)) {
      expect(agency.hiddenInProduction, String(agency.slug)).toBe(true);
      expect(hiddenAgencyNoteFor(agency.hiddenReason), String(agency.slug)).not.toBeNull();
      expect(agency.overrideNote, String(agency.slug)).toBeUndefined();
    }
  });

  it('keeps internal notes out of every browser catalog', () => {
    const internal = allConfigs.map(a => a.internalNote).filter((note): note is string => typeof note === 'string');
    expect(internal.length).toBeGreaterThanOrEqual(3);
    for (const mode of CATALOG_MODES) {
      const json = JSON.stringify(buildAgencyCatalog(allConfigs, mode));
      expect(json).not.toContain('"internalNote"');
      for (const note of internal) expect(json).not.toContain(note);
    }
    // The three agencies show only in dev; their entries carry no engineering wording a card could show.
    const dev = buildAgencyCatalog(allConfigs, 'dev').agencies;
    for (const slug of Object.keys(APPROVED)) {
      const entry = dev.find(a => a.slug === slug);
      expect(entry, slug).toBeDefined();
      expect(entry!.overrideNote, slug).toBeUndefined();
      expect(JSON.stringify(entry), slug).not.toMatch(/service_ids|shapes\.txt|route_type 3|Tracked in #216/);
    }
  });

  it('shows nothing for FXBGO! (the GTFS is the truth)', () => {
    expect(readConfig('fred-transit').overrideNote).toBeUndefined();
  });
});
