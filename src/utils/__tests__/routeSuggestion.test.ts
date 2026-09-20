import { describe, expect, it } from 'vitest';
import { combineSuggestedRouteNames, suggestedRouteGroupKey } from '../routeSuggestion';

describe('suggested route grouping', () => {
  it('groups BART north/south route variants by the line name', () => {
    expect(suggestedRouteGroupKey('bart', 'Grey-N')).toBe('Grey');
    expect(suggestedRouteGroupKey('bart', 'Grey-S')).toBe('Grey');
  });

  it('does not strip directional suffixes from other agencies', () => {
    expect(suggestedRouteGroupKey('ttc', '501-N')).toBe('501-N');
  });

  it('combines reversed directional endpoints', () => {
    expect(combineSuggestedRouteNames([
      "Oakland Int'l Airport OAK to Coliseum",
      'Coliseum to Oakland Int\'l Airport OAK',
    ])).toBe("Oakland Int'l Airport OAK ↔ Coliseum");
  });
});
