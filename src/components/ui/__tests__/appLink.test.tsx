import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import AppLink from '../AppLink';
import ScrollToTop from '../../ScrollToTop';
import ArrowLink from '../ArrowLink';
import LinkCard from '../LinkCard';

function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }

describe('AppLink and ScrollToTop (CIV-1619)', () => {
  it('opens the page through the router, with the same address on the link', () => {
    render(<MemoryRouter initialEntries={['/about']}><AppLink to="/research">Research</AppLink><Where /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Research' });
    expect(link.getAttribute('href')).toBe('/research');
    expect(fireEvent.click(link)).toBe(false); // the router handled it: the browser's own navigation is cancelled
    expect(screen.getByTestId('where').textContent).toBe('/research');
  });

  it('is a plain link where there is no router', () => {
    render(<AppLink to="/research">Research</AppLink>);
    expect(screen.getByRole('link', { name: 'Research' }).getAttribute('href')).toBe('/research');
  });

  it('scrolls to the top when the page changes, not for a place on the same page', () => {
    const calls: unknown[] = [];
    window.scrollTo = ((...a: unknown[]) => { calls.push(a); }) as typeof window.scrollTo;
    render(
      <MemoryRouter initialEntries={['/about']}>
        <ScrollToTop />
        <AppLink to="/research">Research</AppLink>
        <AppLink to="/research#method">Method</AppLink>
        <Routes><Route path="*" element={null} /></Routes>
      </MemoryRouter>,
    );
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('link', { name: 'Research' }));
    expect(calls).toHaveLength(1);
    fireEvent.click(screen.getByRole('link', { name: 'Method' }));
    expect(calls).toHaveLength(1);
  });

  it('keeps another site, mailto and new-tab links as plain links, so the router never takes them', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <AppLink to="https://example.org/">Outside</AppLink>
        <AppLink to="mailto:a@b.c">Mail</AppLink>
        <AppLink to="//example.org/x">Same scheme</AppLink>
        <AppLink to="/agencies/ttc" target="_blank">New tab</AppLink>
        <Where />
      </MemoryRouter>,
    );
    for (const name of ['Outside', 'Mail', 'Same scheme', 'New tab']) expect(fireEvent.click(screen.getByRole('link', { name }))).toBe(true);
    expect(screen.getByTestId('where').textContent).toBe('/about');
  });

  it('ArrowLink and LinkCard with an Atlas href open through the router, and outside ones do not', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <ArrowLink href="/docs">Docs</ArrowLink>
        <ArrowLink href="https://example.org/" external>Out</ArrowLink>
        <LinkCard href="/terms">Terms</LinkCard>
        <Where />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Docs' }).getAttribute('href')).toBe('/docs');
    expect(fireEvent.click(screen.getByRole('link', { name: 'Out' }))).toBe(true);
    expect(fireEvent.click(screen.getByRole('link', { name: 'Docs' }))).toBe(false);
    expect(screen.getByTestId('where').textContent).toBe('/docs');
    expect(fireEvent.click(screen.getByRole('link', { name: 'Terms' }))).toBe(false);
    expect(screen.getByTestId('where').textContent).toBe('/terms');
  });
});
