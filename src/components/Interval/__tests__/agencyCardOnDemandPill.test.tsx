import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgencyCard } from '../AgencyCard';
import type { Agency } from '../../../App';
import { FEATURES } from '../../../../shared/config';
import { HAMILTON_MY_RIDE_SERVICE_AREA } from '../../../data/onDemandServiceAreas';

const card = (agency: Agency) => render(
  <AgencyCard
    agency={agency}
    layers={{}}
    day="Weekday"
    period="midday"
    maxHeadway={Infinity}
    selectedModes={new Set()}
    hideSpan={false}
    hideLimitedService={false}
    onRouteSelect={() => {}} onClose={() => {}}
  />,
);

describe.runIf(FEATURES.onDemand)('agency card On-Demand pill (zone not on the map)', () => {
  const marta = { slug: 'marta', name: 'MARTA', region: 'Georgia', center: [33.75, -84.39], url: '' } as unknown as Agency;

  it('replaces the notice block with a pill; with no routes it starts selected and shows the note', () => {
    card(marta);
    expect(screen.queryByText('MARTA Reach')).toBeNull();
    expect(screen.queryByText('On-demand service')).toBeNull();
    const pill = screen.getByRole('button', { name: 'On-Demand' });
    expect(screen.getByText("This service runs by request in a zone that isn't on the map yet.")).toBeInTheDocument();
    fireEvent.click(pill);
    expect(screen.queryByText("This service runs by request in a zone that isn't on the map yet.")).toBeNull();
    expect(screen.getByText('No routes loaded yet.')).toBeInTheDocument();
    fireEvent.click(pill);
    expect(screen.getByText("This service runs by request in a zone that isn't on the map yet.")).toBeInTheDocument();
  });

  it('gives no pill to an agency whose zone is on the map', () => {
    card({ slug: 'hamilton', name: 'Hamilton Street Railway', region: 'Ontario', center: [43.25, -79.87], url: '', onDemandServiceArea: HAMILTON_MY_RIDE_SERVICE_AREA } as unknown as Agency);
    expect(screen.queryByRole('button', { name: 'On-Demand' })).toBeNull();
    expect(screen.getByText('On-demand service')).toBeInTheDocument();
  });
});
