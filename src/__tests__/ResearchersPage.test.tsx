import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURES } from '../../shared/config';
import ResearchersPage from '../ResearchersPage';
import coverage from '../../shared/data/atlas-coverage.json';

describe('For Researchers page (CIV-1709)', () => {
  it('has its title and the draft card and section headings', () => {
    render(<ResearchersPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'For Researchers' })).toBeInTheDocument();
    for (const name of [
      'See How Service Changed Over the Years',
      'Compare Cities on One Map',
      'Maps You Can Cite',
      'Research Stories and Methods',
      'Where the Data Comes From',
      'Request a Demo',
    ]) expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  });

  it('gives every feature card exactly two sentences', () => {
    const { container } = render(<ResearchersPage />);
    const cards = [...container.querySelectorAll('section')].filter(s => s.querySelector('h2') && s.style.background);
    const features = cards.filter(c => c.querySelector('h2')!.textContent !== 'Request a Demo');
    expect(features).toHaveLength(4);
    for (const card of features) {
      const text = card.querySelector('p')!.textContent!;
      expect([card.querySelector('h2')!.textContent, text.split(/(?<=\.)\s+/).length]).toEqual([card.querySelector('h2')!.textContent, 2]);
    }
  });

  it('says exactly how many agencies Atlas covers, from the published data, and links to the Docs on it', () => {
    render(<ResearchersPage />);
    expect(screen.getByText(new RegExp(`^Atlas covers ${coverage.public.agencies} transit agencies in Canada and the US\\.`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read how Atlas works' })).toHaveAttribute('href', '/about/docs#data-flow');
  });

  it('alternates the picture side of the cards with pictures, and reuses the planners pictures', () => {
    const { container } = render(<ResearchersPage />);
    const sides = [...container.querySelectorAll('[data-picture-side]')].map(c => c.getAttribute('data-picture-side'));
    // Compare Cities (flipped), Maps You Can Cite, then the Request a demo card; History and Stories have no picture yet.
    expect(sides).toEqual(['left', 'right', 'right']);
    const srcs = [...container.querySelectorAll('img')].map(img => img.getAttribute('src'));
    for (const theme of ['light', 'dark']) {
      expect(srcs).toContain(`/assets/planners/hero-${theme}.webp`);
      for (const card of ['agency', 'export', 'demo']) expect(srcs).toContain(`/assets/planners/card-${card}-desktop-${theme}.webp`);
    }
  });

  it('opens the map from the top and ends with the shared Request a demo card', () => {
    render(<ResearchersPage />);
    expect(screen.getAllByRole('link', { name: 'Try Atlas' }).map(a => a.getAttribute('href'))).toEqual(['/']);
    const demo = screen.getAllByRole('link', { name: 'Request a demo' });
    expect(demo).toHaveLength(1);
    expect(demo[0].closest('section')).toContainElement(screen.getByRole('heading', { level: 2, name: 'Request a Demo' }));
  });

  it('links to Research only when the research pages exist', () => {
    render(<ResearchersPage />);
    const research = screen.queryByRole('link', { name: 'Explore Research' });
    if (FEATURES.researchApps) expect(research).toHaveAttribute('href', '/research');
    else expect(research).toBeNull();
  });

  it('says nothing about what Atlas is not', () => {
    const { container } = render(<ResearchersPage />);
    expect(container.textContent).not.toMatch(/trip plann|replace|official source|can be wrong|doesn’t|does not/i);
  });
});

describe('For Researchers flag (CIV-1709: local only)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it('is on only on the Vite dev server, never on a beta or public build', async () => {
    const flagFor = async (dev: boolean, mode: string) => {
      vi.resetModules();
      vi.stubEnv('DEV', dev);
      vi.stubEnv('VITE_ATLAS_MODE', mode);
      const config = await import('../../shared/config');
      return [config.FEATURES.researchersLink, config.seoFlags().researchers];
    };
    expect(await flagFor(true, 'dev')).toEqual([true, true]);
    expect(await flagFor(false, 'beta')).toEqual([false, false]);
    expect(await flagFor(false, 'preview')).toEqual([false, false]);
    expect(await flagFor(false, 'public')).toEqual([false, false]);
  });
});
