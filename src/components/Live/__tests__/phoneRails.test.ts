import { describe, expect, it } from 'vitest';
import { phoneRails } from '../BranchStrip';
import type { PhoneSection } from '../branchStripModel';

const sec = (key: string, branch: boolean, n: number, terminal: number): PhoneSection => ({ key, branch, terminal, stops: Array.from({ length: n }, (_, i) => ({ stopId: `${key}${i}`, name: `${key}${i}` }) as never) });

describe('phoneRails (CIV-515): branches as dotted lines that merge into the shared line', () => {
  // An outer lead-in, the lead-in next to the shared line, the shared line, the lead-out next to it, an outer lead-out.
  const r = phoneRails([sec('s0', true, 2, 0), sec('s1', true, 2, 0), sec('trunk', false, 3, -1), sec('e0', true, 2, 1), sec('e1', true, 2, 1)]);

  it('draws the shared line solid and the branches dotted, each starting at its end stop', () => {
    expect(r[2].every(row => !row.main.dotted && row.main.top === '0' && row.main.bottom === '0')).toBe(true);
    expect(r[0][0].main).toEqual({ top: '50%', bottom: '0', dotted: true });
    expect(r[4][1].main).toEqual({ top: '0', bottom: '50%', dotted: true });
  });

  it('runs the branch next to the shared line straight into it, and breaks the line between two branches', () => {
    expect(r[1][1].main.bottom).toBe('0');
    expect(r[3][0].main.top).toBe('0');
    expect(r[0][1].main.bottom).toBe('50%');
    expect(r[1][0].main.top).toBe('50%');
  });

  it('takes an outer branch along a lane beside the nearer branch and into the shared line where it joins', () => {
    expect(r[0][1].jogs).toEqual([12]);
    expect(r[0][1].lanes).toEqual([{ dx: 12, top: '50%', bottom: '0' }]);
    expect(r[1].map(row => row.lanes)).toEqual([[{ dx: 12, top: '0', bottom: '0' }], [{ dx: 12, top: '0', bottom: '0' }]]);
    expect(r[2][0]).toMatchObject({ jogs: [12], lanes: [{ dx: 12, top: '0', bottom: '50%' }] });
    expect(r[2][2]).toMatchObject({ jogs: [12], lanes: [{ dx: 12, top: '50%', bottom: '0' }] });
    expect(r[4][0]).toMatchObject({ jogs: [12], lanes: [{ dx: 12, top: '0', bottom: '50%' }] });
  });

  it('leaves a straight route alone', () => {
    expect(phoneRails([sec('trunk', false, 2, -1)])).toEqual([[{ main: { top: '0', bottom: '0', dotted: false }, lanes: [], jogs: [] }, { main: { top: '0', bottom: '0', dotted: false }, lanes: [], jogs: [] }]]);
  });
});
