import type { ReactNode } from 'react';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import Pill from '../../components/ui/Pill';
import { PickerSection } from '../../components/Interval/pickers';
import { chipRowClass } from '../../components/Interval/ChipMenu';
import { LAST_WEEK_COLUMN, THIS_WEEK_COLUMN } from '../../content/noticeCopy';
import { MISSING_VALUE } from '../../../shared/missingValue';
import { percentText } from '../../../shared/numberText';
import { weekForBand, type DashboardBand, type LiveV3 } from '../../../shared/liveDashboard';
import { DEFAULT_CUTOFFS, cutoffFactorText, cutoffMinutesText, figuresAtCutoffs, type CustomFigure, type Cutoffs } from '../../../shared/liveCutoffs';
import { STUDIO_SETTINGS_TEXT as S } from '../../../shared/liveWording';
import type { StudioMenu } from './StudioChips';

/**
 * Planners' own cut-offs in Studio's Live view (CIV-1886, the Studio half of CIV-1869): a Settings chip in the top bar (the chip and its rows in Ryan's approved words, STUDIO_SETTINGS_TEXT)
 * and, in a picked route's card, the week's figures at those cut-offs beside the standard week table. The calculation is
 * the MCP's own (shared/liveCutoffs.ts figuresAtCutoffs); rankings and the standard figures stay on the standard cut-offs.
 */

/** The cut-offs a planner has set: only the ones they changed. Kept while Studio is open, across routes. */
export type SetCutoffs = Partial<Cutoffs>;

/** The choices in the chip's dropdown (settled by the manager, 2026-11-18). Each sits on the steps the counts are kept in. */
export const STUDIO_CUTOFF_PRESETS: Record<keyof Cutoffs, readonly number[]> = {
  lateAfterMin: [1, 2, 3, 4, 5, 5.5, 7, 10],
  earlyBeforeMin: [0.5, 1, 1.5, 2, 3],
  bunchedWithinMin: [1, 1.5, 2, 3, 4, 5],
  gappedFactor: [1.5, 2, 2.5, 3],
};
const ORDER: ReadonlyArray<keyof Cutoffs> = ['lateAfterMin', 'earlyBeforeMin', 'bunchedWithinMin', 'gappedFactor'];
const FIGURE_KEY = { lateAfterMin: 'late', earlyBeforeMin: 'early', bunchedWithinMin: 'bunched', gappedFactor: 'gapped' } as const;

/** The card's wording, pending Ryan's word-for-word OK (CIV-1886 wording list); the chip and its rows are approved (STUDIO_SETTINGS_TEXT). */
export const STUDIO_CUTOFFS_PENDING = {
  reset: 'Use the standard cut-offs',
  title: 'Your cut-offs',
  figure: (k: keyof Cutoffs, v: number) => ({
    lateAfterMin: `Late, more than ${cutoffMinutesText(v)}`,
    earlyBeforeMin: `Early, ${cutoffMinutesText(v)} or more ahead`,
    bunchedWithinMin: `Bunched, gap under ${cutoffMinutesText(v)}`,
    gappedFactor: `Gapped, gap over ${cutoffFactorText(v)} scheduled`,
  })[k],
  standardNote: 'The figures above and every ranking use the standard cut-offs.',
  bothNote: 'At your own cut-offs a gap can count as both bunched and gapped, so there is no combined Bunching figure.',
  noCounts: 'No figure at this cut-off yet for this route.',
} as const;
const W = STUDIO_CUTOFFS_PENDING;

/** A choice as its number alone, in the cut-offs' own half steps ("5½", "1½"); the row's unit follows the numbers. */
const settingNumber = (v: number): string => { const w = Math.floor(v); return v - w === 0.5 ? `${w || ''}½` : String(v); };

const isSet = (set: SetCutoffs) => ORDER.some(k => set[k] != null);

/** The chip's menu: four rows of choices and a way back to the standard. Its chip is filled while any cut-off is set. */
export function cutoffsMenu(set: SetCutoffs, onChange: (next: SetCutoffs) => void): StudioMenu {
  const content = (close: () => void): ReactNode => (
    <div className="flex flex-col gap-3">
      {ORDER.map(k => {
        const current = set[k] ?? DEFAULT_CUTOFFS[k];
        return (
          // The main map's Settings rows (PickerSection over segment pills, CIV-1925 phase 3), not a look of Studio's own.
          <div key={k} role="group" aria-label={S.rows[k]}>
            <PickerSection title={S.rows[k]}>
              {/* Ryan's approved rows (CIV-1893, "Sure for now"): numbers in a row, the unit once after them, the standard in bold. */}
              <div className="flex flex-wrap items-center gap-1">
                {STUDIO_CUTOFF_PRESETS[k].map(v => (
                  <Pill key={v} size="segment" selected={v === current}
                    onClick={() => onChange({ ...set, [k]: v === DEFAULT_CUTOFFS[k] ? undefined : v })}>
                    <span className={v === DEFAULT_CUTOFFS[k] ? 'font-black' : undefined}>{settingNumber(v)}</span>
                  </Pill>
                ))}
                <span className="ml-1 text-xs text-[var(--text-muted)]">{S.units[k]}</span>
              </div>
            </PickerSection>
          </div>
        );
      })}
      {isSet(set) && <button type="button" className={chipRowClass(false)} onClick={() => { onChange({}); close(); }}>{W.reset}</button>}
    </div>
  );
  return { key: 'cutoffs', label: S.chip, value: '', options: [], onPick: () => {}, content, active: isSet(set), panelClassName: 'w-80' };
}

interface Row { key: keyof Cutoffs; label: string; now: CustomFigure | undefined; last: CustomFigure | undefined }

/** The week's figures at the set cut-offs, for a picked route's card: nothing while every cut-off is the standard. */
export function CutoffFigures({ v3, band, set }: { v3: LiveV3; band: DashboardBand; set: SetCutoffs }) {
  const custom = ORDER.filter(k => set[k] != null);
  const week = weekForBand(v3.weekly, band);
  if (!custom.length || !week) return null;
  const cut: Cutoffs = { ...DEFAULT_CUTOFFS, ...Object.fromEntries(custom.map(k => [k, set[k]])) };
  const now = figuresAtCutoffs(week.thisWeek.cutoffCounts, cut, custom);
  const last = figuresAtCutoffs(week.lastWeek.cutoffCounts, cut, custom);
  const rows: Row[] = custom.map(k => ({ key: k, label: W.figure(k, cut[k]), now: now[FIGURE_KEY[k]], last: last[FIGURE_KEY[k]] }));
  const value = (f: CustomFigure | undefined) => (f?.share != null ? percentText(f.share) : MISSING_VALUE);
  const noCounts = rows.some(r => r.now?.note);
  const notes = [W.standardNote, ...(set.bunchedWithinMin != null || set.gappedFactor != null ? [W.bothNote] : []), ...(noCounts ? [W.noCounts] : [])];
  return (
    <Card as="section" tone="surface" aria-label={W.title} className="min-w-0 px-2.5 py-1.5">
      <DataTable
        caption={W.title}
        rows={rows}
        rowKey={r => r.key}
        columns={[
          { key: 'measure', header: <span className="font-bold text-[var(--text-primary)]">{W.title}</span>, rowHeader: true, className: 'font-bold text-[var(--text-muted)]', cell: r => r.label },
          { key: 'now', header: <span className="block text-right font-normal text-[var(--text-dim)]">{THIS_WEEK_COLUMN}</span>, className: 'text-right text-sm font-black tracking-tight', cell: r => value(r.now) },
          { key: 'last', header: <span className="block text-right font-normal text-[var(--text-dim)]">{LAST_WEEK_COLUMN}</span>, className: 'text-right text-sm text-[var(--text-muted)]', cell: r => value(r.last) },
        ]}
      />
      <ul className="m-0 mt-1 list-none border-t border-[var(--border-primary)] p-0 pt-1 text-pretty">
        {notes.map(n => <li key={n} className="text-xs leading-4 text-[var(--text-dim)] opacity-75">{n}</li>)}
      </ul>
    </Card>
  );
}
