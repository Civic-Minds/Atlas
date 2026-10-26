import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The map starts in Toronto; the linked service is far away in Grande Prairie.
vi.mock('../../context/ViewportContext', () => ({
  useViewport: () => ({ bounds: { s: 43.6, n: 43.7, w: -79.5, e: -79.3 } }),
}));

import { OnDemandViewportLoader, type OnDemandData } from '../useOnDemandData';

function data(requestGeometry: OnDemandData['requestGeometry']): OnDemandData {
  return {
    status: 'ready',
    index: { schemaVersion: 1, version: 'v1', generatedAt: '', services: [{ slug: 'gp', bbox: [-118.9, 55.1, -118.7, 55.2] }] } as unknown as OnDemandData['index'],
    geometries: new Map(),
    visible: true,
    setVisible: () => {},
    requestGeometry,
  };
}

describe('OnDemandViewportLoader (CIV-929)', () => {
  it("loads a linked service's zones even when the map starts somewhere else", () => {
    const requestGeometry = vi.fn();
    render(<OnDemandViewportLoader data={data(requestGeometry)} linkedSlug="gp" />);
    expect(requestGeometry).toHaveBeenCalledWith(['gp']);
  });

  it('loads only services in view without a link', () => {
    const requestGeometry = vi.fn();
    render(<OnDemandViewportLoader data={data(requestGeometry)} />);
    expect(requestGeometry.mock.calls.flat(2)).not.toContain('gp');
  });
});
