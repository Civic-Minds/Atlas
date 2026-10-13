import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.fn();
const trackPageView = vi.fn();
const trackLandingPageView = vi.fn();
vi.mock('../../lib/analytics', async () => {
  const actual = await vi.importActual<typeof import('../../lib/analytics')>('../../lib/analytics');
  return { ...actual, trackEvent: (...a: unknown[]) => trackEvent(...a), trackPageView: (...a: unknown[]) => trackPageView(...a), trackLandingPageView: (...a: unknown[]) => trackLandingPageView(...a) };
});

import { OutboundLink } from '../OutboundLink';
import RouteTracker from '../RouteTracker';
import { MapAttribution } from '../Interval/MapAttribution';

beforeEach(() => { trackEvent.mockClear(); trackPageView.mockClear(); trackLandingPageView.mockClear(); });

describe('OutboundLink', () => {
  it('opens in a new tab and reports kind and agency on click', () => {
    render(<OutboundLink href="https://example.com/fares" kind="fares" agencySlug="ttc">Fares</OutboundLink>);
    const link = screen.getByText('Fares');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    fireEvent.click(link);
    expect(trackEvent).toHaveBeenCalledWith('outbound_click', { kind: 'fares', agency_slug: 'ttc' });
  });

  it('leaves agency_slug out when none is known', () => {
    render(<OutboundLink href="https://example.com" kind="attribution">Credit</OutboundLink>);
    fireEvent.click(screen.getByText('Credit'));
    expect(trackEvent).toHaveBeenCalledWith('outbound_click', { kind: 'attribution', agency_slug: undefined });
  });
});

describe('MapAttribution events', () => {
  it('reports feedback_opened and attribution outbound clicks', () => {
    render(<MapAttribution whatsNewEnabled={false} />);
    fireEvent.click(screen.getByText('Feedback'));
    expect(trackEvent).toHaveBeenCalledWith('feedback_opened', { source: 'map_attribution' });
    fireEvent.click(screen.getByText('CARTO'));
    expect(trackEvent).toHaveBeenCalledWith('outbound_click', { kind: 'attribution', agency_slug: undefined });
  });
});

describe('RouteTracker', () => {
  function Nav() {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/about')}>go</button>;
  }

  it('sends one page view per route, including non-App pages', () => {
    render(<MemoryRouter initialEntries={['/']}><RouteTracker /><Nav /></MemoryRouter>);
    expect(trackLandingPageView.mock.calls).toEqual([['/']]);
    expect(trackPageView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('go'));
    expect(trackLandingPageView).toHaveBeenCalledTimes(1);
    expect(trackPageView.mock.calls).toEqual([['/about']]);
  });
});
