import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// On-demand is on (beta): the map key ends with the partial-coverage line (CIV-23).
vi.mock('../../../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, onDemand: true } };
});
vi.mock('../../../context/ColorVisionContext', () => ({ useColorVision: () => ({ colorVisionFriendly: false, setColorVisionFriendly: () => {} }) }));

import { PersistentMapLegend } from '../PersistentMapLegend';
import { ON_DEMAND_PARTIAL_COVERAGE } from '../../../content/noticeCopy';

describe('on-demand partial coverage', () => {
  it("keeps Ryan's approved wording", () => {
    expect(ON_DEMAND_PARTIAL_COVERAGE).toBe('Some on-demand zones aren’t on the map yet.');
  });

  it('is the map key’s last line when on-demand is on', () => {
    render(<PersistentMapLegend />);
    expect(screen.getByText(ON_DEMAND_PARTIAL_COVERAGE)).toBeInTheDocument();
  });
});
