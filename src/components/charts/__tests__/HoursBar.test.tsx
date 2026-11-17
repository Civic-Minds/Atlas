import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HoursBar from '../HoursBar';
import { headwayPeriodShape, periodShapeParts } from '../../../utils/headwayText';

const axis = { first: 5, last: 23 };
// 6:53 AM to 6:27 PM: about 64% of a 5 AM to midnight axis, over the old 45% cutoff.
const runs = { hours: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], first: 6 * 60 + 53, last: 18 * 60 + 27 };
// The text line above the bar.
const shown = (c: HTMLElement) => [c.querySelector('[role="img"] > div')?.textContent];

describe('HoursBar time label (#1569, CIV-1787)', () => {
  it('writes one range above the bar, never two times split at the ends', () => {
    const { container } = render(<HoursBar runs={runs} axis={axis} />);
    expect(shown(container)).toEqual(['6:53 AM–6:27 PM']);
  });

  it('writes the one known end alone, with no guessed time', () => {
    const { container } = render(<HoursBar runs={{ ...runs, last: undefined }} axis={axis} />);
    expect(shown(container)).toEqual(['6:53 AM']);
  });
});

describe('a period cell’s note on its own line (CIV-1772)', () => {
  it('splits off the gap, start or end note and keeps every word', () => {
    for (const shape of [{ every: 20, gap: 37 }, { every: 30, from: '7:05 AM' }, { every: 45, until: '9:09 PM' }]) {
      const text = headwayPeriodShape(shape);
      const { main, note } = periodShapeParts(text);
      expect(main).toBe('every ' + shape.every + ' min');
      expect(note).not.toBeNull();
      expect(text.replace(', with ', ' ')).toBe(`${main} ${note}`);
      if (shape.gap != null) expect(note).toBe(`one ${shape.gap} min gap`);
    }
  });

  it('leaves a plain value whole', () => {
    for (const text of ['every 20 min', '20–30 min', 'every 20–30 min', 'Irregular']) expect(periodShapeParts(text)).toEqual({ main: text, note: null });
  });
});
