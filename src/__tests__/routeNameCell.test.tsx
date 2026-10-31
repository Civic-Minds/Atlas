import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RouteNameCell } from '../pageParts';

const text = (shortName: string, longName: string | null) =>
  render(<RouteNameCell shortName={shortName} longName={longName} mode={3} agencyName="Test" />).container.textContent;

describe('RouteNameCell (#1122)', () => {
  it('shows a route with no short name once, not its long name twice', () => {
    // The agency page data names it by its long name, so name and long name match.
    expect(text('West Ridge Via Coldwater Road', 'West Ridge Via Coldwater Road')).toBe('West Ridge Via Coldwater Road');
    expect(text('C1: East-West', 'C1: East-West')).toBe('C1: East-West');
  });
  it('keeps the label of a feed that gives both names the same code, and of an ordinary route', () => {
    expect(text('CMAX', 'CMAX')).toBe('CMAX');
    expect(text('10', 'Bathurst')).toBe('10 Bathurst');
  });
});

describe('RouteNameCell with the feed short name (CIV-984)', () => {
  const html = (name: string, feedShortName: string, longName: string | null) =>
    render(<RouteNameCell shortName={name} feedShortName={feedShortName} longName={longName} mode={3} agencyName="Test" />).container;
  it('labels the route as every other surface does', () => {
    expect(html('West Ridge Via Coldwater Road', '', 'West Ridge Via Coldwater Road').textContent).toBe('West Ridge Via Coldwater Road');
    expect(html('CMAX', 'CMAX', 'CMAX').textContent).toBe('CMAX');
    expect(html('10', '10', 'Bathurst').textContent).toBe('10 Bathurst');
    // A long name that leads with its number reads like the other surfaces: the number bold, the name muted.
    expect(html('Line 5 Plains', '', 'Line 5 Plains').querySelector('.font-black')?.textContent).toBe('Line 5');
  });
  it('keeps the route ID for a route with neither name', () => {
    expect(html('2', '', null).textContent).toBe('2');
  });
});
