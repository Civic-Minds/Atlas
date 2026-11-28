import { useEffect, useState } from 'react';
import { MISSING_VALUE } from '../../shared/missingValue';
import { dateTimeText } from '../../shared/dateText';
import { MCP_TESTERS_API_URL, MCP_TESTERS_CHANGE_HEADER, MCP_USAGE_DAY_CHOICES, MCP_USAGE_DAYS_DEFAULT, type McpUsageDayChoice, type McpTester, type McpTesterCall, type McpUsageResponse } from '../../shared/mcpTesters';
import LineChart from '../components/charts/LineChart';
import PillGroup from '../components/ui/PillGroup';
import { STORY_CHART_PANEL } from './pageStyles';
import { countText } from '../../shared/numberText';
import { dateRange } from '../../shared/dateText';
import DocsPageLayout from '../components/ui/DocsPageLayout';
import { PAGE_LEAD } from '../components/ui/PageSection';
import { PageTitle, SectionTitle } from '../components/ui/PageTitle';
import Tag from '../components/ui/Tag';
import CopyButton from '../components/ui/CopyButton';
import DataTable, { type DataTableColumn } from '../components/ui/DataTable';
import { TOOLS, TOOL_SUMMARIES, SERVER_VERSION } from '../../scripts/mcp/toolDefs';
import { LIVE_TOOLS } from '../../scripts/mcp/liveTools';
import { MCP_DOCS as C } from '../../shared/mcpDocsCopy';
import { TOOL_GROUPS, type ToolGroup } from '../../shared/mcpToolGroups';
import { tabTitle } from '../../shared/pageNames';

/**
 * CIV-1900: the internal docs page for the Atlas Studio MCP (dev server only, linked from /internal). The tool list is
 * read from the tool definitions the server sends Claude, each with its plain summary (TOOL_SUMMARIES), so it can't drift; the words are in shared/mcpDocsCopy.ts.
 */

/** A command or config block to paste elsewhere, with the shared copy button (CIV-2117). Long commands wrap onto more
 * lines (Ryan, 2026-11-22: "should the text wrap"), so the copy button stays in view instead of sitting past a scroll. */
function CodeBlock({ text }: { text: string }) {
  return (
    <div className="relative mt-3">
      <pre className={`${CODE} whitespace-pre-wrap break-all pr-20`}><code>{text}</code></pre>
      <CopyButton text={text} className="absolute right-2 top-2" />
    </div>
  );
}

// The "On this page" menu names each section in one word (Ryan, 2026-11-22); the section keeps its full heading.
const SECTIONS = [
  { id: 'mcp-answers', label: C.contents.answers, heading: C.answers.heading },
  { id: 'mcp-tools', label: C.contents.tools, heading: C.tools.heading },
  { id: 'mcp-freshness', label: C.contents.freshness, heading: C.freshness.heading },
  { id: 'mcp-connect', label: C.contents.connect, heading: C.connect.heading },
  { id: 'mcp-testers', label: C.contents.testers, heading: C.testers.heading },
  { id: 'mcp-usage', label: C.contents.usage, heading: C.usage.heading },
] as const;

// #1671: the same lead style as the other internal pages.
const PARAGRAPH = PAGE_LEAD;
// Ryan, 2026-11-22: the testers table's headers and cells all start on their top line (a wrapped header's second line
// hangs below), so a two-line figure doesn't leave the names floating mid-row.
const TESTERS_TABLE = 'mt-4 [&_thead_th]:align-top [&_tbody_td]:align-top [&_tbody_th]:align-top';
const LIST = 'mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--text-muted)]';
const CODE = 'overflow-x-auto rounded-lg border border-[var(--border-primary)] bg-[var(--bg-panel)] p-3 text-xs leading-5 text-[var(--text-primary)]';

function Section({ id, children }: { id: (typeof SECTIONS)[number]['id']; children: React.ReactNode }) {
  return (
    <section className="mt-12" aria-labelledby={id}>
      <SectionTitle id={id}>{SECTIONS.find(s => s.id === id)!.heading}</SectionTitle>
      {children}
    </section>
  );
}

type ToolRow = (typeof TOOLS)[number];
const GROUP_ORDER = Object.keys(TOOL_GROUPS) as ToolGroup[];
const groupOf = (name: string) => GROUP_ORDER.find(g => TOOL_GROUPS[g].includes(name));
/** The tools in group order (each group in its listed order); a tool with no group goes last, so none is ever dropped. */
const GROUPED_TOOLS: readonly ToolRow[] = [
  ...GROUP_ORDER.flatMap(g => TOOL_GROUPS[g].map(name => TOOLS.find(t => t.name === name)).filter((t): t is ToolRow => !!t)),
  ...TOOLS.filter(t => !groupOf(t.name)),
];
/** A group's label sits above its first tool. */
const toolGroupLabel = (t: ToolRow) => {
  const g = groupOf(t.name);
  return g && TOOL_GROUPS[g].find(name => TOOLS.some(x => x.name === name)) === t.name ? C.tools.groups[g] : null;
};
/** The Tools table (Ryan, 2026-11-22: "In the MCP page should the Tools section be a table instead", picked 1). */
const toolColumns: DataTableColumn<ToolRow>[] = [
  { key: 'tool', header: C.tools.name, rowHeader: true, cell: t => <span className="font-semibold text-[var(--text-primary)]">{t.title} <code className="text-xs font-normal text-[var(--text-muted)]">{t.name}</code></span> },
  { key: 'answers', header: C.tools.answers, cell: t => TOOL_SUMMARIES[t.name] },
  { key: 'live', header: C.tools.live, cell: t => (LIVE_TOOLS.includes(t.name) ? <Tag size="inline">{C.tools.liveTag}</Tag> : null) },
];

const T = C.testers;
const when = (iso: string) => dateTimeText(iso) ?? MISSING_VALUE;

/** The hosted pilot's testers and each one's latest calls, read through the local API (local-api/mcp-testers.ts). */
/** CIV-2202: makes (`make`) or stops (`stop`) a tester's link through the local API; the admin token stays on the Mac. */
async function changeTester(what: 'make' | 'stop', name: string): Promise<{ ok: boolean; link?: string; error?: string | null }> {
  try {
    const res = await fetch(`${MCP_TESTERS_API_URL}?${what}=${encodeURIComponent(name)}`, { method: 'POST', headers: { [MCP_TESTERS_CHANGE_HEADER]: '1' } });
    const body = await res.json() as { link?: string; revoked?: boolean; error?: string | null };
    return { ok: res.ok && (what === 'make' ? !!body.link : body.revoked === true), link: body.link, error: body.error };
  } catch { return { ok: false }; }
}

const FIELD = 'min-w-0 flex-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)]';
const ACTION = 'rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50';

/** CIV-2202: a name and "Make link"; the new link shows once, with the copy button, and is kept nowhere. */
function NewLink({ onMade }: { onMade: () => void }) {
  const N = T.newLink;
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ name: string; link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const make = async () => {
    const who = name.trim();
    if (!who) return;
    setBusy(true); setError(null); setMade(null);
    const r = await changeTester('make', who);
    setBusy(false);
    if (r.ok && r.link) { setMade({ name: who, link: r.link }); setName(''); onMade(); } else setError(r.error || N.failed);
  };
  // CIV-2944 (Ryan, 2026-11-27, picked 1: "A 'New link' button under the table, with the form opening in place"):
  // the form no longer sits open under the table.
  if (!formOpen) return <button type="button" className={`${ACTION} mt-4`} onClick={() => setFormOpen(true)}>{N.heading}</button>;
  return (
    <div className="mt-4">
      <form className="flex max-w-md items-center gap-2" onSubmit={e => { e.preventDefault(); void make(); }}>
        <input type="text" value={name} onChange={e => setName(e.target.value)} aria-label={N.name} placeholder={N.name} maxLength={60} className={FIELD} autoFocus />
        <button type="submit" className={ACTION} disabled={busy || !name.trim()}>{N.make}</button>
      </form>
      {error && <p className={PARAGRAPH} role="alert">{error}</p>}
      {made && (
        <>
          <p className={PARAGRAPH}>{N.shownOnce(made.name)}</p>
          <CodeBlock text={made.link} />
        </>
      )}
    </div>
  );
}

function Testers() {
  const [testers, setTesters] = useState<McpTester[] | null | 'unavailable'>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [calls, setCalls] = useState<McpTesterCall[] | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [stopError, setStopError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    fetch(MCP_TESTERS_API_URL).then(r => r.json()).then(d => setTesters(d.available ? d.testers : 'unavailable')).catch(() => setTesters('unavailable'));
  }, [reload]);
  const stop = async (name: string) => {
    if (!window.confirm(T.confirmStop(name))) return;
    setStopping(name); setStopError(false);
    const r = await changeTester('stop', name);
    setStopping(null);
    if (r.ok) setReload(n => n + 1); else setStopError(true);
  };
  useEffect(() => {
    if (!open) return;
    setCalls(null);
    fetch(`${MCP_TESTERS_API_URL}?name=${encodeURIComponent(open)}`).then(r => r.json()).then(d => setCalls(d.available ? d.calls : [])).catch(() => setCalls([]));
  }, [open]);
  if (testers === 'unavailable') return <p className={PARAGRAPH}>{T.unavailable}</p>;
  if (testers === null) return <p className={PARAGRAPH}>{T.loading}</p>;
  if (!testers.length) return <><p className={PARAGRAPH}>{T.none}</p><NewLink onMade={() => setReload(n => n + 1)} /></>;
  const testerColumns: DataTableColumn<McpTester>[] = [
    { key: 'name', header: T.name, rowHeader: true, cell: t => <button type="button" className="whitespace-nowrap text-left font-semibold text-[var(--text-primary)] underline" aria-expanded={open === t.name} onClick={() => setOpen(open === t.name ? null : t.name)}>{t.name}</button> },
    { key: 'since', header: T.since, cell: t => when(t.created_at) },
    { key: 'calls', header: T.calls, cell: t => t.calls },
    { key: 'lastWeek', header: T.lastWeek, cell: t => t.calls_7d ?? MISSING_VALUE },
    { key: 'questions', header: T.questions, cell: t => t.questions ?? MISSING_VALUE },
    { key: 'questionsLastWeek', header: T.questionsLastWeek, cell: t => t.questions_7d ?? MISSING_VALUE },
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
      <div className={TESTERS_TABLE}>
        <DataTable variant="ruled" columns={testerColumns} rows={testers} rowKey={t => t.name} caption={T.heading}
          // A tester's latest questions open right under their row (Ryan, 2026-11-22), not under the table.
          rowDetail={t => (t.name !== open ? null : (
            <>
              {calls === null ? <p className={PARAGRAPH}>{T.loading}</p> : !calls.length ? <p className={PARAGRAPH}>{T.noCalls}</p> : (
                <DataTable variant="ruled" columns={callColumns} rows={calls} rowKey={c => c.id} caption={open} />
              )}
              {/* CIV-2944: Stop link sits in the tester's own view, not beside every row. */}
              {!t.revoked_at && <button type="button" className={`${ACTION} mt-3 whitespace-nowrap`} disabled={stopping != null} onClick={() => void stop(t.name)}>{T.stop}</button>}
            </>
          ))} />
      </div>
      {stopError && <p className={PARAGRAPH} role="alert">{T.stopFailed}</p>}
      <NewLink onMade={() => setReload(n => n + 1)} />
    </>
  );
}

const U = C.usage;

/** Questions per day, all testers together, read through the local API (`?usage`), at the bottom of the page. */
function Usage() {
  const [usage, setUsage] = useState<McpUsageResponse | null>(null);
  const [days, setDays] = useState<McpUsageDayChoice>(MCP_USAGE_DAYS_DEFAULT);
  useEffect(() => {
    fetch(`${MCP_TESTERS_API_URL}?usage=1`).then(r => r.json() as Promise<McpUsageResponse>).then(setUsage).catch(() => setUsage({ available: false }));
  }, []);
  if (usage == null) return <p className={PARAGRAPH}>{T.loading}</p>;
  if (!usage.available) return <p className={PARAGRAPH}>{T.unavailable}</p>;
  if (!usage.days.length) return <p className={PARAGRAPH}>{U.none}</p>;
  const shown = usage.days.slice(-days);
  return (
    <>
      <p className={PARAGRAPH}>{U.intro(days)}</p>
      <div className="mt-4 flex">
        <PillGroup outlined label={U.daysLabel} value={days} onChange={setDays} options={MCP_USAGE_DAY_CHOICES.map(d => [d, U.days(d)] as const)} />
      </div>
      <div className={`mt-4 ${STORY_CHART_PANEL} p-5 sm:p-8`}>
        <LineChart
          label={U.chartLabel(days)}
          yTitle={U.axis}
          yMin={0}
          formatY={countText}
          height={200}
          name={T.questions}
          second={{ name: T.calls, values: shown.map(d => d.calls) }}
          points={shown.map((d, i) => ({ x: i, y: d.questions, label: dateRange(d.date, d.date), sentence: U.day(countText(d.questions), countText(d.calls)) }))}
          xTickLabels={(_p, i) => shown.length <= 7 || i % 7 === 0}
        />
      </div>
      {!usage.complete && <p className={PARAGRAPH}>{U.partial}</p>}
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
        <div className="mt-4"><DataTable variant="ruled" columns={toolColumns} rows={GROUPED_TOOLS} rowKey={t => t.name} caption={C.tools.heading} rowGroupLabel={toolGroupLabel} /></div>
        <p className={PARAGRAPH}>{C.tools.liveNote}</p>
      </Section>

      <Section id="mcp-freshness">
        <ul className={LIST}>{C.freshness.items.map(item => <li key={item}>{item}</li>)}</ul>
        <p className={PARAGRAPH}>{C.freshness.version(SERVER_VERSION)}</p>
      </Section>

      <Section id="mcp-connect">
        <p className={PARAGRAPH}>{C.connect.hosted}</p>
        <p className={PARAGRAPH}>{C.connect.hostedCode}</p>
        <CodeBlock text={`claude mcp add --transport http atlas-studio ${C.connect.hostedLink}`} />
      </Section>

      <Section id="mcp-testers">
        <Testers />
      </Section>

      <Section id="mcp-usage">
        <Usage />
      </Section>
    </DocsPageLayout>
  );
}
