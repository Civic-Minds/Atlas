import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FEATURES, WHATS_NEW_ENABLED, whatsNewEnabledFor } from '../../../shared/config';
import { WhatsNewPanel } from '../WhatsNewPanel';
import { MapAttribution } from '../Interval/MapAttribution';
import { WHATS_NEW, visibleWhatsNew, type WhatsNewRelease } from '../../data/whatsNew';
import { version } from '../../../package.json';

const RELEASES: WhatsNewRelease[] = [
  {
    version: '3.3.0',
    month: 'October 2026',
    date: '2026-10-12',
    items: [
      { text: 'Public change one.' },
      { text: 'Beta change.', beta: true },
      { text: 'Public change two.' },
    ],
  },
  { version: '3.2.0', month: 'September 2026', date: '2026-09-22', items: [{ text: 'Only beta here.', beta: true }] },
];

describe('What’s new link', () => {
  it('is hidden when the flag is off', () => {
    render(<MapAttribution whatsNewEnabled={false} />);
    expect(screen.queryByRole('button', { name: /What's new/ })).toBeNull();
  });

  it('shows the app version and opens the panel when the flag is on', async () => {
    render(<MapAttribution whatsNewEnabled />);
    const [major, minor] = version.split('.');
    const button = screen.getByRole('button', { name: `v${major}.${minor} · What’s new` });
    expect(button.className).toContain('text-xs');
    const pills = [...button.parentElement!.children].map(el => el.textContent);
    expect(pills.indexOf(button.textContent)).toBeLessThan(pills.indexOf('Feedback'));
    fireEvent.click(button);
    expect(await screen.findByRole('dialog', { name: "What’s new" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('What’s new flag', () => {
  it('is on in every build, public included', () => {
    expect(whatsNewEnabledFor('public')).toBe(true);
    expect(whatsNewEnabledFor('preview')).toBe(true);
    expect(whatsNewEnabledFor('beta')).toBe(true);
    expect(whatsNewEnabledFor('dev')).toBe(true);
    expect(FEATURES.whatsNew).toBe(WHATS_NEW_ENABLED);
  });
});

describe('WhatsNewPanel', () => {
  it('shows only the latest version and links to the full changelog', () => {
    render(<WhatsNewPanel onClose={() => {}} includeBeta releases={RELEASES} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Version 3.3 · Released Oct 12, 2026']);
    expect(screen.getByRole('link', { name: 'See all changes' })).toHaveAttribute('href', '/changelog');
  });

  it('shows beta items only in beta', () => {
    const { unmount } = render(
      <WhatsNewPanel onClose={() => {}} includeBeta releases={RELEASES} />,
    );
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Public change one.', 'Beta change. Beta', 'Public change two.']);
    unmount();

    render(<WhatsNewPanel onClose={() => {}} includeBeta={false} releases={RELEASES} />);
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Public change one.', 'Public change two.']);
  });

  it('shows the app release date, never the map data date', () => {
    render(<WhatsNewPanel onClose={() => {}} includeBeta releases={RELEASES} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Version 3.3 · Released Oct 12, 2026');
    expect(screen.queryByText(/data updated/i)).toBeNull();
  });

  it('falls back to the month when the release date is unusable', () => {
    render(<WhatsNewPanel onClose={() => {}} includeBeta releases={[{ ...RELEASES[0], date: 'soon' }]} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Version 3.3 · October 2026');
  });
});

describe('whatsNew content', () => {
  it('keeps every release non-empty, keyed by version and free of jargon', () => {
    expect(visibleWhatsNew(true).length).toBe(WHATS_NEW.length);
    for (const release of WHATS_NEW) {
      expect(release.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const item of release.items) {
        expect(item.text).not.toMatch(/GTFS|PMTiles|R2|#\d+|\bPR\b/);
      }
    }
  });
});
