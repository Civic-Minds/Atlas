import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnDemandHoursRows } from '../AgencyCard';

const split = { Weekday: [{ startHour: 6, endHour: 10 }, { startHour: 14, endHour: 18 }], Saturday: [], Sunday: [] };

describe('OnDemandHoursRows (CIV-964, variant C)', () => {
  it('one row per group of days with the same hours: its days, a bar per time range, and the times in words', () => {
    const { container } = render(<OnDemandHoursRows availability={split} day="Weekday" className="" />);
    expect(screen.getByText('Mon–Fri').className).toContain('font-bold');
    expect(screen.getByText('6–10 AM')).toBeTruthy();
    expect(screen.getByText('2–6 PM')).toBeTruthy();
    expect(container.querySelectorAll('.bg-\\[var\\(--hours-band\\)\\]').length).toBe(2);
  });

  it('a day group with no service says so, with no bar, and is not bold on another day', () => {
    render(<OnDemandHoursRows availability={split} day="Weekday" className="" />);
    expect(screen.getByText('Sat–Sun').className).not.toContain('font-bold');
    expect(screen.getByText('No service').closest('div')!.querySelector('.rounded-full')).toBeNull();
  });

  it('places a bar on the day scale (6 a.m. to 2 a.m.)', () => {
    const { container } = render(<OnDemandHoursRows availability={{ Weekday: [{ startHour: 6, endHour: 16 }] }} className="" />);
    const band = container.querySelector<HTMLElement>('.bg-\\[var\\(--hours-band\\)\\]')!;
    expect(band.style.left).toBe('0%');
    expect(band.style.width).toBe('50%');
  });

  it('falls back to the agency\'s own wording with no structured hours', () => {
    render(<OnDemandHoursRows serviceHours="Weekdays by appointment" className="x" />);
    expect(screen.getByText('Weekdays by appointment')).toBeTruthy();
  });
});
