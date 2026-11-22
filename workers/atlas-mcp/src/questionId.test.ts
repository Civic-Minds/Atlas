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
  it('gives no example ID that every new chat would copy (#1707)', () => {
    const d = (TOOLS[0].inputSchema as { properties: { question_id: { description: string } } }).properties.question_id.description;
    expect(d).not.toMatch(/such as|e\.g\.|"[^"]+"/);
    expect(d).toMatch(/random/);
  });
  it('logs the ID, counts distinct IDs as questions, and has a migration for the column', () => {
    const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(index).toContain('question_id: questionId');
    expect(index).toContain('INSERT INTO calls (at, tester, tool, args, question, question_id,');
    // #1706: a blank ID is stored as none and never counted as a question.
    expect(index).toContain("typeof questionId === 'string' && questionId.trim() ? questionId.trim().slice(0, 100) : null");
    // #1709: an ID repeated on another day counts as another question.
    expect(index).toContain("COUNT(DISTINCT NULLIF(TRIM(c.question_id), \\'\\') || char(31) || substr(c.at, 1, 10))");
    expect(index).not.toContain('COUNT(DISTINCT c.question_id)');
    expect(index).toContain('AS questions_7d');
    const migration = readFileSync(new URL('../migrations/0002_question_id.sql', import.meta.url), 'utf8');
    expect(migration).toMatch(/ALTER TABLE calls ADD COLUMN question_id TEXT/);
  });
});
