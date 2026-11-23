import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LiveGlance from '../LiveGlance';
import { STUDIO_GLANCE } from '../../../../shared/liveWording';
import type { AgencySummary } from '../../../../shared/liveAgency';

const summary = (late: { n: number; share: number } | null) => ({
  covered: ['501', '504', '505'],
  weekly: late ? { thisWeek: { late } } : null,
}) as unknown as AgencySummary;

// CIV-2193: the recorded-route count moved beside the Live tab's name; the card keeps "Departures this week".
describe("Studio Live's summary card (CIV-1878, CIV-2193)", () => {
  it('heads the card with this week\'s departures, with no route count', () => {
    const { container } = render(<LiveGlance s={summary({ n: 400, share: 0.1 })} />);
    expect(screen.getByRole('region', { name: STUDIO_GLANCE.barTitle })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b3\b.*routes/);
    expect(container.textContent).not.toMatch(/routes recorded/);
  });

  it('shows no empty card when the week has no departures', () => {
    const { container } = render(<LiveGlance s={summary(null)} />);
    expect(container.firstChild).toBeNull();
  });
});
