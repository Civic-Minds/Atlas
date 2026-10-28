// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import LegendItem from '../LegendItem';

// CIV-1070: a caller's display class replaces the default inline-flex, so a "flex" item is its own row.
describe('LegendItem display', () => {
  it('is inline by default', () => {
    const el = render(<LegendItem color="red">A</LegendItem>).container.firstElementChild!;
    expect(el.className.split(' ')).toContain('inline-flex');
  });
  it('takes the caller\'s flex instead of inline-flex', () => {
    const el = render(<LegendItem color="red" className="flex text-xs">A</LegendItem>).container.firstElementChild!;
    expect(el.className.split(' ')).not.toContain('inline-flex');
    expect(el.className.split(' ')).toContain('flex');
  });
  it('keeps inline-flex for a breakpoint-only display class', () => {
    const el = render(<LegendItem color="red" className="hidden sm:flex">A</LegendItem>).container.firstElementChild!;
    expect(el.className.split(' ')).toContain('inline-flex');
  });
});
