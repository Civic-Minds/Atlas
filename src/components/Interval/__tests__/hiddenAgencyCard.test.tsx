import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Agency } from '../../../App';
import { AgencyCard } from '../AgencyCard';
import { AGENCY_ROUTES_FAILED } from '../../../content/noticeCopy';
import { HIDDEN_AGENCY_NOTE } from '../../../../shared/hiddenAgencyNote';

// CIV-1060: a hidden agency's card shows its one note and no "couldn't load" error, with or without an info panel.
const hidden = { slug: 'zz-hidden', name: 'Hidden Transit', region: 'Ontario', center: [43, -79], url: '', hiddenReason: 'no-route-lines' } as unknown as Agency;

function card(onInfoOpen?: () => void) {
  return render(
    <AgencyCard agency={hidden} layers={{}} day="Weekday" period="midday" maxHeadway={Infinity} selectedModes={new Set()}
      hideSpan={false} hideLimitedService={false} onRouteSelect={() => {}} onClose={() => {}} loadFailed onInfoOpen={onInfoOpen} />,
  );
}

describe('hidden agency card (CIV-1060)', () => {
  it.each([['with an info panel', () => {}], ['without an info panel', undefined]])('shows only the note %s', (_label, onInfoOpen) => {
    card(onInfoOpen);
    expect(screen.getAllByText(HIDDEN_AGENCY_NOTE)).toHaveLength(1);
    expect(screen.queryByText(AGENCY_ROUTES_FAILED)).toBeNull();
  });
});
