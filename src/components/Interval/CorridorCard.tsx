import { FLOATING_CARD, CARD_SECTION, PANEL_ENTER } from '../../styles';
import PanelHeader from '../ui/PanelHeader';
import { PERIOD_LABELS } from '../../hooks/useIntervalStats';
import { PERIOD_KEYS, type PeriodKey } from '../../../shared/config';
import { headwayToTierColor, type ColorVisionMode } from '../../utils/colors';
import { corridorPeriod, type CorridorDetail } from './map/useCorridorsLayer';
import type { TimePeriod } from '../../hooks/useIntervalStats';

/**
 * Corridors prototype card (CIV-1092, beta only). Every string here is a proposal that needs
 * Ryan's word-for-word OK before it leaves beta.
 */
export const CORRIDOR_TEXT = {
  title: 'Combined service',
  closeLabel: 'Close combined service',
  stretch: (from: string, to: string) => `${from} to ${to}`,
  explainer: 'How often a bus on any of these routes comes, from the timetable at these stops.',
  together: 'Together',
  period: 'Time',
  eachRoute: (periodLabel: string) => `Each route alone, ${periodLabel.toLowerCase()}`,
  none: '—',
};

const wait = (v: number | null | undefined) => (v == null ? CORRIDOR_TEXT.none : `${v} min`);

export default function CorridorCard({
  corridor, period, colorMode, onClose,
}: {
  corridor: CorridorDetail;
  period: TimePeriod;
  colorMode: ColorVisionMode;
  onClose: () => void;
}) {
  const shown = corridorPeriod(period);
  const rows = PERIOD_KEYS.filter((pk: PeriodKey) =>
    corridor.waits[pk] != null || corridor.routeNames.some(r => corridor.routeWaits[r]?.[pk] != null));
  return (
    <div
      role="dialog"
      aria-label={CORRIDOR_TEXT.title}
      className={`absolute z-40 left-3 right-3 bottom-20 max-h-[55vh] sm:left-auto sm:right-16 sm:bottom-16 sm:w-80 sm:max-h-[calc(100%-8rem)] ${FLOATING_CARD} ${PANEL_ENTER} flex flex-col overflow-hidden`}
    >
      <PanelHeader title={CORRIDOR_TEXT.title} onClose={onClose} closeLabel={CORRIDOR_TEXT.closeLabel} />
      <div className="px-5 py-3 flex flex-col gap-2 overflow-y-auto">
        {corridor.fromStop && corridor.toStop && (
          <p className="text-xs font-bold text-[var(--text-primary)]">{CORRIDOR_TEXT.stretch(corridor.fromStop, corridor.toStop)}</p>
        )}
        <p className="text-xs text-[var(--text-muted)]">{CORRIDOR_TEXT.explainer}</p>
        <table className="w-full text-xs mt-1">
          <thead>
            <tr className={CARD_SECTION}>
              <th className="text-left font-black py-1">{CORRIDOR_TEXT.period}</th>
              <th className="text-right font-black py-1">{CORRIDOR_TEXT.together}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(pk => (
              <tr key={pk} className={`border-t border-[var(--border-primary)] ${pk === shown ? 'font-black' : ''}`}>
                <td className="py-1 text-[var(--text-primary)]">{PERIOD_LABELS[pk]}</td>
                <td className="py-1 text-right whitespace-nowrap text-[var(--text-primary)]">
                  {corridor.waits[pk] != null && (
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: headwayToTierColor(corridor.waits[pk], colorMode) }} />
                  )}
                  {wait(corridor.waits[pk])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={`${CARD_SECTION} mt-1`}>{CORRIDOR_TEXT.eachRoute(PERIOD_LABELS[shown])}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {corridor.routeNames.map(r => (
            <div key={r} className="flex items-center justify-between text-xs">
              <span className="font-black text-[var(--text-primary)]">{r}</span>
              <span className="text-[var(--text-muted)] whitespace-nowrap">{wait(corridor.routeWaits[r]?.[shown])}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
