import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STUDIO_DEFAULT_AGENCY, studioAgenciesFromFiles, studioAgencyFrom, studioPageFor, studioPageFrom } from '../../shared/studioAgencies';
import { INTERNAL_NAV_LABEL, SITE_NAV_LABEL } from '../content/noticeCopy';
import type { StudioVehicleGroup } from '../../shared/studioVehicles';

const flags = vi.hoisted(() => ({ studio: true }));
vi.mock('../../shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: new Proxy(actual.FEATURES, { get: (t, k) => (k === 'studio' || k === 'internal' ? flags.studio : (t as Record<string | symbol, unknown>)[k]) }) };
});

const { default: SiteHeader } = await import('../components/SiteHeader');
const { StudioGroupFigures } = await import('../apps/studio/StudioGroupFigures');
const { groupFor } = await import('../apps/studio/fleetModel');

describe('Studio link in the header (CIV-1694)', () => {
  it('shows with the flag on and opens /studio', () => {
    flags.studio = true;
    render(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute('href', '/studio');
  });

  it('sits first in the internal link bar, above the public links (CIV-1872, was after Docs in CIV-1745)', () => {
    flags.studio = true;
    render(<SiteHeader />);
    const internal = within(screen.getByRole('navigation', { name: INTERNAL_NAV_LABEL })).getAllByRole('link').map(l => l.textContent?.trim());
    expect(internal[0]).toBe('Studio');
    const publicLinks = within(screen.getByRole('navigation', { name: SITE_NAV_LABEL })).getAllByRole('link').map(l => l.textContent?.trim() ?? '');
    expect(publicLinks).not.toContain('Studio');
    expect(publicLinks.slice(-2)).toEqual(['Docs', expect.stringMatching(/Go to Atlas/)]);
  });

  it('is not there with the flag off', () => {
    flags.studio = false;
    render(<SiteHeader />);
    expect(screen.queryByRole('link', { name: 'Studio' })).toBeNull();
    flags.studio = true;
  });
});

const GROUPS: StudioVehicleGroup[] = [
  { routes: ['701', '702', '801', '802'], scheduled: 7, implied: 8, runningMin: 112, layoverMin: 29, atTarget: { 10: 15, 15: 10, 20: 8, 30: 5 } },
  { routes: ['11', '13'], scheduled: 2, implied: 2, runningMin: 113, layoverMin: null, atTarget: { 10: 12, 15: 8, 20: 6, 30: 4 } },
];

const cells = (label: string) => [...screen.getByRole('rowheader', { name: label }).closest('tr')!.querySelectorAll('th, td')].map(c => c.textContent);

describe('Studio buses-needed panel (CIV-1693, a sidebar panel since CIV-1731)', () => {
  it('gives the picked route\'s group: its routes, buses needed at each frequency with now marked, then running time and layover (CIV-1827)', () => {
    render(<StudioGroupFigures group={GROUPS[0]} />);
    expect(screen.getAllByRole('columnheader').map(c => c.textContent)).toEqual(['Frequency', 'Needed']);
    // Now (7 buses) sits by its count, between every 20 min (8) and every 30 min (5); its own frequency needs 8.
    expect(screen.getAllByRole('rowheader').map(c => c.textContent)).toEqual(['every 10 min', 'every 15 min', 'every 20 min', 'Scheduled nowNeeded 8', 'every 30 min', 'every 60 min']);
    const now = screen.getByRole('rowheader', { name: 'Scheduled nowNeeded 8' }).closest('tr')!;
    expect(now.getAttribute('aria-current')).toBe('true');
    expect(now.querySelector('td')!.textContent).toBe('7');
    expect(cells('every 15 min')).toEqual(['every 15 min', '10']);
    expect(cells('every 60 min')).toEqual(['every 60 min', '—']);
    expect(screen.getByText(/Running time/).closest('p')!.textContent).toBe('Running time 112 min · Layover 29 min');
    expect(screen.queryByText('Midday')).toBeNull();
  });

  it('leaves out the second line where the buses on the road match the frequency', () => {
    render(<StudioGroupFigures group={GROUPS[1]} />);
    expect(screen.getByRole('rowheader', { name: 'Scheduled now' }).closest('tr')!.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText(/Running time/).closest('p')!.textContent).toBe('Running time 113 min · Layover —');
  });

  it('never shows rail’s internal 5 or 8, even from an older file that has them', () => {
    const old = { ...GROUPS[1], targets: [5, 8, 10, 15, 30, 60], atTarget: { 5: 20, 8: 13, 10: 12 } } as StudioVehicleGroup;
    render(<StudioGroupFigures group={old} />);
    expect(screen.queryByRole('rowheader', { name: 'every 5 min' })).toBeNull();
    expect(screen.queryByRole('rowheader', { name: 'every 8 min' })).toBeNull();
    expect(cells('every 10 min')).toEqual(['every 10 min', '12']);
    expect(cells('every 20 min')).toEqual(['every 20 min', '—']);
  });

  it('says why other routes count where they share the open route’s buses, and offers no split choice (CIV-1827)', () => {
    render(<StudioGroupFigures group={{ ...GROUPS[0], atTargetEven: { 10: 17 } }} />);
    expect(screen.getByText('[Placeholder: 701, 702, 801 and 802 share buses, so these numbers cover all 4.]')).toBeTruthy();
    expect(screen.queryByRole('group')).toBeNull();
    expect(cells('every 10 min')).toEqual(['every 10 min', '15']);
  });

  it('says so when a time of day has no buses', () => {
    render(<StudioGroupFigures group={null} />);
    expect(screen.getByText('No buses at this time of day.')).toBeTruthy();
  });

  it('finds the group a route shares buses in', () => {
    const file = { slug: 'kingston', feed: 'f.zip', referenceDate: '20260917', periods: { midday: GROUPS } };
    expect(groupFor(file, '801', 'midday')!.routes).toEqual(['701', '702', '801', '802']);
    expect(groupFor(file, '801', 'evening')).toBeNull();
  });
});

describe('Studio agencies, from the built files (CIV-1806, CIV-1827)', () => {
  it('lists every agency with a Schedule Changes file, Kingston first, and nothing typed by hand', () => {
    expect(studioAgenciesFromFiles(['rtd-denver-before-after.json', 'hamilton-before-after.json', 'kingston-before-after.json', 'kingston-vehicles.json', 'hamilton-vehicles.json']))
      .toEqual(['kingston', 'hamilton', 'rtd-denver']);
  });

  it('adds a newly built file to the menu with no code change; a buses file alone adds nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'studio-'));
    for (const f of ['kingston-before-after.json', 'hamilton-before-after.json', 'ttc-vehicles.json']) writeFileSync(join(dir, f), '{}');
    expect(studioAgenciesFromFiles(readdirSync(dir))).toEqual(['kingston', 'hamilton']);
    writeFileSync(join(dir, 'ttc-before-after.json'), '{}');
    expect(studioAgenciesFromFiles(readdirSync(dir))).toEqual(['kingston', 'hamilton', 'ttc']);
    rmSync(dir, { recursive: true });
  });

  it('opens the agency the address names, when Studio has it, and Kingston otherwise', () => {
    const list = ['kingston', 'hamilton', 'rtd-denver'];
    expect(studioAgencyFrom('hamilton', list)).toBe('hamilton');
    expect(studioAgencyFrom(null, list)).toBe('kingston');
    expect(studioAgencyFrom('ttc', list)).toBe('kingston');
    expect(studioAgencyFrom('ttc', ['hamilton'])).toBe('hamilton');
    // Before the list loads, the address as written.
    expect(studioAgencyFrom('rtd-denver', null)).toBe('rtd-denver');
    expect(studioAgencyFrom(null, null)).toBe(STUDIO_DEFAULT_AGENCY);
  });
});

describe('Studio pages (CIV-1828)', () => {
  it('opens Live unless the address asks for Fleet', () => {
    expect(studioPageFrom(null)).toBe('live');
    expect(studioPageFrom('fleet')).toBe('fleet');
    expect(studioPageFrom('vehicles')).toBe('live');
  });

  it('opens each page on its own first agency when the address names one it lacks', () => {
    expect(studioAgencyFrom('kingston', ['ttc'], 'ttc')).toBe('ttc');
    expect(studioAgencyFrom(null, ['kingston', 'hamilton'])).toBe('kingston');
  });
});

describe('Studio opens the page that has the address\'s agency (CIV-1828)', () => {
  const lists = { live: ['ttc'], fleet: ['kingston', 'hamilton', 'rtd-denver'] };
  it('never swaps the agency: RTD with no page opens Fleet, TTC opens Live', () => {
    expect(studioPageFor(null, 'rtd-denver', lists)).toBe('fleet');
    expect(studioPageFor(null, 'ttc', lists)).toBe('live');
  });
  it('keeps a named page, and opens the default page for no agency or one no page has', () => {
    expect(studioPageFor('live', 'rtd-denver', lists)).toBe('live');
    expect(studioPageFor(null, null, lists)).toBe('live');
    expect(studioPageFor(null, 'nowhere', lists)).toBe('live');
  });
  it('waits for the lists it needs before choosing', () => {
    expect(studioPageFor(null, 'rtd-denver', { live: null, fleet: null })).toBeNull();
    expect(studioPageFor(null, 'rtd-denver', { live: ['ttc'], fleet: null })).toBeNull();
    expect(studioPageFor(null, 'ttc', { live: ['ttc'], fleet: null })).toBe('live');
  });
});
