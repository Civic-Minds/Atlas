import { useEffect } from 'react';
import DocsPageLayout from './components/ui/DocsPageLayout';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import Tag from './components/ui/Tag';
import { TOOLS, SERVER_VERSION } from '../scripts/mcp/toolDefs';
import { LIVE_TOOLS } from '../scripts/mcp/liveTools';
import { MCP_DOCS as C } from '../shared/mcpDocsCopy';
import { tabTitle } from '../shared/pageNames';

/**
 * CIV-1900: the internal docs page for the Atlas Studio MCP (dev server only, linked from /internal). The tool list is
 * read from the tool definitions the server sends Claude, so it can't drift; the words are in shared/mcpDocsCopy.ts.
 */

/** The local server's setup, as scripts/mcp/README.md gives it (paths in the main checkout). */
const CHECKOUT = '/Users/ryan/Developer/Code/Platforms/Atlas';
const NODE = '/opt/homebrew/bin/node';
const ARGS = [`${CHECKOUT}/node_modules/tsx/dist/cli.mjs`, `${CHECKOUT}/scripts/mcp/atlas-mcp.ts`];
const CLAUDE_CODE = `claude mcp add -s user atlas-studio -- ${NODE} ${ARGS.join(' ')}`;
const CLAUDE_DESKTOP = JSON.stringify({ mcpServers: { 'atlas-studio': { command: NODE, args: ARGS } } }, null, 2);

/** A tool's description up to its first full stop: the one line the table shows. */
const firstSentence = (text: string) => text.match(/^.*?[.?!](?=\s|$)/)?.[0] ?? text;

const SECTIONS = [
  { id: 'mcp-answers', label: C.answers.heading },
  { id: 'mcp-tools', label: C.tools.heading },
  { id: 'mcp-freshness', label: C.freshness.heading },
  { id: 'mcp-connect', label: C.connect.heading },
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
              <dd className="text-[var(--text-muted)]">{firstSentence(tool.description)}</dd>
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
    </DocsPageLayout>
  );
}
