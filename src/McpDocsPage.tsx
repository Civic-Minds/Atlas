import { useEffect, useState } from 'react';
import { MISSING_VALUE } from '../shared/missingValue';
import { dateTimeText } from '../shared/dateText';
import { MCP_TESTERS_API_URL, type McpTester, type McpTesterCall } from '../shared/mcpTesters';
import DocsPageLayout from './components/ui/DocsPageLayout';
import { PAGE_LEAD } from './components/ui/PageSection';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import Tag from './components/ui/Tag';
import CopyButton from './components/ui/CopyButton';
import DataTable, { type DataTableColumn } from './components/ui/DataTable';
import { TOOLS, TOOL_SUMMARIES, SERVER_VERSION } from '../scripts/mcp/toolDefs';
import { LIVE_TOOLS } from '../scripts/mcp/liveTools';
import { MCP_DOCS as C } from '../shared/mcpDocsCopy';
import { tabTitle } from '../shared/pageNames';

/**
 * CIV-1900: the internal docs page for the Atlas Studio MCP (dev server only, linked from /internal). The tool list is
 * read from the tool definitions the server sends Claude, each with its plain summary (TOOL_SUMMARIES), so it can't drift; the words are in shared/mcpDocsCopy.ts.
 */

/** The local server's setup, as scripts/mcp/README.md gives it (paths in the main checkout). */
const CHECKOUT = '/Users/ryan/Developer/Code/Platforms/Atlas';
const NODE = '/opt/homebrew/bin/node';
const ARGS = [`${CHECKOUT}/node_modules/tsx/dist/cli.mjs`, `${CHECKOUT}/scripts/mcp/atlas-mcp.ts`];
const CLAUDE_CODE = `claude mcp add -s user atlas-studio -- ${NODE} ${ARGS.join(' ')}`;
// CIV-2117: as the Nov 17-18 Gemini rounds added it (TEST-LOG; _reports/mcp-tests/run-agy.py).
const ANTIGRAVITY = `agy mcp add -e ATLAS_ROOT=${CHECKOUT} atlas-studio ${NODE} ${ARGS.join(' ')}`;
const CLAUDE_DESKTOP = JSON.stringify({ mcpServers: { 'atlas-studio': { command: NODE, args: ARGS } } }, null, 2);

/** A command or config block to paste elsewhere, with the shared copy button (CIV-2117). */
function CodeBlock({ text }: { text: string }) {
  return (
    <div className="relative mt-3">
      <pre className={`${CODE} pr-20`}><code>{text}</code></pre>
      <CopyButton text={text} className="absolute right-2 top-2" />
    </div>
  );
}

const SECTIONS = [
  { id: 'mcp-answers', label: C.answers.heading },
  { id: 'mcp-tools', label: C.tools.heading },
  { id: 'mcp-freshness', label: C.freshness.heading },
  { id: 'mcp-connect', label: C.connect.heading },
  { id: 'mcp-testers', label: C.testers.heading },
] as const;

// #1671: the same lead style as the other internal pages.
const PARAGRAPH = PAGE_LEAD;
const LIST = 'mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--text-muted)]';
const CODE = 'overflow-x-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-panel)] p-3 text-xs leading-5 text-[var(--text-primary)]';

function Section({ id, children }: { id: (typeof SECTIONS)[number]['id']; children: React.ReactNode }) {
  return (
    <section className="mt-12" aria-labelledby={id}>
      <SectionTitle id={id}>{SECTIONS.find(s => s.id === id)!.label}</SectionTitle>
      {children}
    </section>
  );
}

type ToolRow = (typeof TOOLS)[number];
/** The Tools table (Ryan, 2026-11-22: "In the MCP page should the Tools section be a table instead", picked 1). */
const toolColumns: DataTableColumn<ToolRow>[] = [
  { key: 'tool', header: C.tools.name, rowHeader: true, cell: t => <span className="font-semibold text-[var(--text-primary)]">{t.title} <code className="text-xs font-normal text-[var(--text-muted)]">{t.name}</code></span> },
  { key: 'answers', header: C.tools.answers, cell: t => TOOL_SUMMARIES[t.name] },
  { key: 'live', header: C.tools.live, cell: t => (LIVE_TOOLS.includes(t.name) ? <Tag size="inline">{C.tools.liveTag}</Tag> : null) },
];

const T = C.testers;
const when = (iso: string) => dateTimeText(iso) ?? MISSING_VALUE;

/** The hosted pilot's testers and each one's latest calls, read through the local API (local-api/mcp-testers.ts). */
function Testers() {
  const [testers, setTesters] = useState<McpTester[] | null | 'unavailable'>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [calls, setCalls] = useState<McpTesterCall[] | null>(null);
  useEffect(() => {
    fetch(MCP_TESTERS_API_URL).then(r => r.json()).then(d => setTesters(d.available ? d.testers : 'unavailable')).catch(() => setTesters('unavailable'));
  }, []);
  useEffect(() => {
    if (!open) return;
    setCalls(null);
    fetch(`${MCP_TESTERS_API_URL}?name=${encodeURIComponent(open)}`).then(r => r.json()).then(d => setCalls(d.available ? d.calls : [])).catch(() => setCalls([]));
  }, [open]);
  if (testers === 'unavailable') return <p className={PARAGRAPH}>{T.unavailable}</p>;
  if (testers === null) return <p className={PARAGRAPH}>{T.loading}</p>;
  if (!testers.length) return <p className={PARAGRAPH}>{T.none}</p>;
  const testerColumns: DataTableColumn<McpTester>[] = [
    { key: 'name', header: T.name, rowHeader: true, cell: t => <button type="button" className="font-semibold text-[var(--text-primary)] underline" aria-expanded={open === t.name} onClick={() => setOpen(open === t.name ? null : t.name)}>{t.name}</button> },
    { key: 'since', header: T.since, cell: t => when(t.created_at) },
    { key: 'calls', header: T.calls, cell: t => t.calls },
    { key: 'lastWeek', header: T.lastWeek, cell: t => t.calls_7d ?? MISSING_VALUE },
    { key: 'status', header: T.status, cell: t => (t.revoked_at ? T.revoked : T.active) },
  ];
  const callColumns: DataTableColumn<McpTesterCall>[] = [
    { key: 'when', header: T.when, cell: c => when(c.at) },
    { key: 'question', header: T.question, cell: c => c.question ?? T.noQuestion },
    { key: 'tool', header: T.tool, cell: c => <><code className="text-xs">{c.tool}</code>{Number(c.ok) ? '' : ` (${T.failed})`}</> },
  ];
  return (
    <>
      <p className={PARAGRAPH}>{T.intro}</p>
      <div className="mt-4"><DataTable variant="ruled" columns={testerColumns} rows={testers} rowKey={t => t.name} caption={T.heading} /></div>
      {open && (calls === null ? <p className={PARAGRAPH}>{T.loading}</p> : !calls.length ? <p className={PARAGRAPH}>{T.noCalls}</p> : (
        <div className="mt-6"><DataTable variant="ruled" columns={callColumns} rows={calls} rowKey={c => c.id} caption={open} /></div>
      ))}
    </>
  );
}

export default function McpDocsPage() {
  useEffect(() => { document.title = tabTitle(C.title); }, []);
  return (
    <DocsPageLayout contents={{ title: C.title, items: SECTIONS }}>
      <PageTitle>{C.title}</PageTitle>
      <p className={PARAGRAPH}>{C.intro}</p>

      <Section id="mcp-answers">
        <ul className={LIST}>{C.answers.items.map(item => <li key={item}>{item}</li>)}</ul>
        <p className={PARAGRAPH}>{C.answers.outside}</p>
      </Section>

      <Section id="mcp-tools">
        <p className={PARAGRAPH}>{C.tools.intro}</p>
        <div className="mt-4"><DataTable variant="ruled" columns={toolColumns} rows={TOOLS} rowKey={t => t.name} caption={C.tools.heading} /></div>
        <p className={PARAGRAPH}>{C.tools.liveNote}</p>
      </Section>

      <Section id="mcp-freshness">
        <ul className={LIST}>{C.freshness.items.map(item => <li key={item}>{item}</li>)}</ul>
        <p className={PARAGRAPH}>{C.freshness.version(SERVER_VERSION)}</p>
      </Section>

      <Section id="mcp-connect">
        <p className={PARAGRAPH}>{C.connect.code}</p>
        <CodeBlock text={CLAUDE_CODE} />
        <p className={PARAGRAPH}>{C.connect.desktop}</p>
        <CodeBlock text={CLAUDE_DESKTOP} />
        <p className={PARAGRAPH}>{C.connect.antigravity}</p>
        <CodeBlock text={ANTIGRAVITY} />
        <p className={PARAGRAPH}>{C.connect.hosted}</p>
      </Section>

      <Section id="mcp-testers">
        <Testers />
      </Section>
    </DocsPageLayout>
  );
}
