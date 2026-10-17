import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PERIOD_BAND_LABELS, periodBandsFor, type HourHover } from '../../utils/sparklinePeriods';

/** Width in px a band needs to name its period (12px text) at rest. */
export const bandLabelFits = (label: string, bandPx: number): boolean => bandPx >= label.length * 6.4 + 8;

/**
 * A thin shaded band under an hour chart's axis that names each time of day (AM peak, Midday...) where its name fits;
 * the hovered period is always named, even where it is too narrow to name at rest.
 * Hovering a period highlights it in every chart that shares `hover`; the hovered period is shaded darker.
 */
export default function PeriodBand({ axis, period, onHover, style }: { axis: readonly number[]; period: string | null; onHover: (h: HourHover | null) => void; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const bands = periodBandsFor(axis);
  return (
    <div ref={ref} aria-hidden="true" data-period-band className="relative mt-1 h-4 select-none" style={style} onPointerLeave={() => onHover(null)}>
      {Object.entries(bands).flatMap(([key, list]) => list.map((b, i) => {
        const label = PERIOD_BAND_LABELS[key];
        const fits = label != null && bandLabelFits(label, width * b.width);
        const on = period === key;
        return (
          <div
            key={`${key}-${i}`}
            data-period={key}
            title={label}
            className={`absolute bottom-0 top-0 flex items-center justify-center rounded-sm text-xs leading-none whitespace-nowrap ${on ? 'z-10 bg-[var(--border-primary)] font-bold text-[var(--text-primary)]' : 'bg-[var(--bg-btn-hover)] text-[var(--text-dim)]'}`}
            style={{ left: `calc(${b.left * 100}% + 0.5px)`, width: `calc(${b.width * 100}% - 1px)` }}
            onPointerEnter={() => onHover({ hour: null, period: key })}
            onPointerDown={() => onHover({ hour: null, period: key })}
          >{fits || on ? <span className={fits ? '' : 'rounded-sm bg-[var(--border-primary)] px-1'}>{label}</span> : null}</div>
        );
      }))}
    </div>
  );
}
