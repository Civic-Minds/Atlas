import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapAttribution } from '../MapAttribution';

describe('MapAttribution', () => {
  it('uses the shared map-pill label treatment for feedback and attribution', () => {
    render(<MapAttribution />);

    const feedback = screen.getByRole('link', { name: 'Feedback' });
    const about = screen.getByRole('link', { name: 'About Atlas' });
    expect(about).toHaveAttribute('href', '/about');
    const osm = screen.getByRole('link', { name: 'OpenStreetMap' });
    const carto = screen.getByRole('link', { name: 'CARTO' });
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      'About Atlas',
      'Feedback',
      'OpenStreetMap',
      'CARTO',
    ]);

    for (const element of [feedback, about, osm, carto]) {
      expect(element.className).toContain('text-xs');
      expect(element.className).toContain('font-semibold');
      expect(element.className).toContain('leading-none');
    }

    expect(feedback.getAttribute('href')).toContain(encodeURIComponent('Feedback:\n\n\nPage:'));
  });

  it('folds About, What’s new and Feedback into one About card on phones', () => {
    render(<MapAttribution />);
    const about = screen.getByRole('button', { name: 'About' });
    expect(screen.getAllByRole('link', { name: 'About Atlas' })).toHaveLength(1);
    fireEvent.click(about);
    expect(screen.getAllByRole('link', { name: 'About Atlas' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Feedback' })).toHaveLength(2);
    expect(screen.getByText("What’s New")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('link', { name: 'Feedback' })).toHaveLength(1);
    fireEvent.click(about);
    fireEvent.pointerDown(document.body);
    expect(screen.getAllByRole('link', { name: 'Feedback' })).toHaveLength(1);
  });

  it('adds the Census credit while the shading is on, shrinkable on phones; unchanged when off', () => {
    const { container, rerender } = render(<MapAttribution contextLayerOn />);
    const credit = screen.getByRole('link', { name: 'U.S. Census Bureau' });
    expect(credit.closest('p')!.className).toContain('truncate');
    // No survey years from the tiles yet: no hover text rather than one without its years.
    expect(credit).not.toHaveAttribute('title');
    rerender(<MapAttribution contextLayerOn contextYear={2023} />);
    expect(screen.getByRole('link', { name: 'U.S. Census Bureau' })).toHaveAttribute('title', 'Source: U.S. Census Bureau, American Community Survey 5-year estimates (2019–2023) and TIGER/Line boundaries');
    expect(container.querySelector('[data-map-attribution]')!.className).toContain('max-sm:max-w-[calc(100vw-5.75rem)]');
    rerender(<MapAttribution />);
    expect(screen.queryByRole('link', { name: 'U.S. Census Bureau' })).toBeNull();
    expect(container.querySelector('p.truncate')).toBeNull();
    expect(container.innerHTML).not.toContain('5.75rem');
  });

  it('credits MassDOT only while MBTA vehicles are on the map (CIV-2046)', () => {
    const { rerender } = render(<MapAttribution />);
    expect(screen.queryByRole('link', { name: 'MassDOT' })).toBeNull();
    rerender(<MapAttribution massDotOn />);
    expect(screen.getByRole('link', { name: 'MassDOT' })).toHaveAttribute('href', 'https://www.mass.gov/massdot-developers-data-sources');
    rerender(<MapAttribution massDotOn contextLayerOn contextYear={2023} />);
    expect(screen.getByRole('link', { name: 'U.S. Census Bureau' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MassDOT' })).toBeInTheDocument();
  });

  it('credits each agency in view whose licence requires it; a name opens Schedule sources there (CIV-461)', () => {
    const ttc = { slug: 'ttc', name: 'Toronto Transit Commission', shortName: 'TTC', url: 'https://open.toronto.ca/open-data-licence/', text: 'Contains information licensed under the Open Government Licence – Toronto.' };
    const opened: (string | null)[] = [];
    const { rerender } = render(<MapAttribution />);
    expect(screen.queryByRole('button', { name: 'TTC' })).toBeNull();
    rerender(<MapAttribution agencyCredits={[ttc]} massDotOn onCreditOpen={s => opened.push(s)} />);
    const name = screen.getByRole('button', { name: 'TTC' });
    expect(name).toHaveAttribute('title', ttc.text);
    fireEvent.click(name);
    expect(opened).toEqual(['ttc']);
    expect(screen.getAllByRole('link').map(l => l.textContent).at(-1)).toBe('MassDOT');
    expect(screen.queryByRole('button', { name: /other agenc/ })).toBeNull();
  });

  it('keeps the pill to one compact line: one entry per short name, then "and N other agencies" (CIV-461)', () => {
    const c = (slug: string, shortName: string) => ({ slug, name: `${shortName} full legal name`, shortName, url: `https://example.org/${slug}`, text: `${shortName} credit.` });
    const opened: (string | null)[] = [];
    render(<MapAttribution agencyCredits={[c('muni', 'Muni'), c('kel', 'BC Transit'), c('kam', 'BC Transit'), c('act', 'AC Transit'), c('weta', 'WETA')]} onCreditOpen={s => opened.push(s)} />);
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(expect.arrayContaining(['Muni', 'BC Transit', 'and 2 other agencies']));
    expect(screen.queryByText(/full legal name/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'and 2 other agencies' }));
    expect(opened).toEqual([null]);
  });
});
