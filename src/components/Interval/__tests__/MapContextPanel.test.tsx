import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapContextPanel } from '../MapContextPanel';
import type { MapContextAgency } from '../../../utils/mapContext';

function agency(slug: string, name: string, shortNames: string[]): MapContextAgency {
  return {
    slug,
    name,
    routeCount: shortNames.length,
    routes: shortNames.map(shortName => ({ key: `${slug}:${shortName}`, agencySlug: slug, agencyName: name, shortName, longName: `${name} ${shortName}` })),
  };
}

const AGENCIES = [agency('ttc', 'TTC', ['501', '504']), agency('nfta', 'NFTA', ['5'])];
const REGIONS = new Map([['ttc', 'Ontario'], ['nfta', 'New York'], ['stm', 'Quebec']]);

describe('MapContextPanel region pills', () => {
  it('shows only regions in view and filters the route list', () => {
    render(<MapContextPanel agencies={AGENCIES} mode="routes" regionBySlug={REGIONS} />);
    expect(screen.getAllByRole('button', { pressed: false }).map(b => b.textContent)).toEqual(['New York', 'Ontario']);
    expect(screen.queryByRole('button', { name: 'Quebec' })).toBeNull();
    expect(screen.getByText('3 routes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ontario' }));
    expect(screen.getByText('2 routes')).toBeInTheDocument();
    expect(screen.queryByText('NFTA')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('3 routes')).toBeInTheDocument();
  });

  it('hides the pills when everything in view is in one region', () => {
    render(<MapContextPanel agencies={[AGENCIES[0]]} mode="routes" regionBySlug={REGIONS} />);
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
  });

  it('hides the pills in agency mode', () => {
    render(<MapContextPanel agencies={AGENCIES} mode="agencies" regionBySlug={REGIONS} />);
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
  });
});
