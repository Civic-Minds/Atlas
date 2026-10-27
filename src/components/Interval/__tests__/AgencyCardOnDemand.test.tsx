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
    renderZoneCard('West Glanbrook', 'Saturday', 'midday');
    expect(screen.getByText('Running during Saturday midday')).toBeInTheDocument();
    // Hours rows (CIV-964): the selected day's row is bold, days and times in words beside its bar.
    expect(screen.getByText('Mon–Sat')).toHaveClass('font-bold');
    expect(screen.getByText('4:30 a.m.–2:00 a.m.').closest('p')).toHaveClass('font-bold');
    expect(screen.getByText('Sun')).not.toHaveClass('font-bold');
    expect(screen.getByText('5:30 a.m.–1:00 a.m.').closest('p')).not.toHaveClass('font-bold');
    expect(screen.getByText('Holidays follow Sunday hours.')).toBeInTheDocument();
    expect(screen.getByText("Every trip starts or ends at this zone's transfer point, shown on the map.")).toBeInTheDocument();
    expect(screen.queryByText(/not fixed-route stops/)).toBeNull();
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
