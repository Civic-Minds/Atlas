import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapAppShell, MapAppHeader } from '../MapAppShell';
import { framePadding } from '../MapAppFooter';

function stubPhone(phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query.includes('max-width: 639px'), media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
}

const page = () => render(
  <MemoryRouter initialEntries={['/apps/live/ttc/tool']}>
    <Routes>
      <Route path="/" element={<p>the map</p>} />
      <Route path="/apps/live/ttc/tool" element={<MapAppShell><MapAppHeader>Top bar</MapAppHeader></MapAppShell>} />
    </Routes>
  </MemoryRouter>,
);

describe('MapAppShell (CIV-1732)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the page on a desktop', () => {
    stubPhone(false);
    page();
    expect(screen.getByText('Top bar')).toBeTruthy();
  });

  it('falls back to the map on a phone, as History and Compare do', () => {
    stubPhone(true);
    page();
    expect(screen.getByText('the map')).toBeTruthy();
    expect(screen.queryByText('Top bar')).toBeNull();
  });

  it('frames the map above the footer', () => {
    expect(framePadding({ top: 56, bottom: 24, left: 410, right: 24 }, 0).bottom).toBe(24);
    expect(framePadding({ top: 56, bottom: 24, left: 410, right: 24 }, 40).bottom).toBe(64);
  });
});
