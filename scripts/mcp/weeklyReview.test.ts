import { describe, expect, it } from 'vitest';
import { groupQuestions, reviewSheet, type LoggedCall } from './weeklyReview';

const call = (id: number, at: string, over: Partial<LoggedCall> = {}): LoggedCall => ({ id, at, tool: 'route_frequency', args: '{"agency":"TTC"}', question: null, ok: 1, result: 'every 5', ms: 10, ...over });

describe('weekly pilot review (CIV-1853)', () => {
  it('groups calls by question ID, then by question text, and keeps calls with neither apart', () => {
    const groups = groupQuestions('Tester', [
      call(3, '2026-11-20T10:02:00Z', { question_id: 'q1', question: 'How often does the 504 run?' }),
      call(1, '2026-11-20T10:00:00Z', { question_id: 'q1' }),
      call(4, '2026-11-20T11:00:00Z', { question: 'Which routes serve Union?' }),
      call(5, '2026-11-20T11:01:00Z', { question: 'Which routes serve Union? ' }),
      call(6, '2026-11-20T12:00:00Z'),
      call(7, '2026-11-20T12:01:00Z'),
    ]);
    expect(groups.map(g => g.calls.map(c => c.id))).toEqual([[1, 3], [4, 5], [6], [7]]);
    expect(groups[0].question).toBe('How often does the 504 run?');
    expect(groups[0].firstAt).toBe('2026-11-20T10:00:00Z');
  });
  it('splits a question ID repeated on another day into its own question (#1709)', () => {
    const groups = groupQuestions('Tester', [
      call(1, '2026-11-20T10:00:00Z', { question_id: 'k3m9x2qa', question: 'How often does the 504 run?' }),
      call(2, '2026-11-20T10:01:00Z', { question_id: 'k3m9x2qa', question: 'How often does the 504 run at night?' }),
      call(3, '2026-11-21T09:00:00Z', { question_id: 'k3m9x2qa', question: 'Which routes serve Union?' }),
    ]);
    expect(groups.map(g => g.calls.map(c => c.id))).toEqual([[1, 2], [3]]);
  });

  it('writes one section per question, oldest first, with each call and failed calls marked', () => {
    const sheet = reviewSheet([
      { tester: 'B', question: 'Second', firstAt: '2026-11-21T09:00:00Z', calls: [call(2, '2026-11-21T09:00:00Z', { ok: 0, result: 'Unknown route' })] },
      { tester: 'A', question: 'First', firstAt: '2026-11-20T09:00:00Z', calls: [call(1, '2026-11-20T09:00:00Z')] },
    ], '2026-11-15T00:00:00Z');
    expect(sheet.indexOf('## 1. First')).toBeLessThan(sheet.indexOf('## 2. Second'));
    expect(sheet).toContain('(failed)');
    expect(sheet).toContain('From the pilot log');
    expect(reviewSheet([], '2026-11-15T00:00:00Z')).toContain('No questions this week.');
  });
});
