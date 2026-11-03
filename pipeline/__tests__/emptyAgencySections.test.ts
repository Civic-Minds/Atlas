import { describe, expect, it } from 'vitest';
import { applyAgencySections, emptyAgencySections } from '../../shared/agencySections.js';

describe('emptyAgencySections (#1192)', () => {
  it('is a valid sections file that leaves every route feature unchanged', () => {
    const features = [
      { geometry: { type: 'LineString' }, properties: { routeId: '1', directionId: 0, day: 'Weekday', fullLine: 'keep' } },
      { geometry: { type: 'Point' }, properties: { stopId: 's1' } },
    ];
    const file = emptyAgencySections();
    expect(file.version).toBe(1);
    expect(file.sections).toEqual({});
    expect(applyAgencySections(features, file)).toEqual(features);
  });
});
