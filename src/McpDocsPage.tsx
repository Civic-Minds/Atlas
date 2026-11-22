import { useEffect, useState } from 'react';
import { MCP_TESTERS_API_URL, type McpTester, type McpTesterCall } from '../shared/mcpTesters';
import DocsPageLayout from './components/ui/DocsPageLayout';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import Tag from './components/ui/Tag';
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
const CLAUDE_DESKTOP = JSON.stringify({ mcpServers: { 'atlas-studio': { command: NODE, args: ARGS } } }, null, 2);

const SECTIONS = [
  { id: 'mcp-answers', label: C.answers.heading },
  { id: 'mcp-tools', label: C.tools.heading },
  { id: 'mcp-freshness', label: C.freshness.heading },
  { id: 'mcp-connect', label: C.connect.heading },
  { id: 'mcp-testers', label: C.testers.heading },
] as const;

const PARAGRAPH = 'mt-4 text-sm leading-6 text-[var(--text-muted)]';
const LIST = 'mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--text-muted)]';
const CODE = 'mt-3 overflow-x-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-panel)] p-3 text-xs leading-5 text-[var(--text-primary)]';

function Section({ id, children }: { id: (typeof SECTIONS)[number]['id']; children: React.ReactNode }) {
  return (
    <section className="mt-12" aria-labelledby={id}>
      <SectionTitle id={id}>{SECTIONS.find(s => s.id === id)!.label}</SectionTitle>
      {children}
    </section>
  );
}

const T = C.testers;
const TABLE = 'mt-4 w-full text-left text-sm';
const TH = 'py-2 pr-4 font-semibold text-[var(--text-primary)]';
const TD = 'py-2 pr-4 align-top text-[var(--text-muted)]';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
  return (
    <>
      <p className={PARAGRAPH}>{T.intro}</p>
      <table className={TABLE}>
        <thead><tr><th className={TH}>{T.name}</th><th className={TH}>{T.since}</th><th className={TH}>{T.calls}</th><th className={TH}>{T.status}</th></tr></thead>
        <tbody>
          {testers.map(t => (
            <tr key={t.name}>
              <td className={TD}><button type="button" className="font-semibold text-[var(--text-primary)] underline" aria-expanded={open === t.name} onClick={() => setOpen(open === t.name ? null : t.name)}>{t.name}</button></td>
              <td className={TD}>{when(t.created_at)}</td>
              <td className={TD}>{t.calls}</td>
              <td className={TD}>{t.revoked_at ? T.revoked : T.active}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && (calls === null ? <p className={PARAGRAPH}>{T.loading}</p> : !calls.length ? <p className={PARAGRAPH}>{T.noCalls}</p> : (
        <table className={TABLE}>
          <thead><tr><th className={TH}>{T.when}</th><th className={TH}>{T.question}</th><th className={TH}>{T.tool}</th></tr></thead>
          <tbody>
            {calls.map(c => (
              <tr key={c.id}>
                <td className={TD}>{when(c.at)}</td>
                <td className={TD}>{c.question ?? T.noQuestion}</td>
                <td className={TD}><code className="text-xs">{c.tool}</code>{Number(c.ok) ? '' : ` (${T.failed})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
        <dl className="mt-4 space-y-4 text-sm leading-6">
          {TOOLS.map(tool => (
            <div key={tool.name}>
              <dt className="flex flex-wrap items-center gap-2 font-semibold text-[var(--text-primary)]">
                {tool.title}
                <code className="text-xs font-normal text-[var(--text-muted)]">{tool.name}</code>
                {LIVE_TOOLS.includes(tool.name) && <Tag size="inline">{C.tools.liveTag}</Tag>}
              </dt>
              <dd className="text-[var(--text-muted)]">{TOOL_SUMMARIES[tool.name]}</dd>
            </div>
          ))}
        </dl>
        <p className={PARAGRAPH}>{C.tools.liveNote}</p>
      </Section>

      <Section id="mcp-freshness">
        <ul className={LIST}>{C.freshness.items.map(item => <li key={item}>{item}</li>)}</ul>
        <p className={PARAGRAPH}>{C.freshness.version(SERVER_VERSION)}</p>
      </Section>

      <Section id="mcp-connect">
        <p className={PARAGRAPH}>{C.connect.code}</p>
        <pre className={CODE}><code>{CLAUDE_CODE}</code></pre>
        <p className={PARAGRAPH}>{C.connect.desktop}</p>
        <pre className={CODE}><code>{CLAUDE_DESKTOP}</code></pre>
        <p className={PARAGRAPH}>{C.connect.hosted}</p>
      </Section>

      <Section id="mcp-testers">
        <Testers />
      </Section>
    </DocsPageLayout>
  );
}
