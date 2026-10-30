import DocsPageLayout from '../components/ui/DocsPageLayout';
import { PageTitle } from '../components/ui/PageTitle';
import ChartTableDetails from '../components/charts/ChartTableDetails';
import type { DataTableColumn } from '../components/ui/DataTable';
import { freeChildAgeBars, freeChildFareStats, freeChildOtherBars, type FreeChildFareBar } from '../data/freeChildFares';

const TABLE_COLUMNS: DataTableColumn<FreeChildFareBar>[] = [
  { key: 'group', header: 'Group', cell: bar => bar.label, rowHeader: true, className: 'font-normal', width: 12 },
  { key: 'agencies', header: 'Agencies', cell: bar => bar.agencies, className: 'tabular-nums', width: 6 },
];

// "Not found yet" is drawn hatched: no current official rule, not a policy.
const HATCHED = 'repeating-linear-gradient(135deg, var(--text-muted) 0 3px, transparent 3px 6px)';

function BarGroup({ title, bars, plain }: { title: string; bars: FreeChildFareBar[]; plain?: boolean }) {
  return (
    <div className="mt-8">
      <h3 className="text-xs font-black text-[var(--text-primary)]">{title}</h3>
      <ul className="mt-3 space-y-1.5">
        {bars.map(bar => (
          <li
            key={bar.label}
            title={`${bar.label}: ${bar.agencies} ${bar.agencies === 1 ? 'agency' : 'agencies'}`}
            className="grid cursor-default grid-cols-[7.5rem_1fr_2.25rem] items-center gap-2 rounded-lg py-0.5 text-sm hover:bg-[var(--bg-btn-hover)] sm:grid-cols-[9.5rem_1fr_2.5rem] sm:gap-3"
          >
            <span className={`${plain ? 'font-semibold' : 'font-black'} text-[var(--text-primary)]`}>{bar.label}</span>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-stat)]">
              <div
                className="h-full rounded-full"
                style={{ width: `${(bar.agencies / freeChildFareStats.maxBar) * 100}%`, background: bar.unknown ? HATCHED : 'var(--text-muted)' }}
              />
            </div>
            <span className="text-right tabular-nums text-[var(--text-muted)]">{bar.agencies}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FreeChildFaresPage() {
  return (
    <DocsPageLayout articleClassName="text-sm leading-relaxed text-[var(--text-dim)]">
      <header>
        <PageTitle className="text-[var(--text-primary)]">Free child fares</PageTitle>
      </header>
      <section aria-labelledby="free-child-fares-heading" className="rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)] p-5 text-[var(--text-primary)] sm:p-8">
        <div className="max-w-2xl">
          <h2 id="free-child-fares-heading" className="text-2xl sm:text-3xl font-black tracking-tight">Where kids ride free, age 5 is the most common cutoff.</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
            {freeChildFareStats.freeUpToAge} of {freeChildFareStats.agencies} agencies let children ride free up to a set age. Each bar counts the agencies whose free fare ends at that age.
          </p>
        </div>
        <BarGroup title="Free up to a set age" bars={freeChildAgeBars} />
        <BarGroup title="Other policies" bars={freeChildOtherBars} plain />
        <p className="mt-6 text-xs leading-5 text-[var(--text-dim)]">
          Each agency appears once, taken from its own fare page or fare bylaw and checked on October 11, 2026. Free fares up to 17 or 18 are usually youth programs. We couldn't find a current official rule for {freeChildFareStats.notFound} agencies.
        </p>
        <ChartTableDetails caption="Where kids ride free, age 5 is the most common cutoff." columns={TABLE_COLUMNS} rows={[...freeChildAgeBars, ...freeChildOtherBars]} rowKey={bar => bar.label} />
      </section>
    </DocsPageLayout>
  );
}
