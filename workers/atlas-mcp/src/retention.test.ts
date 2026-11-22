import { describe, expect, it, vi } from 'vitest';
import { callLogCutoff, deleteOldCalls, PURGE_CALL_TEXT_SQL } from './retention';
import { MCP_CALL_LOG_RETENTION_MONTHS } from '../../../shared/rules/limits';

// #1691: Ryan picked a fixed 12 months for the MCP call log.
describe('call log retention', () => {
  it('keeps 12 months', () => {
    expect(MCP_CALL_LOG_RETENTION_MONTHS).toBe(12);
    expect(callLogCutoff(new Date('2026-11-22T03:17:00Z'))).toBe('2025-11-22T03:17:00.000Z');
  });
  it('falls to the month’s last day where the day is missing', () => {
    expect(callLogCutoff(new Date('2028-02-29T00:00:00Z'))).toBe('2027-02-28T00:00:00.000Z');
    expect(callLogCutoff(new Date('2026-03-31T12:00:00Z'), 1)).toBe('2026-02-28T12:00:00.000Z');
  });
  it('deletes calls stamped before the cutoff', async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 3 } });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    expect(await deleteOldCalls({ prepare } as unknown as D1Database, new Date('2026-11-22T00:00:00Z'))).toBe(3);
    expect(prepare).toHaveBeenCalledWith('DELETE FROM calls WHERE at < ?');
    expect(bind).toHaveBeenCalledWith('2025-11-22T00:00:00.000Z');
  });

  it('the pilot-end purge clears questions, arguments and answers but keeps the rest of each call (CIV-1841)', () => {
    expect(PURGE_CALL_TEXT_SQL).toMatch(/^UPDATE calls SET question = NULL, args = '\{\}', result = ''/);
    expect(PURGE_CALL_TEXT_SQL).not.toMatch(/DELETE|\bat\b|tool|ms|release_id/);
  });
});
