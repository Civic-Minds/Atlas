import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { FLOATING_CARD, Z_PANEL } from '../../styles';

/**
 * The phone bottom sheet a route or stop card opens in (the map's route card and History's route
 * view, #1028 item 23): short at first so the map stays visible, dragged or tapped up to read it all.
 */
export const BOTTOM_SHEET_FRAME = `fixed inset-x-0 bottom-0 ${Z_PANEL} flex flex-col transition-[opacity,transform] duration-200 ease-out`;

/** The sheet frame with its open or closed state: it fades and slides up 16px as it opens, and back down as it closes. */
export function bottomSheetFrameClass(visible: boolean): string {
  return `${BOTTOM_SHEET_FRAME} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`;
}

/** The sheet's scrolling body; `collapsedHeight` is the short state's height class. */
export function bottomSheetBodyClass(expanded: boolean, collapsedHeight = 'h-[42dvh]'): string {
  return `relative ${FLOATING_CARD} rounded-b-none px-4 pt-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] overflow-y-auto overflow-x-hidden overscroll-contain transition-[height] duration-200 ease-out ${expanded ? 'h-[calc(100dvh-76px)]' : collapsedHeight}`;
}

/** Expanded state and the handle's pointer handlers; the sheet closes back to short when `subject` changes. */
export function useBottomSheet(subject: unknown) {
  const [expanded, setExpanded] = useState(false);
  const dragStart = useRef<number | null>(null);
  useEffect(() => {
    setExpanded(false);
  }, [subject]);
  const onPointerDown = (event: PointerEvent) => {
    dragStart.current = event.clientY;
    // Keep receiving the pointer after the finger leaves the handle mid-drag.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (start == null) return;
    const moved = event.clientY - start;
    if (Math.abs(moved) < 8) setExpanded(value => !value);
    else setExpanded(moved < 0);
  };
  const onPointerCancel = () => { dragStart.current = null; };
  return { expanded, handle: { onPointerDown, onPointerUp, onPointerCancel } };
}

/** The grab handle at the top of the sheet. */
export function BottomSheetHandle({ expanded, handle }: { expanded: boolean; handle: ReturnType<typeof useBottomSheet>['handle'] }) {
  return (
    <button
      type="button"
      aria-label={expanded ? 'Show less' : 'Show more'}
      aria-expanded={expanded}
      onPointerDown={handle.onPointerDown}
      onPointerUp={handle.onPointerUp}
      onPointerCancel={handle.onPointerCancel}
      className="sticky top-0 z-10 -mx-4 mb-1 flex w-[calc(100%+2rem)] touch-none justify-center bg-[var(--bg-panel)] pt-2.5 pb-2"
    >
      <span className="h-1 w-10 rounded-full bg-[var(--border-primary)]" />
    </button>
  );
}
