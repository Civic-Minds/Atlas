import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// CIV-1237: the "How Atlas talks" rules in docs/STYLE.md that a slip in src/ can break. Times read "2–5 AM", "11 AM–3 PM"
// (shared/timeText.ts), frequencies come from shared/headwayText.ts, "schedule" not "timetable", "consistent" not
// "steady", and nothing is set in capitals. Comments may quote the old forms; only code counts.
const SRC = resolve(__dirname, '../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const RULES: Array<{ name: string; pattern: RegExp }> = [
  // A whole word only, so code names such as noTimetableTrip don't count.
  { name: '"timetable" (say "schedule")', pattern: /\b[Tt]imetabled?\b/ },
  { name: '"steady" (say "consistent")', pattern: /\b[Ss]teady\b/ },
  { name: 'a lowercase am/pm or a.m./p.m. (write "7 AM", from shared/timeText.ts)', pattern: /\d ?(am|pm)\b|\b[ap]\.m\./ },
  { name: '":00" on the hour (write "7 AM")', pattern: /\d:00 ?(AM|PM)\b/ },
  { name: '"to" between two times (write "6–9 AM")', pattern: /\d ?(AM|PM) to \d/ },
  { name: 'a hyphen in a range of times or minutes (use an en dash)', pattern: /\d-\d+ ?(AM|PM|min)\b/ },
  { name: '"every N min" written by hand (use shared/headwayText.ts)', pattern: /every (\$\{[^}]*\}|\d+) ?min\b/ },
  { name: 'text set in capitals (uppercase class or textTransform)', pattern: /\buppercase\b|textTransform/ },
];

// Waiting for Ryan's word-for-word OK, so not changed yet: remove each entry when its new wording lands. The Live wording
// is on the CIV-1237 review page; the docs page is CIV-1236's.
const PENDING: Record<string, string[]> = {
  '"timetable" (say "schedule")': [
    'LiveExplorePage.tsx', 'components/charts/GapsChart.tsx', 'components/Live/LiveRoutePerformance.tsx', 'components/Live/methodLines.tsx',
    'components/Live/sections/BunchingSection.tsx', 'components/Live/sections/ExtraWaitSection.tsx', 'components/Live/sections/MethodSection.tsx',
    'components/Live/sections/RunTimeSection.tsx',
  ],
  '"steady" (say "consistent")': ['AboutDocsPage.tsx'],
  'a lowercase am/pm or a.m./p.m. (write "7 AM", from shared/timeText.ts)': ['AboutDocsPage.tsx'],
};

// Block comments, and line comments that don't start inside a string or a URL.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');

describe('UI text follows docs/STYLE.md "How Atlas talks"', () => {
  const sources = files(SRC).map(f => [relative(SRC, f), code(readFileSync(f, 'utf8'))] as const);

  for (const rule of RULES) {
    it(`no ${rule.name}`, () => {
      const offenders = sources
        .filter(([f, src]) => rule.pattern.test(src) && !(PENDING[rule.name] ?? []).includes(f))
        .map(([f, src]) => `${f}: ${src.split('\n').find(line => rule.pattern.test(line))!.trim().slice(0, 120)}`);
      expect(offenders).toEqual([]);
    });
  }

  it('every pending entry still has its slip (remove it once fixed)', () => {
    for (const [name, pending] of Object.entries(PENDING)) {
      const rule = RULES.find(r => r.name === name)!;
      for (const f of pending) expect([f, rule.pattern.test(sources.find(([s]) => s === f)?.[1] ?? '')]).toEqual([f, true]);
    }
  });

  it('each rule catches the slip it is for, and leaves code names and the right forms alone', () => {
    const slips = [
      '<Fact label="Gaps off the timetable" />',
      "const t = 'Steady service';",
      "const clock = (h) => `${h} pm`; 'Daily 6 a.m.–9 p.m.'",
      "'Weekdays 7:00 AM–7 PM'",
      "'6 AM to 9 AM'",
      "'6-9 AM'",
      '`every ${headway} min`',
      '<span className="uppercase tracking-wide">',
    ];
    RULES.forEach((rule, i) => expect([rule.name, rule.pattern.test(slips[i])]).toEqual([rule.name, true]));
    const fine = "lo.noTimetableTrip; isSteadyInAnyPeriod; '6–9 AM'; '11 AM–3 PM'; headwayEvery(10); 'every 15 minutes'; 'Mon–Fri 5:30 AM–8 PM'";
    for (const rule of RULES) expect([rule.name, rule.pattern.test(fine)]).toEqual([rule.name, false]);
  });
});
