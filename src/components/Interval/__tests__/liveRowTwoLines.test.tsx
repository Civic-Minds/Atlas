import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import RouteDirectionRow from '../RouteDirectionRow';
import { liveRowValueProps, scheduleLine } from '../../../utils/liveRowValue';
import { headwayToTierColor } from '../../../utils/colors';

const src = (p: string) => readFileSync(resolve(__dirname, '../../../..', p), 'utf8');

// Ryan, 2026-11-27 ("Why is the number of vehicles on a third line instead of on the fist line like i asked"): the vehicles
// sit on the destination's line, right-aligned, no dot. CIV-3158 (Ryan, 2026-11-28): then "live 10–13 min", bold with the
// dot, then "schedule 10 min" in normal weight, units on both "because sometimes it might not be in minutes".
describe('a Live destination row (CIV-3158)', () => {
  const row = () => render(
    <RouteDirectionRow label="to Keele" labelEnd="3 vehicles" labelWeight="regular" wrapLongValue
      {...liveRowValueProps({ from: 10, longest: 13, median: 11 }, { headway: 10 })} />,
  );

  it('reads vehicles, then live, then schedule, each on its own line', () => {
    const { container } = row();
    const label = container.querySelector('[data-flag-label]');
    expect(label?.textContent).toBe('to Keele');
    expect(label?.nextElementSibling?.textContent).toBe('3 vehicles');
    const value = label!.nextElementSibling!.nextElementSibling!;
    expect(value.className).toContain('basis-full');
    expect(value.textContent).toBe('live 10–13 min');
    const note = container.querySelector('[data-testid="row-value-note"]')!;
    expect(note.textContent).toBe('schedule 10 min');
    expect(note.className).toContain('basis-full');
    expect(note.className).toContain('font-normal');
    // Order on the page: vehicles, live, schedule.
    const text = container.textContent!;
    expect(text.indexOf('3 vehicles')).toBeLessThan(text.indexOf('live 10–13 min'));
    expect(text.indexOf('live 10–13 min')).toBeLessThan(text.indexOf('schedule 10 min'));
  });

  it('bolds the live line and puts the dot on it, coloured by the typical (median) live gap, never a single gap (Ryan: "Feel like using a colour for a single gap isn\'t ideal"); the vehicles carry no dot', () => {
    const { container } = row();
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots.length).toBe(1);
    const liveLine = dots[0].closest('.font-black');
    expect(liveLine?.textContent).toBe('live 10–13 min');
    const ref = document.createElement('span');
    ref.style.background = headwayToTierColor(11);
    expect((dots[0] as HTMLElement).style.background).toBe(ref.style.background);
    expect(liveRowValueProps({ from: 2, longest: 40, median: 9 }, { headway: 10 }).colorHeadway).toBe(9);
  });

  it('names units on both lines through the shared formatters, with seconds under a minute', () => {
    expect(liveRowValueProps({ from: null, longest: 0.5, median: 0.5 }, { headway: 10 }).headwayLabel).toBe('live 30 sec');
    expect(scheduleLine({ headway: 12, trunkHeadway: 6 })).toBe('schedule 6–12 min');
    expect(scheduleLine({ headway: 90 })).toBe('schedule 90 min');
  });

  it("keeps the row's settled words on the schedule line (CIV-3121, CIV-3135)", () => {
    expect(scheduleLine({ headway: 10, headwayLabel: 'every 10 min until 5:05 PM' })).toBe('schedule 10 min until 5:05 PM');
    expect(scheduleLine({ headway: 10, headwayLabel: 'every 10 min from 4:37 PM' })).toBe('schedule 10 min from 4:37 PM');
    expect(scheduleLine({ headway: 15, headwayLabel: 'every 15 min, with one 32 min gap' })).toBe('schedule 15 min, with one 32 min gap');
    // The card's rows and Live's own rows both hand the row's words over.
    expect(src('src/components/Interval/panels/RouteCardHeadway.tsx')).toContain('headwayLabel: shown.value.headwayLabel');
  });

  it('never brings back "every … · gaps …" on Live, Studio or the map card', () => {
    for (const p of ['src/components/Interval/panels/RouteCardHeadway.tsx', 'src/components/Live/LiveRoutePerformance.tsx', 'src/apps/studio/RouteRightNow.tsx', 'src/apps/LiveVehicles.tsx', 'shared/liveWording.ts']) {
      const s = src(p);
      expect(s, p).not.toMatch(/headwaySuffix=\{[^}]*gap/);
      expect(s, p).not.toMatch(/`gaps \$\{/);
      expect(s, p).not.toContain('gapRangeText');
    }
    // Both the card's rows and Live's own rows build the value with the one helper.
    expect(src('src/components/Interval/panels/RouteCardHeadway.tsx')).toContain('liveRowValueProps(live.gap');
    expect(src('src/components/Live/LiveRoutePerformance.tsx')).toContain('liveRowValueProps(');
  });
});
