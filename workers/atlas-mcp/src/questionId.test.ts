import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../../../scripts/mcp/toolDefs';

// Ryan, 2026-11-22 ("1"): the question is required on every tool, with a question ID shared by every call made for one
// question, and the usage page counts questions as well as calls.
describe('question and question ID on every tool', () => {
  it('every tool asks for both, as required, keeping its own required arguments', () => {
    for (const t of TOOLS) {
      const schema = t.inputSchema as { properties: Record<string, unknown>; required?: string[] };
      expect(schema.properties.question, t.name).toBeDefined();
      expect(schema.properties.question_id, t.name).toBeDefined();
      expect(schema.required, t.name).toEqual(expect.arrayContaining(['question', 'question_id']));
    }
    const compare = TOOLS.find(t => t.name === 'compare_agencies')!.inputSchema as { required: string[] };
    expect(compare.required).toEqual(expect.arrayContaining(['agencies', 'period', 'every']));
  });
  it('logs the ID, counts distinct IDs as questions, and has a migration for the column', () => {
    const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(index).toContain('question_id: questionId');
    expect(index).toContain('INSERT INTO calls (at, tester, tool, args, question, question_id,');
    expect(index).toContain('COUNT(DISTINCT c.question_id)');
    expect(index).toContain('AS questions_7d');
    const migration = readFileSync(new URL('../migrations/0002_question_id.sql', import.meta.url), 'utf8');
    expect(migration).toMatch(/ALTER TABLE calls ADD COLUMN question_id TEXT/);
  });
});
