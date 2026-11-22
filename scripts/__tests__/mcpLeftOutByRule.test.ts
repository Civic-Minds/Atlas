import { describe, expect, it } from 'vitest';
import { figurePasses, leftOutByRule } from '../mcp/atlasData';
import { edgeWaitBit } from '../../shared/rules/frequency';

// CIV-2086: OC Transpo 34, Sunday midday, reads every 30 but the map's every-30 filter leaves it out (breaks 8).
describe('routes the filter rule leaves out', () => {
  const oc34 = { waitMinutes: 30, filter: { wait: 30, breaks: edgeWaitBit(30)! } };
  it('names a route within every N that the rule drops', () => {
    expect(figurePasses(oc34, 30)).toBe(false);
    expect(leftOutByRule(oc34, 30)).toBe(true);
  });
  it('leaves out neither a route that passes nor one slower than asked', () => {
    expect(leftOutByRule({ waitMinutes: 30, filter: { wait: 30, breaks: 0 } }, 30)).toBe(false);
    expect(leftOutByRule({ waitMinutes: 60, filter: { wait: 60, breaks: 0 } }, 30)).toBe(false);
    expect(leftOutByRule(oc34, 60)).toBe(false);
  });
});
