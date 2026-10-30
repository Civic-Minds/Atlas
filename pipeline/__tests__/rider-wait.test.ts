import { describe, expect, it } from 'vitest';
import { boardingMainStretchWait, riderWait } from '../routeGrading';

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const every = (from: string, to: string, step: number) => {
  const out: number[] = [];
  for (let t = hm(from); t <= hm(to); t += step) out.push(t);
  return out;
};

describe('riderWait (CIV-1161 step 1)', () => {
  it('is the gap a rider arriving at a random time faces (time-weighted median)', () => {
    // TransLink 371 Sunday: 60 three times, then 30 five times; the 60s cover 55% of the time.
    expect(riderWait([...every('09:00', '12:00', 60), ...every('12:30', '14:30', 30)])?.wait).toBe(60);
    // Saskatoon 18 Saturday: 60 and 62, then 32 six times; the 32s cover 61% of the time.
    expect(riderWait([hm('09:00'), hm('10:00'), hm('11:02'), hm('11:34'), hm('12:06'), hm('12:38'), hm('13:10'), hm('13:42'), hm('14:14')])?.wait).toBe(32);
  });
  it('reads the wait a midday rider gets when service thins inside the window (MTA BxM7 to Midtown)', () => {
    // Every 15 until 10:00, then every 30 to 15:00.
    expect(riderWait([...every('09:00', '10:00', 15), ...every('10:30', '15:00', 30)])).toEqual({ wait: 30, window: 'midday' });
  });
  it('reads the common gap past one long one (CapMetro 985 southbound: 40, then 30, 30, 30)', () => {
    expect(riderWait([hm('05:50'), hm('06:30'), hm('07:00'), hm('07:30'), hm('08:00')])).toEqual({ wait: 30, window: 'allDay' });
    expect(riderWait([hm('09:00'), hm('09:40'), hm('10:10'), hm('10:40'), hm('11:10')])?.wait).toBe(30);
  });
  it('keeps an hourly half of the window (MTA BxM10 Saturday: hourly until 12:20, then every 30)', () => {
    expect(riderWait([...every('09:20', '12:20', 60), ...every('12:50', '14:50', 30)])?.wait).toBe(60);
  });
  it('falls back to the PM peak, then all day, like the headline', () => {
    expect(riderWait(every('15:00', '18:00', 20))).toEqual({ wait: 20, window: 'pmPeak' });
    expect(riderWait([hm('09:00'), hm('20:00')])).toBeNull();
  });
});

describe('boardingMainStretchWait (CIV-1161 step 1)', () => {
  const times: Record<string, number[]> = {
    a: every('09:00', '15:00', 20),
    b: every('09:05', '15:05', 20),
    // A drop-off-only stop where bunched arrivals would read otherwise.
    z: [hm('09:00'), hm('09:50'), hm('10:40'), hm('11:30'), hm('12:20')],
  };
  it('reads the median over the stops a rider can board, leaving drop-off-only stops out', () => {
    expect(boardingMainStretchWait(['a', 'b', 'z'], s => times[s] ?? [], new Set(['z']))).toEqual({ wait: 20, stops: 2 });
  });
  it('has no reading when no boarding stop has one', () => {
    expect(boardingMainStretchWait(['z'], s => times[s] ?? [], new Set(['z']))).toBeNull();
  });
});
