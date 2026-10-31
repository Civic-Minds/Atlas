import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// CIV-1237: the "How Atlas talks" rules in docs/STYLE.md that a slip in src/ or shared/ can break (CIV-1238 adds the
// retired "no regular service" and "one-off routes"). Times read "2–5 AM", "11 AM–3 PM"
// (shared/timeText.ts), frequencies come from shared/headwayText.ts, "schedule" not "timetable", "consistent" not
// "steady", and nothing is set in capitals. Comments may quote the old forms; only code counts.
const ROOT = resolve(__dirname, '../../..');
const SCANNED = ['src', 'shared'];

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
  // A frequency is in "min" (STYLE.md); "minutes" only in the exact approved texts in APPROVED_TEXT.
  { name: '"every N minutes" as a frequency (write "every N min", from shared/headwayText.ts)', pattern: /every (\$\{[^}]*\}|\d+|\d+[–-]\d+)(\\u00A0|\u00A0| )?minutes\b/ },
  { name: 'text set in capitals (uppercase class or textTransform)', pattern: /\buppercase\b|textTransform/ },
  // CIV-1238 (Ryan): it read as if nothing runs. The words are IRREGULAR_PERIOD_LABEL / _SHORT_LABEL in noticeCopy.ts.
  { name: '"no regular service" (say "Irregular" or "Runs irregularly in this period")', pattern: /\b[Nn]o regular service\b/ },
  // CIV-1238 (Ryan): "one-off sounds like it only runs once per day". The hidden class is "Occasional".
  { name: '"one-off" for the hidden route class (say "occasional")', pattern: /\b[Oo]ne-off (routes?|service)\b/ },
];

// Files with a slip still waiting on Ryan's word-for-word OK, by rule; remove each entry when its new wording lands.
// Empty since the CIV-1237 pass.
const PENDING: Record<string, string[]> = {};

// Code names only: a file whose identifiers spell a rule's word, by rule. headwayText.ts is the frequency writer itself.
const CODE_NAMES: Record<string, string[]> = {
  '"steady" (say "consistent")': ['shared/worstDirection.ts'], // the all-day pool's `steady` field
  '"every N min" written by hand (use shared/headwayText.ts)': ['shared/headwayText.ts'],
};

// Exact texts Ryan approved word for word, or quotes of an agency's own words, that keep "minutes". Each is removed
// from its file before the rules run, so only that exact text passes.
const APPROVED_TEXT: Record<string, string[]> = {
  // N123 part-of-route-meets-filter (Ryan's exact wording, CIV-514).
  'src/content/noticeCopy.ts': ['Only part of this route runs every ${maxHeadway}\\u00A0minutes or better during the selected period.'],
  // The frequent-service story quoting agencies' definitions.
  'src/apps/FrequentServiceStory.tsx': ['“every 15 minutes or better”', '“every 15–20 minutes”'],
};

// Block comments, and line comments that don't start inside a string or a URL.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');

describe('UI text follows docs/STYLE.md "How Atlas talks"', () => {
  const sources = SCANNED.flatMap(dir => files(join(ROOT, dir))).map(f => {
    const name = relative(ROOT, f);
    const text = (APPROVED_TEXT[name] ?? []).reduce((src, approved) => src.split(approved).join(''), readFileSync(f, 'utf8'));
    return [name, code(text)] as const;
  });

  for (const rule of RULES) {
    it(`no ${rule.name}`, () => {
      const offenders = sources
        .filter(([f, src]) => rule.pattern.test(src) && ![...(PENDING[rule.name] ?? []), ...(CODE_NAMES[rule.name] ?? [])].includes(f))
        .map(([f, src]) => `${f}: ${src.split('\n').find(line => rule.pattern.test(line))!.trim().slice(0, 120)}`);
      expect(offenders).toEqual([]);
    });
  }

  it('every approved text is still in its file, word for word', () => {
    for (const [f, texts] of Object.entries(APPROVED_TEXT)) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      for (const text of texts) expect([f, text, src.includes(text)]).toEqual([f, text, true]);
    }
  });

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
      "'Buses come every 15 minutes or better.'",
      '<span className="uppercase tracking-wide">',
      "const label = 'no regular service';",
      "'Hide one-off routes'",
    ];
    RULES.forEach((rule, i) => expect([rule.name, rule.pattern.test(slips[i])]).toEqual([rule.name, true]));
    const fine = "lo.noTimetableTrip; isSteadyInAnyPeriod; '6–9 AM'; '11 AM–3 PM'; headwayEvery(10); '15 minutes'; 'Mon–Fri 5:30 AM–8 PM'; 'Irregular'; 'Hide occasional routes'; isOneOffTrip";
    for (const rule of RULES) expect([rule.name, rule.pattern.test(fine)]).toEqual([rule.name, false]);
  });
});
