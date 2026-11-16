import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HoursBar from '../HoursBar';
import { headwayPeriodShape, periodShapeParts } from '../../../utils/headwayText';

const axis = { first: 5, last: 23 };
// 6:53 AM to 6:27 PM: about 64% of a 5 AM to midnight axis, over the old 45% cutoff.
const runs = { hours: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], first: 6 * 60 + 53, last: 18 * 60 + 27 };
const shown = (c: HTMLElement) => Array.from(c.querySelectorAll('span:not([data-measure])')).map(s => s.textContent);

/** Lays each label out as `px` wide at its anchor in a `width` px row, the way the browser would. */
function layout(width: number, px: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (!this.hasAttribute('data-measure')) return { left: 0, right: width, width } as DOMRect;
    const { left, right } = this.style;
    const l = left ? (parseFloat(left) / 100) * width : width - (parseFloat(right) / 100) * width - px;
    return { left: l, right: l + px, width: px } as DOMRect;
  });
}

describe('HoursBar time labels (#1569)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes one range when the two times would touch in a narrow bar', () => {
    layout(160, 60);
    const { container } = render(<HoursBar runs={runs} axis={axis} />);
    expect(shown(container)).toEqual(['6:53 AM–6:27 PM']);
  });

  it('writes the two times apart when they fit', () => {
    layout(400, 60);
    const { container } = render(<HoursBar runs={runs} axis={axis} />);
    expect(shown(container)).toEqual(['6:53 AM', '6:27 PM']);
  });
});

describe('a period cell’s note on its own line (CIV-1772)', () => {
  it('splits off the gap, start or end note and keeps every word', () => {
    for (const shape of [{ every: 20, gap: 37 }, { every: 30, from: '7:05 AM' }, { every: 45, until: '9:09 PM' }]) {
      const text = headwayPeriodShape(shape);
      const { main, note } = periodShapeParts(text);
      expect(main).toBe('every ' + shape.every + ' min');
      expect(note).not.toBeNull();
      expect(text.replace(', ', ' ')).toBe(`${main} ${note}`);
    }
  });

  it('leaves a plain value whole', () => {
    for (const text of ['every 20 min', '20–30 min', 'every 20–30 min', 'Irregular']) expect(periodShapeParts(text)).toEqual({ main: text, note: null });
  });
});
