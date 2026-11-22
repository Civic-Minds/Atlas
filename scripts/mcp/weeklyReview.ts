/**
 * CIV-1853 (Ryan OK'd, 2026-11-18): once a week, review the questions testers asked the hosted MCP pilot; ones answered
 * wrong join the standing test set in QUESTIONS.md ("From the pilot log"). This script only reads: it fetches the last
 * 7 days of calls through the pilot's admin API (the token from its credentials file on this Mac, as local-api/mcp-testers.ts
 * does) and writes a review sheet, one section per question with each call's tool, arguments and answer.
 *
 * The sheet holds testers' own questions, so it is written outside the repo (default /tmp/atlas-mcp-weekly-review.md)
 * and never committed. Questions copied into QUESTIONS.md are rewritten in the reviewer's words, with no tester's name.
 *
 *   npx tsx scripts/mcp/weeklyReview.ts [--days 7] [--out /tmp/atlas-mcp-weekly-review.md] [--include-internal]
 *
 * The internal testing link ("MCP check") is left out unless --include-internal: its rounds are already logged in TEST-LOG.md.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MCP_PILOT_ORIGIN, type McpTester } from '../../shared/mcpTesters';

export interface LoggedCall { id: number; at: string; tool: string; args: string; question: string | null; question_id?: string | null; ok: number; result: string; ms: number }
export interface ReviewQuestion { tester: string; question: string; firstAt: string; calls: LoggedCall[] }

const TOKEN_FILE = join(homedir(), 'Developer/Credentials/Atlas Studio MCP admin for Atlas.env');
/** The D1 tester behind the internal testing link. */
export const INTERNAL_TESTER = 'MCP check';
/** The admin log endpoint's most calls per request. */
const LOG_LIMIT = 500;

/**
 * Groups one tester's calls into questions: calls sharing a question ID are one question (CIV-2145); calls from before
 * the ID existed, or sent without one, group by their question text; a call with neither stands alone.
 */
export function groupQuestions(tester: string, calls: LoggedCall[]): ReviewQuestion[] {
  const groups = new Map<string, ReviewQuestion>();
  for (const c of [...calls].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)) {
    const key = c.question_id ? `id:${c.question_id}` : c.question ? `q:${c.question.trim()}` : `call:${c.id}`;
    const g = groups.get(key);
    if (g) { g.calls.push(c); if (!g.question && c.question) g.question = c.question; }
    else groups.set(key, { tester, question: c.question ?? '', firstAt: c.at, calls: [c] });
  }
  return [...groups.values()];
}

/** The review sheet: one section per question, oldest first, each call's tool, arguments and answer. */
export function reviewSheet(questions: ReviewQuestion[], since: string): string {
  const out = [`# Atlas Studio MCP: pilot questions since ${since.slice(0, 10)}`, '',
    'For each question, decide whether the answer was right by the rules at the top of QUESTIONS.md. Wrong ones go to its "From the pilot log" group, in your own words, with no tester name.', ''];
  if (!questions.length) out.push('No questions this week.');
  questions.sort((a, b) => a.firstAt.localeCompare(b.firstAt)).forEach((q, i) => {
    out.push(`## ${i + 1}. ${q.question || '(no question given)'}`, '', `${q.tester}, ${q.firstAt.slice(0, 16).replace('T', ' ')} UTC, ${q.calls.length} call${q.calls.length === 1 ? '' : 's'}`, '');
    for (const c of q.calls) out.push(`- \`${c.tool}\` ${c.args}${Number(c.ok) ? '' : ' (failed)'}`, '', '```', c.result, '```', '');
  });
  return out.join('\n');
}

function adminToken(): string {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  const m = existsSync(TOKEN_FILE) && readFileSync(TOKEN_FILE, 'utf8').match(/^\s*(?:export\s+)?ADMIN_TOKEN\s*=\s*['"]?([^'"\s]+)/m);
  if (!m) throw new Error(`No ADMIN_TOKEN in ${TOKEN_FILE}.`);
  return m[1];
}

async function admin<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${MCP_PILOT_ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function main() {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const days = Number(arg('--days') ?? 7);
  const outPath = arg('--out') ?? '/tmp/atlas-mcp-weekly-review.md';
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const token = adminToken();
  const { testers } = await admin<{ testers: McpTester[] }>('/admin/testers', token);
  const questions: ReviewQuestion[] = [];
  for (const t of testers) {
    if (t.name === INTERNAL_TESTER && !process.argv.includes('--include-internal')) continue;
    const { calls } = await admin<{ calls: LoggedCall[] }>(`/admin/testers/${encodeURIComponent(t.name)}/log?limit=${LOG_LIMIT}`, token);
    const recent = calls.filter(c => c.at >= since);
    if (calls.length === LOG_LIMIT && recent.length === LOG_LIMIT) console.error(`${t.name}: ${LOG_LIMIT} calls in the period, the most one request returns; older ones are missing.`);
    questions.push(...groupQuestions(t.name, recent));
  }
  writeFileSync(outPath, reviewSheet(questions, since));
  console.log(`${questions.length} question(s) since ${since.slice(0, 10)}: ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
