import { useEffect, useState, type ReactNode } from 'react';
import { BasemapCredit } from '../BasemapCredit';
import { MAP_BADGE } from '../../styles';

/** The gap kept between the footer and what the map frames above it: the overlay's inset plus a gap. */
const FRAME_GAP = 12 + 12;

/**
 * Padding for framing the map above the footer: its measured height and FRAME_GAP, never less than the layout's own bottom.
 */
export function framePadding<P extends { bottom: number }>(pad: P, footerHeight: number): P {
  return { ...pad, bottom: Math.max(pad.bottom, footerHeight ? footerHeight + FRAME_GAP : 0) };
}

/**
 * The bottom of the map: an optional note, then the legend's row of pills, then the basemap's credit in the regular
 * map's footer pill. It reports its height (onHeight) so the map frames what it draws above it.
 */
export function MapAppFooter({ note, legend, onHeight }: { note?: ReactNode; legend?: ReactNode; onHeight?: (px: number) => void }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!el || !onHeight) return;
    const read = () => onHeight(Math.ceil(el.getBoundingClientRect().height));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={setEl} className="pointer-events-none absolute bottom-0 left-0 right-12 flex flex-col items-end gap-2 max-sm:right-0">
      {note && <p className="m-0 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-header)] px-3 py-1.5 text-xs text-[var(--text-muted)]">{note}</p>}
      {legend}
      <div className={`${MAP_BADGE} pointer-events-auto h-8`}><BasemapCredit /></div>
    </div>
  );
}
