import { describe, it, expect } from 'vitest';
import { clipToStopIds } from '../lineClip';

const coords = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
const order = ['a', 'b', 'c', 'd', 'e'];
const pos = [0, 0.25, 0.5, 0.75, 1];

describe('clipToStopIds', () => {
  it('draws one piece for consecutive night stops', () => {
    const pieces = clipToStopIds(coords, order, pos, ['b', 'c', 'd'])!;
    expect(pieces).toHaveLength(1);
  });
  it('splits at a gap in the stop order', () => {
    const pieces = clipToStopIds(coords, order, pos, ['a', 'b', 'd', 'e'])!;
    expect(pieces).toHaveLength(2);
  });
  it('returns null without stop positions so the whole line is drawn', () => {
    expect(clipToStopIds(coords, order, undefined, ['a', 'b'])).toBeNull();
  });
});
