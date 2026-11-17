import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResearchersPage from '../ResearchersPage';
import { ATLAS_INTRO_TEXT } from '../content/noticeCopy';
import coverage from '../../shared/data/atlas-coverage.json';

describe('For Researchers page (CIV-1709)', () => {
  it('has its title and Ryan’s card and section headings (CIV-1793)', () => {
    render(<ResearchersPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'For Researchers' })).toBeInTheDocument();
    for (const name of [
      'How Service Changed, Year by Year',
      'Compare Cities on One Map',
      'Maps You Can Cite',
      'Where the Data Comes From',
      'Request a Demo',
    ]) expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  });

  it('gives every feature card exactly two sentences', () => {
    const { container } = render(<ResearchersPage />);
    const cards = [...container.querySelectorAll('section')].filter(s => s.querySelector('h2') && s.style.background);
    const features = cards.filter(c => c.querySelector('h2')!.textContent !== 'Request a Demo');
    expect(features).toHaveLength(3);
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
    // Compare Cities (flipped), then Maps You Can Cite; History and the Request a demo card have no picture.
    expect(sides).toEqual(['left', 'right']);
    const srcs = [...container.querySelectorAll('img')].map(img => img.getAttribute('src'));
    for (const theme of ['light', 'dark']) {
      expect(srcs).toContain(`/assets/planners/hero-${theme}.webp`);
      for (const card of ['agency', 'export']) expect(srcs).toContain(`/assets/planners/card-${card}-desktop-${theme}.webp`);
    }
  });

  it('opens the map from the top and ends with the shared Request a demo card', () => {
    render(<ResearchersPage />);
    expect(screen.getAllByRole('link', { name: 'Try Atlas' }).map(a => a.getAttribute('href'))).toEqual(['/']);
    const demo = screen.getAllByRole('link', { name: 'Request a demo' });
    expect(demo).toHaveLength(1);
    expect(demo[0].closest('section')).toContainElement(screen.getByRole('heading', { level: 2, name: 'Request a Demo' }));
  });

  it('leads with the About intro as its bold line, and marks History Beta (CIV-1793)', () => {
    const { container } = render(<ResearchersPage />);
    const hero = container.querySelector('h1')!.parentElement!;
    expect([...hero.querySelectorAll('p')].map(p => p.textContent)).toEqual([ATLAS_INTRO_TEXT]);
    expect(hero.querySelector('p')!.className).toContain('font-bold');
    const beta = [...container.querySelectorAll('section')].filter(s => [...s.querySelectorAll('span')].some(t => t.textContent === 'Beta'));
    expect(beta.map(s => s.querySelector('h2')!.textContent)).toEqual(['How Service Changed, Year by Year']);
    expect(screen.getByText('We’ll explore your research question with you and show how the map can back up your next study.')).toBeInTheDocument();
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
