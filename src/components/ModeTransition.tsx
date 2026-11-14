import { useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type * as maplibregl from 'maplibre-gl';
import { TRANSITION_SLOW } from '../styles';

/**
 * One shared transition for entering a mode or app (CIV-1567). Compare uses it first; Live, History and
 * Research are meant to reuse the same pieces once Ryan has signed off on Compare.
 *
 * - `useModeEntering` is true for the first frame a mode is on, so the mode's layout can start from where the
 *   previous screen was (a split at zero width, new controls transparent) and ease to its place with
 *   `MODE_EASE`, instead of snapping.
 * - `ModeEnter` holds a new view at full transparency, over a plain panel with the app's loading label,
 *   until the view says it is ready, then fades it in. The view stays mounted and laid out the whole time,
 *   so a map inside it measures its container and loads its tiles as usual.
 * - `useMapDrawn` is that ready signal for a map: true once the map has finished drawing.
 * - `useShownWhenDrawn` holds a label on its old value until the map it describes has redrawn,
 *   so the words and the lines change together.
 *
 * Every piece is a plain pass-through when `enabled` is false: no extra element, no delay.
 */

/** Longest a view stays covered: a stalled tile must never leave the cover up. */
export const MODE_ENTER_MAX_WAIT_MS = 4000;
/** Longest a label waits for its map to redraw. */
export const LABEL_MAX_WAIT_MS = 2000;

/** The one ease every mode entry uses: 300 ms out, none with reduced motion. Pair it with a `transition-[…]` property list. */
export const MODE_EASE = `${TRANSITION_SLOW} motion-reduce:transition-none`;

/** How long a mode's entry ease lasts, including the two starting frames (`MODE_EASE` is 300 ms). */
export const MODE_EASE_MS = 360;
/** A little longer than the fade, so the cover goes only once the view is fully opaque. */
const COVER_DROP_MS = 400;
const FADE = `transition-opacity ${MODE_EASE}`;

/**
 * True on the render where `active` turns on and for the frame after it, then false. Styling a mode's elements
 * from this ("collapsed / transparent while entering") lets their CSS transitions run from the old screen to the new.
 */
export function useModeEntering(active: boolean, enabled: boolean): boolean {
  const [seenActive, setSeenActive] = useState(active);
  const [entering, setEntering] = useState(false);
  if (seenActive !== active) {
    setSeenActive(active);
    setEntering(enabled && active);
  }
  useEffect(() => {
    if (!entering) return;
    // Two frames: the first paints the starting state, the second lets the transition run from it.
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setEntering(false)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [entering]);
  return enabled && entering;
}

/**
 * One pane of a split screen, for a mode that splits it (Compare). Off: a plain `className` div.
 * - `anchor="left"`: a new pane that grows in from zero width while entering. Its content is laid out at
 *   `width` (its finished width) from the first frame, so a map inside starts at its real size and is revealed.
 * - `anchor="center"`: the pane that was the whole screen. While the split eases (`easing`), its content keeps its
 *   old `width` centred in the narrowing pane, so a map inside glides instead of being resized every frame
 *   (each resize blanks a map's canvas for a frame); it resizes once when the ease ends, with the same centre.
 * For `anchor="center"` keep `enabled` steady (the beta switch, not "mode is on"): turning it changes the elements
 * around the content and would remount a map inside.
 */
export function ModeSplitPane({ enabled, anchor, entering, easing, width, className, overlay, children }: {
  enabled: boolean;
  anchor: 'left' | 'center';
  entering: boolean;
  easing: boolean;
  /** `left`: the pane's finished width; `center`: its width before the split. A CSS length. */
  width: string;
  className: string;
  /** Laid out against the pane itself rather than its content (a label that must sit in the pane's own corner). */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  if (!enabled) return <div className={className}>{children}{overlay}</div>;
  if (anchor === 'left') {
    return (
      <div className={`${className} overflow-hidden transition-[flex-grow] ${MODE_EASE}`} style={{ flexGrow: entering ? 0 : 1 }} data-mode-enter="pane">
        <div className="absolute inset-y-0 left-0" style={{ width }}>{children}</div>
        {overlay}
      </div>
    );
  }
  return (
    <div className={`${className} ${easing ? 'overflow-hidden' : ''}`} data-mode-enter="pane">
      <div
        className="absolute inset-y-0"
        style={easing ? { left: '50%', width, transform: 'translateX(-50%)' } : { left: 0, right: 0 }}
      >
        {children}
      </div>
      {overlay}
    </div>
  );
}

/** Classes that fade a mode's new controls in: transparent with no transition while entering, then eased in. */
export function modeFadeIn(enabled: boolean, entering: boolean): string {
  if (!enabled) return '';
  return entering ? 'opacity-0 transition-none' : `opacity-100 transition-opacity ${MODE_EASE}`;
}

/** True from the render where `active` turns on until the entry ease has finished. */
export function useModeEasing(active: boolean, enabled: boolean): boolean {
  const [seenActive, setSeenActive] = useState(active);
  const [easing, setEasing] = useState(false);
  if (seenActive !== active) {
    setSeenActive(active);
    setEasing(enabled && active);
  }
  useEffect(() => {
    if (!easing) return;
    const timer = window.setTimeout(() => setEasing(false), MODE_EASE_MS);
    return () => window.clearTimeout(timer);
  }, [easing]);
  return enabled && easing;
}

export function ModeEnter({ enabled, ready, label, children }: {
  enabled: boolean;
  /** The view has drawn and can be shown. */
  ready: boolean;
  /** The loading words shown in the view's place until it is ready, in the app's loading label. */
  label: string;
  children: ReactNode;
}) {
  const [timedOut, setTimedOut] = useState(false);
  const [coverGone, setCoverGone] = useState(false);
  const shown = ready || timedOut;
  useEffect(() => {
    if (!enabled || shown) return;
    const timer = window.setTimeout(() => setTimedOut(true), MODE_ENTER_MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, shown]);
  // The cover stays fully drawn under the view while it fades in (fading both would let the divider colour show
  // through halfway), and is dropped once the fade has finished. Its loading label goes before the fade starts,
  // so it never shows through the half-faded map.
  useEffect(() => {
    if (!enabled || !shown) return;
    const timer = window.setTimeout(() => setCoverGone(true), COVER_DROP_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, shown]);
  if (!enabled) return <>{children}</>;
  return (
    <>
      {!coverGone && (
        <div className="absolute inset-0 bg-[var(--bg-app)] flex items-center justify-center pointer-events-none" aria-hidden={shown} data-mode-enter="cover">
          {!shown && (
            <div className="rounded-full bg-[var(--bg-panel)]/90 px-3 py-1.5 text-xs font-semibold text-[var(--text-dim)]">{label}</div>
          )}
        </div>
      )}
      <div className={`absolute inset-0 ${FADE} ${shown ? 'opacity-100' : 'opacity-0'}`} data-mode-enter={shown ? 'shown' : 'waiting'}>
        {children}
      </div>
    </>
  );
}

type IdleMap = Pick<maplibregl.Map, 'on' | 'once' | 'off' | 'triggerRepaint' | 'areTilesLoaded'>;

/**
 * Runs `done` once the map has drawn everything it is loading, or after `maxWaitMs`, whichever comes first.
 * `untilIdle` waits for MapLibre's `idle`. Otherwise `done` runs inside the `render` event of the frame that drew
 * the last reloaded tile (idle comes one frame later), so whatever `done` commits is painted with that frame.
 */
function onNextFullDraw(map: IdleMap, maxWaitMs: number, untilIdle: boolean, done: () => void): () => void {
  let finished = false;
  const stop = () => {
    finished = true;
    window.clearTimeout(timer);
    map.off('idle', finish);
    map.off('render', onRender);
  };
  function finish() {
    if (finished) return;
    stop();
    done();
  }
  function onRender() {
    if (map.areTilesLoaded()) finish();
  }
  const timer = window.setTimeout(finish, maxWaitMs);
  map.once('idle', finish);
  if (!untilIdle) map.on('render', onRender);
  // An unchanged map would never draw again; a repaint makes sure it does.
  map.triggerRepaint();
  return stop;
}

/** True once `map` has finished its first full draw. False again for a new map. */
export function useMapDrawn(map: IdleMap | null, enabled: boolean): boolean {
  const [drawnMap, setDrawnMap] = useState<IdleMap | null>(null);
  useEffect(() => {
    if (!enabled || !map) return;
    // A new map's first frames can report no tiles before its route source has asked for any, so wait for idle.
    return onNextFullDraw(map, MODE_ENTER_MAX_WAIT_MS, true, () => setDrawnMap(map));
  }, [map, enabled]);
  return !enabled || (map != null && drawnMap === map);
}

/**
 * The value a map's label should show: `value` once `map` has redrawn after it changed, the previous value until then.
 * Call it in the component that owns the settings, so the map's own effects have applied the change before this waits.
 */
export function useShownWhenDrawn<T>(value: T, map: IdleMap | null, enabled: boolean): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (!enabled || !map) { setShown(value); return; }
    // flushSync commits the label inside the map's render event, not in a later task, so the new words
    // are painted in the same frame as the redrawn routes.
    return onNextFullDraw(map, LABEL_MAX_WAIT_MS, false, () => flushSync(() => setShown(value)));
  }, [value, map, enabled]);
  return enabled && map ? shown : value;
}
