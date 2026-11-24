import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MapExportDialog from '../MapExportDialog';
import { CONTROL_ACTIVE, CONTROL_INACTIVE } from '../../styles';
import { MAP_EXPORT_SIZES } from '../../utils/mapExport';

// #1754: two sizes looked picked at once; only the chosen one takes the selected style.
describe('Export map image sizes (#1754)', () => {
  const dialog = () => render(
    <MapExportDialog open sourceSize={null} prepareSource={() => new Promise(() => {})} describe={vi.fn()} lightMode onClose={() => {}} />,
  );
  const sizeButtons = () => MAP_EXPORT_SIZES.map(s => screen.getByRole('button', { name: new RegExp(s.label) }));
  const picked = () => sizeButtons().filter(b => b.className.includes(CONTROL_ACTIVE));

  it('gives exactly one size the shared selected style, and the others the shared unselected style', () => {
    dialog();
    expect(picked()).toHaveLength(1);
    expect(sizeButtons().filter(b => b.getAttribute('aria-pressed') === 'true')).toEqual(picked());
    for (const b of sizeButtons()) if (!picked().includes(b)) expect(b.className).toContain(CONTROL_INACTIVE);
  });

  it('moves the selected style to the size clicked', () => {
    dialog();
    const high = sizeButtons()[MAP_EXPORT_SIZES.length - 1];
    fireEvent.click(high);
    expect(picked()).toEqual([high]);
  });
});
