import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import HomeRemount from '../HomeRemount';

let mounts = 0;

/** Stands in for the map: its selection is read from the URL once, on mount, like the real map. */
function FakeMap({ onGoHome }: { onGoHome: () => void }) {
  const { pathname, search } = useLocation();
  const [route] = useState(() => { mounts += 1; return new URLSearchParams(search).get('route'); });
  return (
    <div>
      <span data-testid="where">{pathname + search}</span>
      {route && <div data-testid="route-card">{route}</div>}
      <button type="button" onClick={onGoHome}>Atlas home</button>
    </div>
  );
}

describe('HomeRemount (Atlas logo goes home)', () => {
  it.each([
    '/?limited=0&lat=44.77369&lon=-75.11520&z=2.62&route=ttc%3A%3A29',
    '/apps/history?route=ttc%3A%3A29',
    '/apps/live?route=ttc%3A%3A29&cmp=1',
  ])('closes the route card and resets %s to a bare "/"', (start) => {
    mounts = 0;
    render(
      <MemoryRouter initialEntries={[start]}>
        <HomeRemount>{goHome => <FakeMap onGoHome={goHome} />}</HomeRemount>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('route-card')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Atlas home' }));

    expect(screen.queryByTestId('route-card')).toBeNull();
    expect(screen.getByTestId('where').textContent).toBe('/');
    expect(mounts).toBe(2);
  });
});
