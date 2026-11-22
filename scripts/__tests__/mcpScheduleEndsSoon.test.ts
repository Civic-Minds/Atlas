import { describe, expect, it } from 'vitest';
import { scheduleEndsSoon, withScheduleWarning } from '../mcp/toolHelpers';

// CIV-2081: an answer whose schedule ends within FEED_EXPIRING_DAYS says so beside its figures.
describe('schedule ending soon', () => {
  const today = '2026-11-21';
  it('warns within the window, counting days', () => {
    expect((scheduleEndsSoon({ scheduleValidThrough: '2026-11-25' }, today) as { scheduleEndsSoon: string }).scheduleEndsSoon).toMatch(/^This schedule ends in 4 days \(2026-11-25\)/);
    expect((scheduleEndsSoon({ scheduleValidThrough: '2026-11-21' }, today) as { scheduleEndsSoon: string }).scheduleEndsSoon).toMatch(/ends today/);
    expect((scheduleEndsSoon({ scheduleValidThrough: '2026-11-28' }, today) as { scheduleEndsSoon?: string }).scheduleEndsSoon).toBeTruthy();
  });

  it('leaves answers alone that end later, already ended, or carry no date', () => {
    for (const r of [{ scheduleValidThrough: '2026-11-29' }, { scheduleValidThrough: '2026-11-20' }, { scheduleValidThrough: null }, 'text', null]) {
      expect(scheduleEndsSoon(r, today)).toBe(r);
    }
  });

  it('wraps every handler', async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const h = withScheduleWarning({ t: async () => ({ scheduleValidThrough: soon }) });
    expect(await h.t({})).toHaveProperty('scheduleEndsSoon');
  });
});
