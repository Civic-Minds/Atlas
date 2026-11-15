import { describe, expect, it } from 'vitest';
import {
  HISTORY_AGENCY_SEARCH_PLACEHOLDER, PART_TIME_ROUTES_SEARCH, SEARCH_AGENCIES_PLACEHOLDER, SEARCH_ANY_PLACEHOLDER,
  SEARCH_FEEDS_PLACEHOLDER, SEARCH_HIDDEN_ROUTES_PLACEHOLDER, SEARCH_NIGHT_PLACEHOLDER, SEARCH_ROUTES_PLACEHOLDER,
  SEARCH_SHORT_PLACEHOLDER, SEARCH_VEHICLES_PLACEHOLDER, searchPlaceholder,
} from '../noticeCopy';
import { historyRouteSearchPlaceholder } from '../../utils/historyOpen';

// CIV-1569 part 7: search box hints start with "Find" (Ryan, 2026-11-14), from one searchPlaceholder.
// The check that nothing builds this by hand is in src/content/__tests__/styleGuard.test.ts (CIV-1578).
describe('search box hints (CIV-1569)', () => {
  it('"Find " + what the box finds + "…"', () => {
    expect(searchPlaceholder('routes')).toBe('Find routes…');
    expect(searchPlaceholder()).toBe('Find…');
    expect(SEARCH_ROUTES_PLACEHOLDER).toBe('Find routes…');
    expect(SEARCH_NIGHT_PLACEHOLDER).toBe('Find agencies or routes…');
    expect(SEARCH_VEHICLES_PLACEHOLDER).toBe('Find vehicles…');
    expect(SEARCH_AGENCIES_PLACEHOLDER).toBe('Find agencies…');
    expect(SEARCH_HIDDEN_ROUTES_PLACEHOLDER).toBe('Find hidden routes…');
    expect(SEARCH_FEEDS_PLACEHOLDER).toBe('Find feeds…');
    expect(PART_TIME_ROUTES_SEARCH).toBe('Find part-time routes…');
    expect(SEARCH_ANY_PLACEHOLDER).toBe('Find…');
    expect(SEARCH_SHORT_PLACEHOLDER).toBe('Find');
    expect(HISTORY_AGENCY_SEARCH_PLACEHOLDER).toBe('Find an agency…');
    expect(historyRouteSearchPlaceholder('MARTA')).toBe('Find a MARTA route…');
  });
});
