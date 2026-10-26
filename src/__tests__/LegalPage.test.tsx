import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import LegalPage, { LEGAL_DOCS } from '../LegalPage';
import { parseLegalMarkdown } from '../lib/legalMarkdown';
import privacySource from '../../docs/legal/PRIVACY.md?raw';
import termsSource from '../../docs/legal/TERMS.md?raw';

describe('LegalPage', () => {
  it('renders the expanded privacy policy with a specific update date', () => {
    render(<LegalPage document="privacy" />);

    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to Atlas' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Last updated October 3, 2026.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Location' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'hey@ryanisnota.pro' })).toHaveLength(2);
  });

  it('renders the expanded terms with accuracy and regional-rights sections', () => {
    render(<LegalPage document="terms" />);

    expect(screen.getByRole('heading', { name: 'Terms of Service' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Accuracy' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Licence' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Liability' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Enforcement' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Regional rights' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });
});

describe('LegalPage text comes from docs/legal', () => {
  const sources = { terms: termsSource, privacy: privacySource } as const;

  for (const document of ['terms', 'privacy'] as const) {
    it(`renders ${document} with exactly the headings and paragraphs of its markdown file`, () => {
      const { container } = render(<LegalPage document={document} />);
      const article = container.querySelector('article')!;
      const blocks = sources[document].trim().split(/\n{2,}/).map(block => block
        .replace(/^#+ /, '')
        .replace(/ \{#[a-z0-9-]+\}$/, '')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'));
      const rendered = [...article.querySelectorAll('h1, h2, h3, p, a')]
        .filter(el => el.tagName !== 'A' || el.parentElement?.tagName !== 'P')
        .map(el => el.textContent);
      expect(rendered).toEqual(blocks);
      expect(article.querySelector('header p')?.textContent).toBe('Last updated October 3, 2026.');
    });

    it(`keeps every ${document} link and section anchor from the markdown`, () => {
      const { container } = render(<LegalPage document={document} />);
      const article = container.querySelector('article')!;
      const links = [...sources[document].matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(([, text, href]) => ({ text, href }));
      expect(links.length).toBeGreaterThan(0);
      const renderedLinks = [...article.querySelectorAll('a')].map(a => ({ text: a.textContent, href: a.getAttribute('href') }));
      expect(renderedLinks).toEqual(links);
      const ids = [...sources[document].matchAll(/\{#([a-z0-9-]+)\}/g)].map(match => match[1]);
      expect([...article.querySelectorAll('section')].map(section => section.id)).toEqual(ids);
      expect(LEGAL_DOCS[document].sections.map(section => section.id)).toEqual(ids);
    });

    it(`prerenders ${document} with the markdown text`, () => {
      const html = renderToString(<StaticRouter location={`/${document}`}><LegalPage document={document} /></StaticRouter>);
      for (const section of LEGAL_DOCS[document].sections) expect(html).toContain(`id="${section.id}"`);
      expect(html).toContain('Last updated October 3, 2026.');
    });
  }

  it('rejects markdown the legal renderer does not support', () => {
    expect(() => parseLegalMarkdown('# T\n\nLast updated today.\n\n- a list item')).toThrow();
    expect(() => parseLegalMarkdown('# T\n\nLast updated today.\n\n## No id')).toThrow();
    expect(() => parseLegalMarkdown('# T\n\nLast updated today.\n\nSome **bold** text')).toThrow();
    expect(() => parseLegalMarkdown('# T\n\nNo date line')).toThrow();
  });
});
