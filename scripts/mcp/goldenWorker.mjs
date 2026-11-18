// Runs a golden file's calls through the local hosted Worker and compares each answer (CIV-1840). Usage: node scripts/mcp/goldenWorker.mjs <tester link> <golden.json>; steps in workers/atlas-mcp/README.md.
import { readFileSync } from 'node:fs';
const [,, link, golden] = process.argv;
const g = JSON.parse(readFileSync(golden, 'utf8'));
let same = 0, diff = [];
for (const [i, x] of g.entries()) {
  const [name, args] = x.call;
  const res = await (await fetch(link, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name, arguments: { ...args, question: `golden ${i + 1}` } } }) })).json();
  const a = JSON.stringify(res.result), b = JSON.stringify(x.result);
  if (a === b) same++; else diff.push(`${i + 1} ${name} ${JSON.stringify(args).slice(0, 60)}`);
}
console.log('same', same, 'of', g.length, diff.length ? 'DIFF: ' + diff.join(' | ') : '');
