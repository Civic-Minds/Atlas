import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import AppLink from '../AppLink';
import ScrollToTop from '../../ScrollToTop';

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
});
