import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #923: processing output depended on the machine's time zone. Loading the calendar code pins it.
describe('processing time zone (#923)', () => {
  it('runs calendar math in America/Toronto whatever TZ the process starts with', () => {
    const script = `
      const { detectReferenceDate } = await import(${JSON.stringify(resolve(__dirname, '../transit-calendar.ts'))});
      const cal = (id, s, e) => ({ service_id: id, monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: s, end_date: e });
      // A period across the Nov 1 2026 DST change: its midpoint is local-time math.
      const ref = detectReferenceDate([cal('a', '20261001', '20261130'), cal('b', '20261001', '20261130')], []);
      console.log(JSON.stringify({ tz: process.env.TZ, offset: new Date(2026, 10, 15).getTimezoneOffset(), ref }));
    `;
    const run = (tz: string) => JSON.parse(execFileSync('npx', ['tsx', '--eval', script, '--input-type=module'], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).trim().split('\n').at(-1)!);
    const utc = run('UTC'), toronto = run('America/Toronto');
    expect(utc.tz).toBe('America/Toronto');
    expect(utc.offset).toBe(300);
    expect(utc).toEqual(toronto);
  }, 60000);
});
