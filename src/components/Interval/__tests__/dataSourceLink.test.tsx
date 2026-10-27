import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agency } from '../../../App';
import { HAMILTON_MY_RIDE_SERVICE_AREA } from '../../../data/onDemandServiceAreas';

const flags = vi.hoisted(() => ({ on: true }));
vi.mock('../../../../shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../shared/config')>();
  return { ...actual, FEATURES: new Proxy(actual.FEATURES, { get: (t, k) => (k === 'dataSourceLink' ? flags.on : (t as Record<string | symbol, unknown>)[k]) }) };
});

const { AgencyCard } = await import('../AgencyCard');

const base = { slug: 'zz-test', name: 'Test Transit', region: 'Ontario', center: [43, -79], url: '' };
const withSite = { ...base, websiteUrl: 'https://example.org/transit' } as unknown as Agency;
const withoutSite = { ...base } as unknown as Agency;

function card(agency: Agency) {
  return render(
    <AgencyCard agency={agency} layers={{}} day="Weekday" period="midday" maxHeadway={Infinity} selectedModes={new Set()}
      hideSpan={false} hideLimitedService={false} onRouteSelect={() => {}} onClose={() => {}} />,
  );
}

describe('Source link', () => {
  beforeEach(() => { flags.on = true; });

  it('agency card: shows in beta, pointing at the agency website in a new tab', () => {
    card(withSite);
    const link = screen.getByRole('link', { name: 'Source (opens in a new tab)' });
    expect(link).toHaveTextContent(/^Source$/);
    expect(link).toHaveAttribute('href', 'https://example.org/transit');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('agency card: absent in public mode', () => {
    flags.on = false;
    card(withSite);
    expect(screen.queryByText('Source')).toBeNull();
  });

  it('agency card: absent when the agency has no website', () => {
    card(withoutSite);
    expect(screen.queryByText('Source')).toBeNull();
  });

  describe('on-demand card', () => {
    const onDemand = (a: Agency) => ({ ...a, onDemandServiceArea: HAMILTON_MY_RIDE_SERVICE_AREA }) as unknown as Agency;
    const demandCard = (agency: Agency) => render(
      <AgencyCard agency={onDemand(agency)} layers={{}} day="Weekday" period="midday" maxHeadway={Infinity} selectedModes={new Set()}
        hideSpan={false} hideLimitedService={false} onRouteSelect={() => {}} onClose={() => {}} onDemandFocus onDemandZoneId={null} />,
    );

    it('shows in beta, pointing at the agency website in a new tab', () => {
      demandCard(withSite);
      const link = screen.getByRole('link', { name: /^Source/ });
      expect(link).toHaveAttribute('href', 'https://example.org/transit');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('is absent in public mode', () => {
      flags.on = false;
      demandCard(withSite);
      expect(screen.queryByText('Source')).toBeNull();
    });

    it('is absent when the agency has no website', () => {
      demandCard(withoutSite);
      expect(screen.queryByText('Source')).toBeNull();
    });
  });

  describe('header links (CIV-841)', () => {
    const ttc = { ...base, slug: 'ttc', name: 'Toronto Transit Commission', websiteUrl: 'https://www.ttc.ca' } as unknown as Agency;

    it('the area link, About and Source on one line under the name, above the facts, each opening in a new tab (CIV-929)', () => {
      card(ttc);
      const area = screen.getByRole('link', { name: 'Greater Toronto and Hamilton' });
      const facts = screen.getByText(/^\d+ routes?/);
      const about = screen.getByRole('link', { name: 'About' });
      const source = screen.getByRole('link', { name: /^Source/ });
      expect(about).toHaveAttribute('href', '/agency/ttc');
      expect(area).toHaveAttribute('href', '/area/toronto');
      // Too long for the line, the name drops its trailing "Area" (CIV-523); the full name is on hover.
      expect(area).toHaveAttribute('title', 'Greater Toronto and Hamilton Area');
      for (const link of [about, source, area]) expect(link).toHaveAttribute('target', '_blank');
      const line = area.closest('p')!;
      expect(about.closest('p')).toBe(line);
      expect(source.closest('p')).toBe(line);
      expect(line.className).toContain('whitespace-nowrap');
      expect(area.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(about.compareDocumentPosition(source) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(line.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.queryByText(/agencies$/)).toBeNull();
    });

    it('public mode: About and the region link, no Source', () => {
      flags.on = false;
      card(ttc);
      expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Greater Toronto and Hamilton' })).toBeInTheDocument();
      expect(screen.queryByText('Source')).toBeNull();
    });
  });
});
