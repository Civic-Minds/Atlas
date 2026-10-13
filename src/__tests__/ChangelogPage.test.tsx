import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChangelogPage from '../ChangelogPage';

describe('ChangelogPage', () => {
  it('lists the map data date from the release manifest next to app versions', async () => {
    render(<ChangelogPage loadReleases={async () => [{ releaseId: 'release-a', generatedAt: '2026-10-12T05:00:00Z' }, { releaseId: 'release-0', generatedAt: '2026-10-05T05:00:00Z' }]} />);
    expect(await screen.findByRole('heading', { name: /Version 3\.3 · map data updated Oct 12, 2026/ })).toBeInTheDocument();
    expect(screen.getByText('Map data updated Oct 5, 2026')).toBeInTheDocument();
  });

  it('still renders app versions when the manifest cannot load', async () => {
    render(<ChangelogPage loadReleases={async () => []} />);
    expect(await screen.findByRole('heading', { name: /Version 3\.3/ })).toBeInTheDocument();
    expect(screen.queryByText(/Map data updated/)).toBeNull();
  });
});
