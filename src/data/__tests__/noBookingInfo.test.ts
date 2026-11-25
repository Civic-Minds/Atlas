import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as Services from '../onDemandServiceAreas';

// Ryan, 2026-11-24: "THis is like the 6th time i have said to remove the on demand booking info", and earlier (CIV-1784):
// "this isnt for ppl using it like google maps". Atlas is not a trip-planning tool, so no booking info anywhere: no booking
// field in the on-demand data, and no app names, booking links, phone numbers or booking-ahead rules in zone text.
const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const onDemandConfigs = readdirSync(resolve(root, 'config/on-demand')).filter(f => f.endsWith('.json')).map(f => `config/on-demand/${f}`);
const dataFiles = readdirSync(resolve(root, 'src/data')).filter(f => /\.tsx?$/.test(f)).map(f => `src/data/${f}`);
const codeFiles = ['src/App.tsx', 'shared/onDemandAvailability.ts', 'src/components/Interval/AgencyCard.tsx', 'scripts/mcp/onDemandTools.ts'];

// Zone text fields a rider reads on the zone card or in the MCP's on_demand_zones answer.
const ZONE_TEXT_FIELDS = ['serviceName', 'serviceHours', 'hoursNote', 'eligibility', 'tripRules'];
const BOOKING_TEXT = [
  /\bbook(?:ing|ed)?\b(?! ?let)/i, // "Book in the app", "booking ahead", "must be booked"
  /\b(?:the|its|our) [\w/ -]{0,40}\bapp\b/i, // "in the GPM Connect app"
  /\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/, // phone numbers
  /\bcall(?: or text)?\b/i,
  /ridewithvia|rideco|\bbook\.[a-z]/i,
];

function zoneTexts(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach(v => zoneTexts(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (ZONE_TEXT_FIELDS.includes(k) && typeof v === 'string') out.push(v);
      else zoneTexts(v, out);
    }
  }
  return out;
}

describe('no on-demand booking info (Ryan, 2026-11-24)', () => {
  it('no booking field in the on-demand data or the code that reads it', () => {
    const offenders = [...onDemandConfigs, ...dataFiles, ...codeFiles].filter(f => /\bbooking(?:Info|Url)\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('no booking text in any zone text field of the on-demand configs', () => {
    const offenders: string[] = [];
    for (const f of onDemandConfigs) {
      for (const text of zoneTexts(JSON.parse(read(f)))) {
        if (BOOKING_TEXT.some(re => re.test(text))) offenders.push(`${f}: ${text.slice(0, 120)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no booking text in any zone text field of the built-in service areas', () => {
    const offenders = zoneTexts(Object.values(Services)).filter(text => BOOKING_TEXT.some(re => re.test(text)));
    expect(offenders).toEqual([]);
  });

  it('the zone card has no Booking section', () => {
    expect(read('src/components/Interval/AgencyCard.tsx')).not.toMatch(/>\s*Booking\s*</);
  });
});
