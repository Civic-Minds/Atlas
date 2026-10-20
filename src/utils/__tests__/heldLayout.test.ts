import { describe, expect, it } from 'vitest';
import { heldRowStyles } from '../heldLayout';

describe('heldRowStyles (sparkline hover keeps the card still)', () => {
  const size = { valueWidth: 132, rowHeight: 58 };
  it('holds nothing when not hovering', () => {
    expect(heldRowStyles(false, size)).toEqual({});
  });
  it('holds the pre-hover value width and row height as minimums while hovering', () => {
    expect(heldRowStyles(true, size)).toEqual({ row: { minHeight: 58 }, value: { minWidth: 132 } });
  });
  it('holds nothing before the row was measured, or for an empty measurement', () => {
    expect(heldRowStyles(true, null)).toEqual({});
    expect(heldRowStyles(true, { valueWidth: 0, rowHeight: 0 })).toEqual({});
  });
});
