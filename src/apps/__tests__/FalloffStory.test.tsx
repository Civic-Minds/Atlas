import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FalloffStory from '../FalloffStory';
import { falloffStudy, gthaAgencies, holdingNetworks, noneOnSundayEvening, steepestDrops } from '../../data/falloffStory';
import { FALLOFF_STORY } from '../../../shared/researchStories';
import { FEATURES, FEATURE_ROUTES } from '../../../shared/rules/flags';

// #1074 (CIV-770): the figures and lists of the outline Ryan approved (_reports/1074/OUTLINE.md, 2026-11-22).
describe('fall-off story (#1074)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  });

  it('reads the outline’s figures from the data file', () => {
    expect(falloffStudy.all).toMatchObject({ agencies: 551, routeKm: 234136, routes: 12341, weekdayMorning: 10.1, weekdayMidday: 10.9, saturdayMidday: 6.8, sundayEvening: 2.5 });
    expect(falloffStudy.sized).toEqual({ agencies: 495, noSunday: 123, noneOnSundayEvening: 34 });
    expect(noneOnSundayEvening).toBe(34);
    expect(steepestDrops.map(a => a.slug)).toEqual(['nyct-bus-brooklyn', 'exo-vallee-richelieu', 'cta', 'lacmta', 'gtrans', 'mta-bus-company', 'hamilton', 'brampton', 'nyct-bus-si', 'nyct-bus-bronx']);
    expect(holdingNetworks.map(a => a.slug).sort()).toEqual(['mbta', 'nyct-subway', 'rem', 'soundtransit', 'ttc']);
    expect(gthaAgencies).toHaveLength(9);
  });

  it('leaves agencies whose terms bar sharing out of the per-agency rows', () => {
    expect(falloffStudy.agencies.some(a => a.slug === 'wmata')).toBe(false);
  });

  it('is on the Frequent service story’s switch, at its own address', () => {
    expect(FEATURES.falloffStory).toBe(FEATURES.frequentService);
    expect(FALLOFF_STORY.path).toBe(FEATURE_ROUTES.falloffStory);
  });

  it('renders its heading and every section', () => {
    render(<FalloffStory />);
    expect(screen.getByRole('heading', { level: 1, name: FALLOFF_STORY.heading })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(6);
  });
});
