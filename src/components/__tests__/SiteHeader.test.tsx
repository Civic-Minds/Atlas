import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import SiteHeader from '../SiteHeader';
import ModeTag from '../ModeTag';
import { INTERNAL_GROUPS, INTERNAL_HEADER_LINKS } from '../../../shared/internalPages';
import { INTERNAL_PATH, LIVE_PATH } from '../../../shared/pagePaths';

describe('SiteHeader on phones (CIV-1301)', () => {
  it('hides Docs below the sm breakpoint, so the other links fit on one line; it stays in the footer', () => {
    render(<SiteHeader />);
    const docs = screen.getByRole('link', { name: 'Docs' });
    expect(docs.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'sm:inline']));
    for (const name of [/Research/, /Studio/, /Go to Atlas/]) {
      const link = screen.queryByRole('link', { name });
      if (link) expect(link.className.split(/\s+/), String(name)).not.toContain('hidden');
    }
    expect(screen.getByRole('link', { name: /Go to Atlas/ })).toHaveAttribute('href', '/');
  });

  it('has no Agencies link; Agencies is in the footer (CIV-1771)', () => {
    render(<SiteHeader />);
    expect(screen.queryByRole('link', { name: /Agencies/ })).toBeNull();
  });
});

describe('internal links (CIV-1872)', () => {
  it('puts the local-only links in their own nav, ending with More, and keeps Studio out of the public one', () => {
    render(<SiteHeader />);
    const internal = screen.getByRole('navigation', { name: 'Internal pages' });
    expect([...internal.querySelectorAll('a')].map(a => a.textContent?.replace(/\s*→$/, ''))).toEqual(INTERNAL_HEADER_LINKS.map(l => l.label));
    // More carries the same arrow as Go to Atlas.
    expect(internal.querySelectorAll('a')[INTERNAL_HEADER_LINKS.length - 1].innerHTML).toBe(screen.getByRole('link', { name: /Go to Atlas/ }).innerHTML.replace('Go to Atlas', 'More'));
    expect(internal.querySelectorAll('a')[INTERNAL_HEADER_LINKS.length - 1]).toHaveAttribute('href', INTERNAL_PATH);
    expect(screen.getByRole('navigation', { name: 'Site navigation' }).textContent).not.toMatch(/Studio|Coverage/);
    expect(screen.getAllByRole('link', { name: /Go to Atlas/ })).toHaveLength(1);
    // The row carries the word Internal on the left, in the pale selected tint (never a dark fill).
    expect(internal.firstElementChild?.textContent).toBe('Internal');
    expect(internal.className).toContain('bg-[var(--control-active-bg)]');
  });

  it('lists every internal page once on the home page, and the header links are among them, More, or Live (the main map, not an internal page)', () => {
    const pages = INTERNAL_GROUPS.flatMap(g => g.pages);
    const paths = pages.map(p => p.path);
    expect(new Set(pages.map(p => p.title)).size).toBe(pages.length);
    for (const link of INTERNAL_HEADER_LINKS.filter(l => l.path !== INTERNAL_PATH && l.path !== LIVE_PATH)) expect(paths).toContain(link.path);
  });

  it('opens the home page from the Internal tag', () => {
    render(<MemoryRouter><ModeTag word="Internal" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Internal' })).toBeTruthy();
  });
});
