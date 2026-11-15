import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dayInSentence, dayPlural } from '../dayTypes';
import { noServiceOnDayNotice } from '../../src/content/noticeCopy';
import { frequentRuleText } from '../../src/content/researchRules';
import { onDemandRunningNote } from '../onDemandAvailability';

// CIV-1569: day names inside sentences come from dayPlural / dayInSentence in shared/dayTypes.ts.
describe('day names in sentences (CIV-1569)', () => {
  it('"on" takes the plural; weekday is lower case, Saturday and Sunday keep their capital', () => {
    expect(dayPlural('Weekday')).toBe('weekdays');
    expect(dayPlural('Saturday')).toBe('Saturdays');
    expect(dayPlural('Sunday')).toBe('Sundays');
    expect(dayInSentence('Weekday')).toBe('weekday');
    expect(dayInSentence('Saturday')).toBe('Saturday');
  });

  it('every sentence uses the same words', () => {
    expect(noServiceOnDayNotice('route', 'Saturday')).toContain('on Saturdays');
    expect(frequentRuleText({ frequency: 15, window: 'daytime', days: ['Weekday', 'Sunday'] } as Parameters<typeof frequentRuleText>[0])).toContain('on weekdays and Sundays');
    const hours = { Weekday: [{ startHour: 6, endHour: 20 }], Saturday: [{ startHour: 6, endHour: 20 }] };
    expect(onDemandRunningNote(hours, 'Weekday', 'all')).toBe('Running on weekdays');
    expect(onDemandRunningNote(hours, 'Saturday', 'all')).toBe('Running on Saturdays');
    expect(onDemandRunningNote(hours, 'Weekday', 'midday')).toBe('Running during weekday midday');
  });
});

const ROOT = resolve(__dirname, '../..');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');

describe('no day plural built by hand (CIV-1569)', () => {
  it('no `${day}s` and no own weekdays/Saturdays table outside shared/dayTypes.ts', () => {
    const hits = ['src', 'shared'].flatMap(d => files(join(ROOT, d))).flatMap(f => {
      const name = relative(ROOT, f);
      if (name === 'shared/dayTypes.ts') return [];
      return code(readFileSync(f, 'utf8')).split('\n')
        .filter(line => /\$\{(day|d|dayType)\}s\b|Saturday: ['"]Saturdays['"]|['"]Weekday['"] \? ['"]weekdays['"]/.test(line))
        .map(line => `${name}: ${line.trim()}`);
    });
    expect(hits).toEqual([]);
  });
});
