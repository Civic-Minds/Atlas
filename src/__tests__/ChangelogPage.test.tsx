import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChangelogPage from '../ChangelogPage';

describe('ChangelogPage', () => {
  it('lists the map data date from the release manifest next to app versions', async () => {
    render(<ChangelogPage loadRelease={async () => ({ releaseId: 'release-a', generatedAt: '2026-10-12T05:00:00Z' })} />);
    expect(await screen.findByRole('heading', { name: 'Map data updated Oct 12, 2026' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /App version 3\.3/ })).toBeInTheDocument();
  });

  it('still renders app versions when the manifest cannot load', async () => {
    render(<ChangelogPage loadRelease={async () => { throw new Error('offline'); }} />);
    expect(await screen.findByRole('heading', { name: /App version 3\.3/ })).toBeInTheDocument();
    expect(screen.queryByText(/Map data updated/)).toBeNull();
  });
});
