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
      hideSpan={false} hideLimitedService={false} onRouteSelect={() => {}} />,
  );
}

describe('Data source link', () => {
  beforeEach(() => { flags.on = true; });

  it('agency card: shows in beta, pointing at the agency website in a new tab', () => {
    card(withSite);
    const link = screen.getByRole('link', { name: /Data source/ });
    expect(link).toHaveAttribute('href', 'https://example.org/transit');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('agency card: absent in public mode', () => {
    flags.on = false;
    card(withSite);
    expect(screen.queryByText('Data source')).toBeNull();
  });

  it('agency card: absent when the agency has no website', () => {
    card(withoutSite);
    expect(screen.queryByText('Data source')).toBeNull();
  });

  describe('on-demand card', () => {
    const onDemand = (a: Agency) => ({ ...a, onDemandServiceArea: HAMILTON_MY_RIDE_SERVICE_AREA }) as unknown as Agency;
    const demandCard = (agency: Agency) => render(
      <AgencyCard agency={onDemand(agency)} layers={{}} day="Weekday" period="midday" maxHeadway={Infinity} selectedModes={new Set()}
        hideSpan={false} hideLimitedService={false} onRouteSelect={() => {}} onDemandFocus onDemandZoneId={null} />,
    );

    it('shows in beta, pointing at the agency website in a new tab', () => {
      demandCard(withSite);
      const link = screen.getByRole('link', { name: /Data source/ });
      expect(link).toHaveAttribute('href', 'https://example.org/transit');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('is absent in public mode', () => {
      flags.on = false;
      demandCard(withSite);
      expect(screen.queryByText('Data source')).toBeNull();
    });

    it('is absent when the agency has no website', () => {
      demandCard(withoutSite);
      expect(screen.queryByText('Data source')).toBeNull();
    });
  });
});
