import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WhatsNewPanel } from '../WhatsNewPanel';
import { MapAttribution } from '../Interval/MapAttribution';
import { RELEASES as APP_RELEASES, visibleWhatsNew, type WhatsNewFeature } from '../../data/whatsNew';
import { version } from '../../../package.json';

const RELEASES = [{ version: '3.3.0', date: '2026-10-12' }, { version: '3.2.0', date: '2026-09-22' }];
const FEATURES_LIST: WhatsNewFeature[] = [
  { public: { version: '3.3.0', text: 'Public change one.' } },
  { beta: { version: '3.3.0', text: 'Beta change.' } },
  { public: { version: '3.3.0', text: 'Public change two.' } },
  { beta: { version: '3.2.0', text: 'Only beta here.' } },
];

describe('What’s new link', () => {
  it('shows the app version and opens the panel', async () => {
    render(<MapAttribution />);
    const [major, minor] = version.split('.');
    const button = screen.getByRole('button', { name: `v${major}.${minor} · What’s New` });
    expect(button.className).toContain('text-xs');
    const pills = [...button.parentElement!.children].map(el => el.textContent);
    expect(pills.indexOf(button.textContent)).toBeLessThan(pills.indexOf('Feedback'));
    fireEvent.click(button);
    expect(await screen.findByRole('dialog', { name: "What’s New" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('WhatsNewPanel', () => {
  it('shows only the latest version and links to the full changelog', () => {
    render(<WhatsNewPanel onClose={() => {}} includeBeta features={FEATURES_LIST} releases={RELEASES} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['Version 3.3 · Released Oct 12, 2026']);
    expect(screen.getByRole('link', { name: 'See all changes' })).toHaveAttribute('href', '/changelog');
  });

  it('shows beta items only in beta', () => {
    const { unmount } = render(
      <WhatsNewPanel onClose={() => {}} includeBeta features={FEATURES_LIST} releases={RELEASES} />,
    );
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Public change one.', 'Beta change. Beta', 'Public change two.']);
    unmount();

    render(<WhatsNewPanel onClose={() => {}} includeBeta={false} features={FEATURES_LIST} releases={RELEASES} />);
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Public change one.', 'Public change two.']);
  });

  it('shows the app release date, never the map data date', () => {
    render(<WhatsNewPanel onClose={() => {}} includeBeta features={FEATURES_LIST} releases={RELEASES} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Version 3.3 · Released Oct 12, 2026');
    expect(screen.queryByText(/data updated/i)).toBeNull();
  });

  it('shows only the version when the release date is unusable', () => {
    render(<WhatsNewPanel onClose={() => {}} includeBeta features={FEATURES_LIST} releases={[{ ...RELEASES[0], date: 'soon' }]} />);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Version 3.3');
  });
});

describe('Try it links (CIV-1999)', () => {
  const LINKED: WhatsNewFeature[] = [
    { lead: 'Compare mode', public: { version: '3.4.0', text: 'put two maps side by side' }, link: { label: 'Try it', to: '/apps/compare', desktopOnly: true } },
    { lead: 'Plain', public: { version: '3.4.0', text: 'no link here' } },
  ];

  it('runs an arrow link on after an item that opens a feature, and closes the panel when followed', () => {
    let closed = 0;
    render(<WhatsNewPanel onClose={() => { closed++; }} includeBeta={false} features={LINKED} />);
    const link = screen.getByRole('link', { name: 'Try it' });
    expect(link).toHaveAttribute('href', '/apps/compare');
    expect(screen.getAllByRole('listitem')[1].querySelector('a')).toBeNull();
    fireEvent.click(link);
    expect(closed).toBe(1);
  });

  it('shows Try it on Compare mode and Explore on Agency and area pages in the real 3.4.0 list', () => {
    render(<WhatsNewPanel onClose={() => {}} includeBeta={false} releases={APP_RELEASES.filter(r => r.version === '3.4.0')} />);
    expect(screen.getByRole('link', { name: 'Try it' })).toHaveAttribute('href', '/apps/compare');
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/agencies');
  });
});

describe('whatsNew content', () => {
  it('keeps every release non-empty, keyed by version and free of jargon', () => {
    expect(visibleWhatsNew(true).length).toBe(APP_RELEASES.length);
    for (const release of APP_RELEASES) {
      expect(release.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const item of [true, false].flatMap(b => visibleWhatsNew(b).flatMap(r => r.items))) {
      expect(item.text).not.toMatch(/GTFS|PMTiles|R2|#\d+|\bPR\b/);
    }
  });
});
