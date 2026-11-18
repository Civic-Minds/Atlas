import { useEffect, useState, type ReactNode } from 'react';
import { MapAttribution } from '../Interval/MapAttribution';
import { MAP_BADGE, MAP_FOOTER_ROW_SLOT, MAP_NOTICE_SLOT, Z_PANEL } from '../../styles';
import { MAP_OVERLAY_VARS, publishMapOverlayVar } from '../../mapOverlayLayout';

/** The gap kept between the footer and what the map frames above it: the overlay's inset plus a gap. */
const FRAME_GAP = 12 + 12;

/**
 * Padding for framing the map above the footer: its measured height and FRAME_GAP, never less than the layout's own bottom.
 */
export function framePadding<P extends { bottom: number }>(pad: P, footerHeight: number): P {
  return { ...pad, bottom: Math.max(pad.bottom, footerHeight ? footerHeight + FRAME_GAP : 0) };
}

/**
 * The bottom of the map, as the regular map has it (CIV-1821: Ryan, "why the fuck are we doing things differently
 * here"): the regular map's footer row (MAP_FOOTER_ROW_SLOT) with its own pills, the About, What's new and Feedback
 * links and the basemap credit (MapAttribution), and an optional note in the regular map's notice slot above it. It
 * publishes the row's height (--map-footer-h) as the regular map does, so the key and the sidebar stop above it, and
 * reports it (onHeight) so the map frames what it draws above it.
 */
export function MapAppFooter({ note, onHeight }: { note?: ReactNode; onHeight?: (px: number) => void }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const read = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      onHeight?.(h);
      publishMapOverlayVar(MAP_OVERLAY_VARS.footerHeight, h ? `${h}px` : null);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { ro.disconnect(); publishMapOverlayVar(MAP_OVERLAY_VARS.footerHeight, null); };
  }, [el]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {note && (
        <div data-map-overlay="notice" className={`${MAP_NOTICE_SLOT} ${Z_PANEL} pointer-events-none`}>
          <p className={`${MAP_BADGE} m-0 min-h-8 px-3 py-1.5 text-xs text-[var(--text-muted)]`}>{note}</p>
        </div>
      )}
      <div ref={setEl} className={MAP_FOOTER_ROW_SLOT}><MapAttribution /></div>
    </>
  );
}
