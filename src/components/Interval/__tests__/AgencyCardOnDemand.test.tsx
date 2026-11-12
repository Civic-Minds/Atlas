import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgencyCard } from '../AgencyCard';
import type { Agency } from '../../../App';
import { HAMILTON_MY_RIDE_SERVICE_AREA } from '../../../data/onDemandServiceAreas';

const hamilton = {
  slug: 'hamilton',
  name: 'Hamilton Street Railway',
  region: 'Ontario',
  center: [43.25, -79.87],
  url: '',
  onDemandServiceArea: HAMILTON_MY_RIDE_SERVICE_AREA,
} as unknown as Agency;

function renderZoneCard(zoneId: string | null, day: 'Weekday' | 'Saturday' | 'Sunday', period: 'midday' | 'overnight', agency: Agency = hamilton, onBackToAgency?: () => void, onClose: () => void = () => {}) {
  return render(
    <AgencyCard
      agency={agency}
      layers={{}}
      day={day}
      period={period}
      maxHeadway={Infinity}
      selectedModes={new Set()}
      hideSpan={false}
      hideLimitedService={false}
      onRouteSelect={() => {}}
      onClose={onClose}
      onDemandFocus
      onDemandZoneId={zoneId}
      onBackToAgency={onBackToAgency}
    />,
  );
}

describe('on-demand zone card', () => {
  it('builds hours from structured data and bolds the selected day', () => {
    renderZoneCard('Lower North Stoney Creek', 'Saturday', 'midday');
    expect(screen.getByText('Running during Saturday midday')).toBeInTheDocument();
    // Hours rows (CIV-964): the selected day's row is bold, days and times in words beside its bar.
    expect(screen.getByText('Mon–Sat')).toHaveClass('font-bold');
    expect(screen.getByText('4:30 AM–2 AM').closest('p')).toHaveClass('font-bold');
    expect(screen.getByText('Sun')).not.toHaveClass('font-bold');
    expect(screen.getByText('5:30 AM–1 AM').closest('p')).not.toHaveClass('font-bold');
    expect(screen.getByText('Holidays follow Sunday hours.')).toBeInTheDocument();
    expect(screen.getByText("Every trip starts or ends at this zone's transfer point, shown on the map.")).toBeInTheDocument();
    expect(screen.queryByText(/not fixed-route stops/)).toBeNull();
  });

  it("shows West Glanbrook's own weekend hours, not Stoney Creek's", () => {
    renderZoneCard('West Glanbrook', 'Sunday', 'midday');
    expect(screen.getByText('4:30 AM–1 AM')).toBeInTheDocument();
    expect(screen.getByText('4:30 AM–12 AM')).toBeInTheDocument();
  });

  it('says when a zone is not running', () => {
    renderZoneCard('West Glanbrook', 'Weekday', 'overnight');
    expect(screen.getByText('Not running at this time')).toBeInTheDocument();
  });

  it('shows myRide running on its own published hours', () => {
    renderZoneCard(null, 'Saturday', 'midday');
    expect(screen.getByText('Running during Saturday midday')).toBeInTheDocument();
  });

  it('never claims service when hours are not on file', () => {
    const { availability: _omit, ...withoutHours } = HAMILTON_MY_RIDE_SERVICE_AREA;
    const noHoursService = { ...withoutHours, serviceHours: 'Hours vary; check the app.' };
    renderZoneCard(null, 'Saturday', 'midday', { ...hamilton, onDemandServiceArea: noHoursService } as unknown as Agency);
    expect(screen.getByText('Hours unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/^Running/)).toBeNull();
    expect(screen.getByText('Hours vary; check the app.')).not.toHaveClass('font-bold');
  });
});

describe('on-demand service card without a zone', () => {
  it('does not claim a shaded area that belongs to a different service', () => {
    renderZoneCard(null, 'Saturday', 'midday');
    expect(screen.queryByText(/shaded map area/)).toBeNull();
    expect(screen.getByText('Pickups and drop-offs are at 138 set stops, shown on the map.')).toBeInTheDocument();
  });
});

describe('on-demand card back link', () => {
  it('a zone card goes back to its agency card, and the agency line is dropped because the link names it', () => {
    const onBack = vi.fn();
    renderZoneCard('West Glanbrook', 'Saturday', 'midday', hamilton, onBack);
    const link = screen.getByRole('button', { name: /^← Hamilton Street Railway$/ });
    fireEvent.click(link);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/Hamilton Street Railway/)).toHaveLength(1);
  });

  it("an on-demand-only agency's whole-service card is its agency card: \"← Map\" closes it and the agency is named once", () => {
    const onClose = vi.fn();
    const onBack = vi.fn();
    renderZoneCard(null, 'Saturday', 'midday', { ...hamilton, onDemandOnly: true } as unknown as Agency, onBack, onClose);
    fireEvent.click(screen.getByRole('button', { name: /^← Map$/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    // Named by its service, once, and "On-demand service" only as the section label (CIV-929).
    expect(screen.getByText(HAMILTON_MY_RIDE_SERVICE_AREA.serviceName!)).toBeInTheDocument();
    expect(screen.queryByText(/Hamilton Street Railway/)).toBeNull();
    expect(screen.getAllByText('On-demand service')).toHaveLength(1);
  });

  it("an on-demand-only agency's zone card goes back to the service name its agency card shows", () => {
    renderZoneCard('West Glanbrook', 'Saturday', 'midday', { ...hamilton, onDemandOnly: true } as unknown as Agency, vi.fn());
    expect(screen.getByRole('button', { name: `← ${HAMILTON_MY_RIDE_SERVICE_AREA.serviceName}` })).toBeInTheDocument();
  });
});

describe('whole-service card with hours set zone by zone', () => {
  const zone = (areaName: string) => ({ type: 'Feature', properties: { areaName }, geometry: { type: 'Polygon', coordinates: [] } });
  const rtd = {
    slug: 'rtd-denver',
    name: 'RTD Denver',
    region: 'Colorado',
    center: [39.7, -105],
    url: '',
    onDemandServiceArea: {
      serviceName: 'FlexRide',
      sourceUrl: 'https://example.com',
      features: [zone('Parker'), zone('Brighton'), zone('Brighton')],
      zoneMetadata: {
        Brighton: { serviceName: 'FlexRide', serviceHours: 'Monday–Friday 5:30 AM–7 PM.', availability: { Weekday: [{ startHour: 5.5, endHour: 19 }], Saturday: [], Sunday: [] } },
        Parker: { serviceName: 'FlexRide', serviceHours: 'Monday–Friday 6 AM–6 PM.', availability: { Weekday: [{ startHour: 6, endHour: 18 }], Saturday: [], Sunday: [] } },
      },
    },
  } as unknown as Agency;

  it('lists each zone once, in name order, with its hours, and opens a zone when its row is clicked', () => {
    const onSelect = vi.fn();
    render(
      <AgencyCard agency={rtd} layers={{}} day="Weekday" period="midday" maxHeadway={Infinity} selectedModes={new Set()}
        hideSpan={false} hideLimitedService={false} onRouteSelect={() => {}} onClose={() => {}} onDemandFocus
        onDemandZoneId={null} onSelectOnDemandZone={onSelect} />,
    );
    expect(screen.queryByText('Hours unavailable')).toBeNull();
    const rows = screen.getAllByRole('button').filter(b => b.closest('[data-testid="on-demand-zone-rows"]'));
    expect(rows.map(r => r.querySelector('p')?.textContent)).toEqual(['Brighton', 'Parker']);
    expect(screen.getByText('5:30 AM–7 PM')).toBeInTheDocument();
    expect(screen.getByText('6 AM–6 PM')).toBeInTheDocument();
    fireEvent.click(rows[1]);
    expect(onSelect).toHaveBeenCalledWith('Parker');
  });

  it('keeps the zone card as it was once a zone is picked', () => {
    render(
      <AgencyCard agency={rtd} layers={{}} day="Weekday" period="midday" maxHeadway={Infinity} selectedModes={new Set()}
        hideSpan={false} hideLimitedService={false} onRouteSelect={() => {}} onClose={() => {}} onDemandFocus
        onDemandZoneId="Parker" onSelectOnDemandZone={() => {}} />,
    );
    expect(screen.queryByTestId('on-demand-zone-rows')).toBeNull();
    expect(screen.getByTestId('on-demand-running-note')).toHaveTextContent('Running during weekday midday');
  });
});

describe('Friday-only weekday service (#1440)', () => {
  const cyride = {
    slug: 'cyride', name: 'CyRide', region: 'Iowa', center: [42, -93.6], url: '',
    onDemandServiceArea: {
      serviceName: 'EASE', sourceUrl: 'https://example.com',
      features: [{ type: 'Feature', properties: { areaName: 'Ames city limits' }, geometry: { type: 'Polygon', coordinates: [] } }],
      zoneMetadata: { 'Ames city limits': { serviceName: 'Moonlight Express', availability: { Friday: [{ startHour: 22.5, endHour: 26 }], Saturday: [{ startHour: 22.5, endHour: 26 }], Sunday: [] } } },
    },
  } as unknown as Agency;
  const card = (day: 'Weekday' | 'Saturday') => render(
    <AgencyCard agency={cyride} layers={{}} day={day} period="late" maxHeadway={Infinity} selectedModes={new Set()}
      hideSpan={false} hideLimitedService={false} onRouteSelect={() => {}} onClose={() => {}} onDemandFocus onDemandZoneId="Ames city limits" />,
  );

  it('shows a Fri–Sat row and no "Hours unavailable" note on a weekday', () => {
    card('Weekday');
    expect(screen.getByText('Fri–Sat')).toBeInTheDocument();
    expect(screen.queryByText('Hours unavailable')).toBeNull();
    expect(screen.queryByText(/Running/)).toBeNull();
  });

  it('keeps the running note on Saturday', () => {
    card('Saturday');
    expect(screen.getByTestId('on-demand-running-note')).toHaveTextContent('Running during Saturday late');
  });
});
