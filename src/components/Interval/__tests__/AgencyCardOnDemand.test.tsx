import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

function renderZoneCard(zoneId: string | null, day: 'Weekday' | 'Saturday' | 'Sunday', period: 'midday' | 'overnight', agency: Agency = hamilton) {
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
      onDemandFocus
      onDemandZoneId={zoneId}
    />,
  );
}

describe('on-demand zone card', () => {
  it('builds hours from structured data and bolds the selected day', () => {
    renderZoneCard('West Glanbrook', 'Saturday', 'midday');
    expect(screen.getByText('Running during Saturday midday')).toBeInTheDocument();
    expect(screen.getByText('Mon–Sat 4:30 a.m.–2:00 a.m.')).toHaveClass('font-bold');
    expect(screen.getByText('Sun 5:30 a.m.–1:00 a.m.')).not.toHaveClass('font-bold');
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
    expect(screen.getByText('Hours not confirmed for this time')).toBeInTheDocument();
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
