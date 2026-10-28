import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgencyCardTop } from '../cardUi';

const noop = { to: 'Map', onClick: () => {} };

describe('AgencyCardTop', () => {
  it('shows the agency name with its place on the same line', () => {
    render(<AgencyCardTop as="h2" name="MARTA" place="Atlanta" back={noop} />);
    expect(screen.getByRole('heading').textContent).toBe('MARTA Atlanta');
  });

  it('leaves the place out when the name already says it', () => {
    render(<AgencyCardTop as="h2" name="Grande Prairie Transit On-Demand" place="Grande Prairie" back={noop} />);
    expect(screen.getByRole('heading').textContent).toBe('Grande Prairie Transit On-Demand');
  });

  it('leaves the place out when there is none', () => {
    render(<AgencyCardTop name="TTC" back={noop} />);
    expect(screen.getByText('TTC').textContent).toBe('TTC');
  });

  it('shows the back link as the arrow plus its destination and calls it on click', () => {
    const onBack = vi.fn();
    render(<AgencyCardTop name="MARTA" place="Atlanta" back={{ to: 'All agencies', onClick: onBack }} />);
    fireEvent.click(screen.getByRole('button', { name: '← All agencies' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows one facts line and the report control beside the top', () => {
    render(<AgencyCardTop name="TTC" back={noop} facts="230 routes · 172 match filters" report={<button type="button">Report</button>} />);
    expect(screen.getByText('230 routes · 172 match filters')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Report' })).toBeTruthy();
  });
});

describe('AgencyCardTop links line', () => {
  it('puts the links on one line under the name, a dot between them, above the facts', () => {
    const { container } = render(
      <AgencyCardTop
        name="CapMetro"
        back={noop}
        facts="12 routes · 2 match filters"
        links={[<a key="area" href="/areas/austin">Austin area</a>, <a key="about" href="/agencies/capmetro">About</a>]}
      />,
    );
    const line = screen.getByRole('link', { name: 'Austin area' }).closest('p')!;
    expect(line.textContent).toBe('Austin area·About');
    expect(line.className).toContain('whitespace-nowrap');
    expect(line.compareDocumentPosition(screen.getByText('12 routes · 2 match filters')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('p').length).toBe(3);
  });

  it('shows About alone with no dot when there is no area page', () => {
    render(<AgencyCardTop name="RFTA" back={noop} links={[<a key="about" href="/agencies/rfta">About</a>]} />);
    expect(screen.getByRole('link', { name: 'About' }).closest('p')!.textContent).toBe('About');
  });

  it('draws no links line when there are no links', () => {
    const { container } = render(<AgencyCardTop name="TTC" back={noop} />);
    expect(container.textContent).not.toContain('·');
  });
});
