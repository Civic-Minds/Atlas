import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LiveGlance from '../LiveGlance';
import type { AgencySummary } from '../../../../shared/liveAgency';
import { percentText } from '../../../../shared/numberText';

const summary = (late: { n: number; share: number } | null, evening?: { n: number; share: number }) => ({
  covered: ['501', '504', '505'],
  weekly: late ? { thisWeek: { late }, ...(evening ? { bands: { evening: { thisWeek: { late: evening }, lastWeek: {} } } } : {}) } : null,
}) as unknown as AgencySummary;

// CIV-2193: the recorded-route count moved beside the Live tab's name; the card keeps "Departures this week".
describe("Studio Live's summary card (CIV-1878, CIV-2193)", () => {
  it('heads the card with this week\'s departures, with no route count', () => {
    const { container } = render(<LiveGlance s={summary({ n: 400, share: 0.1 })} band="all" />);
    expect(screen.getByRole('region', { name: 'All routes' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b3\b.*routes/);
    expect(container.textContent).not.toMatch(/routes recorded/);
  });

  it('shows no empty card when the week has no departures', () => {
    const { container } = render(<LiveGlance s={summary(null)} band="all" />);
    expect(container.firstChild).toBeNull();
  });

  // CIV-2929 (Ryan, 2026-11-27, picked 1): the bar follows the picked time of day, like the week table, with its heading.
  it("follows the picked time of day, titled like the week table, rounding as the table does", () => {
    const { container } = render(<LiveGlance s={summary({ n: 400, share: 0.025 }, { n: 100, share: 0.032 })} band="evening" />);
    expect(screen.getByRole('region', { name: 'All routes · Evening' })).toBeInTheDocument();
    expect(container.textContent).toContain('3%');
    expect(container.textContent).toContain('97%');
  });

  it('rounds a whole-day 2.5% the way the table does', () => {
    const { container } = render(<LiveGlance s={summary({ n: 400, share: 0.025 })} band="all" />);
    expect(container.textContent).toContain(percentText(0.025));
  });
});
