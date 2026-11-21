import { describe, expect, it } from 'vitest';
import { RELEASES, WHATS_NEW, visibleWhatsNew } from './whatsNew';

describe('what\'s new per site (CIV-1999)', () => {
  const versions = RELEASES.map(r => r.version);
  const publicItems = visibleWhatsNew(false).flatMap(r => r.items);
  const betaItems = visibleWhatsNew(true).flatMap(r => r.items);

  it('gives every feature a line for at least one site, each in a real release', () => {
    for (const feature of WHATS_NEW) {
      expect(feature.public ?? feature.beta).toBeDefined();
      for (const line of [feature.public, feature.beta]) if (line) expect(versions).toContain(line.version);
    }
  });

  it('lists each feature once per site', () => {
    const leads = (items: typeof publicItems) => items.map(i => i.lead);
    expect(new Set(leads(publicItems)).size).toBe(publicItems.length);
    expect(new Set(leads(betaItems)).size).toBe(betaItems.length);
    expect(betaItems.length).toBe(WHATS_NEW.length);
    expect(publicItems.length).toBe(WHATS_NEW.filter(f => f.public).length);
  });

  it('shows Compare mode under 3.3 on beta and local, and under 3.4 on public, in each site\'s words', () => {
    const find = (includeBeta: boolean) => visibleWhatsNew(includeBeta).flatMap(r => r.items.filter(i => i.lead === 'Compare mode').map(i => [r.version, i.text, !!i.beta]));
    expect(find(true)).toEqual([['3.3.0', 'put any two days, times or frequencies side by side', true]]);
    expect(find(false)).toEqual([['3.4.0', 'put two maps side by side, each with its own place, day and time', false]]);
  });

  it('never shows a beta line, or a Beta tag, on public', () => {
    expect(publicItems.every(i => !i.beta)).toBe(true);
    expect(betaItems.filter(i => i.beta).length).toBe(WHATS_NEW.filter(f => f.beta).length);
  });

  it('keeps public lines whole for everyone: they never mention beta, nor read as "now on the public map"', () => {
    for (const feature of WHATS_NEW.filter(f => f.public)) {
      expect(`${feature.lead ?? ''} ${feature.public!.text}`.toLowerCase()).not.toMatch(/\bbeta\b|public map/);
    }
  });
});
