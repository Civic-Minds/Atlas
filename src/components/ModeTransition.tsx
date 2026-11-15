import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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

/**
 * How long to hold a mode's eased state after its starting frames, so the 300 ms `MODE_EASE` has finished.
 * Counted from the end of `useModeEntering`, not from the click: setting up a mode can hold the page for a while
 * before the ease starts, and a clock that ran from the click would cut the ease short.
 */
export const MODE_EASE_MS = 340;
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

/** `MODE_EASE` as a Web Animations timing: 300 ms, Tailwind's `ease-out`. */
const SLIDE_TIMING = { duration: 300, easing: 'cubic-bezier(0, 0, 0.2, 1)' };

/**
 * Slides `ref` from `from` to `to` (CSS transforms) on the render where `start` turns true. Every slide started in the
 * same render gets the same start time, so two panes moving together stay in step to the frame, and the browser runs
 * them off the main thread. The element's own style should already hold `to`, which is where it stays afterwards.
 */
function useSlide(ref: RefObject<HTMLDivElement | null>, start: boolean, from: string, to: string, fadeIn = false) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!start || !el || typeof el.animate !== 'function') return;
    // `fadeIn`: also fades from transparent over the first part, while there is too little room on screen to show it whole.
    const frames: Keyframe[] = fadeIn
      ? [{ transform: from, opacity: 0 }, { opacity: 1, offset: 0.4 }, { transform: to, opacity: 1 }]
      : [{ transform: from }, { transform: to }];
    const animation = el.animate(frames, SLIDE_TIMING);
    animation.startTime = document.timeline.currentTime;
    return () => animation.cancel();
    // Only the start matters: the slide runs once per entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);
}

/**
 * One pane of a split screen, for a mode that splits it (Compare). Off: a plain `className` div.
 * The split eases in with transforms only (`useSlide`), so the browser moves it on its own every frame even while the
 * page is busy (a new map being set up, a pane being resized), and nothing is laid out again until it has finished:
 * - `anchor="left"`: the new pane. While the split eases (`easing`) it is a plain panel, out of the split's layout,
 *   that slides in from the right edge with the divider on its left edge (and `placeholder`, such as the loading label, on it);
 *   it ends exactly where the finished pane sits.
 *   Its content mounts only once the ease has finished, so a heavy view such as a map never stalls the slide.
 * - `anchor="center"`: the pane that was the whole screen. While the split eases it keeps its full size and its content
 *   glides left to the centre of its finished half; when the ease ends it takes its half and resizes once, with the same centre.
 *   `overlay` (laid out against the pane itself, such as a corner label) sits in the finished half from the first frame.
 * For `anchor="center"` keep `enabled` steady (the beta switch, not "mode is on"): turning it changes the elements
 * around the content and would remount a map inside.
 */
export function ModeSplitPane({ enabled, anchor, entering, easing, divider, className, overlay, placeholder, children }: {
  enabled: boolean;
  anchor: 'left' | 'center';
  entering: boolean;
  easing: boolean;
  /** The width of the divider between the two halves (the split's gap), a CSS length. */
  divider: string;
  className: string;
  /** Laid out against the pane itself rather than its content (a label that must sit in the pane's own corner). */
  overlay?: ReactNode;
  /** `anchor="left"`: shown on the sliding panel, centred in its part on screen and ending where the content's own loading label will be (`ModeLoadingLabel`). */
  placeholder?: ReactNode;
  children: ReactNode;
}) {
  const slideRef = useRef<HTMLDivElement>(null);
  const sliding = enabled && easing && !entering;
  const offset = anchor === 'left' ? 'translateX(100%)' : 'translateX(0px)';
  const settled = anchor === 'left' ? 'translateX(0px)' : `translateX(calc(-25% - ${divider} / 4))`;
  useSlide(slideRef, sliding, offset, settled);
  // The placeholder moves back by half the panel's travel, so it stays centred in the part of the panel already on
  // screen, and fades in while that part is still too narrow to show it whole. The panel clips it, and it is
  // transparent before the slide starts, so it never shows outside the panel.
  const placeholderRef = useRef<HTMLDivElement>(null);
  useSlide(placeholderRef, sliding && anchor === 'left', 'translateX(-50%)', 'translateX(0px)', true);
  if (!enabled) return <div className={className}>{children}{overlay}</div>;
  const transform = entering ? offset : settled;
  if (anchor === 'left') {
    if (easing) {
      return (
        <div
          ref={slideRef}
          className="absolute inset-y-0 right-0 overflow-hidden bg-[var(--bg-app)] will-change-transform"
          style={{ width: `calc(50% + ${divider} / 2)`, borderLeft: `${divider} solid var(--text-primary)`, boxSizing: 'border-box', transform }}
          data-mode-enter="sliding"
        >
          {placeholder != null && (
            <div ref={placeholderRef} className="absolute inset-0 flex items-center justify-center pointer-events-none will-change-transform" style={entering ? { transform: 'translateX(-50%)', opacity: 0 } : { transform: 'translateX(0px)' }}>
              {placeholder}
            </div>
          )}
        </div>
      );
    }
    return <div className={className} data-mode-enter="pane">{children}{overlay}</div>;
  }
  return (
    <div className={`${className} ${easing ? 'overflow-hidden bg-[var(--bg-app)]' : ''}`} data-mode-enter="pane">
      <div ref={slideRef} className={`absolute inset-0 ${easing ? 'will-change-transform' : ''}`} style={easing ? { transform } : undefined}>
        {children}
      </div>
      {overlay != null && overlay !== false && (
        <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: easing ? `calc(50% - ${divider} / 2)` : '100%' }}>
          {overlay}
        </div>
      )}
    </div>
  );
}

/**
 * Transitions for something that folds away when a mode starts: shutting fades it out first and then folds its width,
 * opening unfolds first and then fades in, so the text is never seen being cut off. Pair with a grid that goes between
 * `grid-cols-[0fr]` and `grid-cols-[1fr]` (`ModeCollapse`, the mode tabs' labels).
 */
export const FOLD_SHUT = '[transition:opacity_120ms_ease-out,grid-template-columns_200ms_ease-out_100ms] motion-reduce:[transition:none]';
export const FOLD_OPEN = '[transition:grid-template-columns_200ms_ease-out,opacity_150ms_ease-out_150ms] motion-reduce:[transition:none]';
/** An outline around something that folds (`FOLD_OPEN` / `FOLD_SHUT`): its colour fades in and out with the text, not before it. */
export const FOLD_OUTLINE_OPEN = '[transition:border-color_150ms_ease-out_150ms,margin_200ms_ease-out] motion-reduce:[transition:none]';
export const FOLD_OUTLINE_SHUT = '[transition:border-color_120ms_ease-out,margin_200ms_ease-out_100ms] motion-reduce:[transition:none]';

/**
 * Controls that a mode takes away (or brings back) in a row of controls: they fade and fold instead of vanishing, and
 * the controls beside them slide over. Kept mounted either way, so nothing that stays is redrawn from scratch.
 */
export function ModeCollapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid ${open ? `grid-cols-[1fr] opacity-100 ${FOLD_OPEN}` : `grid-cols-[0fr] opacity-0 pointer-events-none ${FOLD_SHUT}`}`}
      aria-hidden={open ? undefined : true}
      data-mode-collapse={open ? 'open' : 'shut'}
    >
      <div className={`flex items-center min-w-0 ${open ? '' : 'overflow-hidden'}`}>{children}</div>
    </div>
  );
}

/**
 * Classes for something that waits for a signal before it shows (a Compare label waiting for its route count): hidden
 * until `shown`, then eased in. Nothing with the switch off.
 */
export function modeFadeWhen(enabled: boolean, shown: boolean): string {
  if (!enabled) return '';
  // Opacity only (no visibility switch, which held the fade back until its end); hidden controls take no clicks.
  return shown ? `opacity-100 transition-opacity ${MODE_EASE}` : 'opacity-0 **:pointer-events-none';
}

/** True once `ready`, or `MODE_ENTER_MAX_WAIT_MS` after `active` turned on: a missing signal never hides something for good. */
export function useReadyOrTimeout(ready: boolean, active: boolean, enabled: boolean): boolean {
  const [timedOut, setTimedOut] = useState(false);
  const [seenActive, setSeenActive] = useState(active);
  if (seenActive !== active) {
    setSeenActive(active);
    setTimedOut(false);
  }
  useEffect(() => {
    if (!enabled || !active || ready || timedOut) return;
    const timer = window.setTimeout(() => setTimedOut(true), MODE_ENTER_MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, active, ready, timedOut]);
  return !enabled || ready || timedOut;
}

/** True once `value` has changed (by identity) since `since` turned true: "a new report has come in since then". */
export function useChangedSince<T>(value: T, since: boolean): boolean {
  const [mark, setMark] = useState<{ since: boolean; value: T }>({ since, value });
  if (mark.since !== since) setMark({ since, value });
  return since && mark.since === since && !Object.is(value, mark.value);
}

/** Classes that fade a mode's new controls in: transparent with no transition while entering, then eased in. */
export function modeFadeIn(enabled: boolean, entering: boolean): string {
  if (!enabled) return '';
  return entering ? 'opacity-0 transition-none' : `opacity-100 transition-opacity ${MODE_EASE}`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * True from the render where `active` turns on until the entry ease has finished (never with reduced motion).
 * `entering` is `useModeEntering` for the same mode: the ease runs from when it turns false.
 */
export function useModeEasing(active: boolean, enabled: boolean, entering: boolean): boolean {
  const [seenActive, setSeenActive] = useState(active);
  const [easing, setEasing] = useState(false);
  if (seenActive !== active) {
    setSeenActive(active);
    // With reduced motion there is no ease, so nothing waits for one.
    setEasing(enabled && active && !prefersReducedMotion());
  }
  useEffect(() => {
    if (!easing || entering) return;
    const timer = window.setTimeout(() => setEasing(false), MODE_EASE_MS);
    return () => window.clearTimeout(timer);
  }, [easing, entering]);
  return enabled && easing;
}

/** The app's loading label, as a view's cover shows it. `ModeSplitPane`'s sliding panel shows the same one in the same place. */
export function ModeLoadingLabel({ label }: { label: string }) {
  return <div className="rounded-full bg-[var(--bg-panel)]/90 px-3 py-1.5 text-xs font-semibold text-[var(--text-dim)]">{label}</div>;
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
  // through halfway), and is dropped once the fade has finished. Its loading label fades out twice as fast as the
  // view fades in, starting in the same frame: so there is no frame with neither, and the label is all but gone
  // before the map is half in.
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
          <div className={shown ? 'opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none' : 'opacity-100'}>
            <ModeLoadingLabel label={label} />
          </div>
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

/** Longest a map's new label waits for its route count. */
export const COUNT_MAX_WAIT_MS = 300;

/**
 * A map's label and its count, changed in the same frame (CIV-1567). `label` is already held until its map has drawn
 * (`useShownWhenDrawn`), but the count is reported once the map goes idle, a frame later; so a new label waits for the
 * next count (or `COUNT_MAX_WAIT_MS`) and the two change together. With the label unchanged, the count changes freely
 * (panning). Off: both pass through.
 */
export function useShownWithCount<L, C>(label: L, count: C, enabled: boolean): [L, C] {
  const [shown, setShown] = useState({ label, count });
  const [waiting, setWaiting] = useState<{ label: L; count: C } | null>(null);
  const latest = useRef({ label, count });
  latest.current = { label, count };
  let next = shown;
  if (enabled) {
    if (Object.is(label, shown.label)) {
      if (!Object.is(count, shown.count)) next = { label, count };
      if (waiting) setWaiting(null);
    } else if (!waiting || !Object.is(waiting.label, label)) {
      setWaiting({ label, count });
    } else if (!Object.is(count, waiting.count)) {
      next = { label, count };
      setWaiting(null);
    }
    if (next !== shown) setShown(next);
  }
  useEffect(() => {
    if (!enabled || !waiting) return;
    const timer = window.setTimeout(() => { setShown(latest.current); setWaiting(null); }, COUNT_MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, waiting]);
  return enabled ? [next.label, next.count] : [label, count];
}

type HoldMap = IdleMap & Pick<maplibregl.Map, 'getCanvas' | 'redraw' | 'loaded'>;
/** How long the map must stay idle with nothing new loading before a held picture lets go. */
const MAP_HOLD_QUIET_MS = 250;
/** How long a held picture of the map takes to fade into the redrawn map. */
const MAP_HOLD_FADE_MS = 300;

/**
 * Holds a still picture of the map over it while the map redraws for a new `key` (History's agency filter), then fades
 * the picture into the finished map (CIV-1567). MapLibre re-lays out every route tile for a new filter and draws the
 * half-done tiles meanwhile, which reads as the map thinning out and snapping back. Call it after the hook that
 * applies the change, so its wait starts once the change is on the map; put `ref` on a canvas over the map.
 * The picture goes at once if the map is moved, and after `MODE_ENTER_MAX_WAIT_MS` at most. Off: nothing.
 */
export function useMapHold(mapRef: RefObject<HoldMap | null>, mapLoaded: boolean, key: string, enabled: boolean): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seenKey = useRef(key);
  const held = useRef(false);
  // Before any effect applies the change: the map still shows the old drawing, so copy it.
  useLayoutEffect(() => {
    if (seenKey.current === key) return;
    seenKey.current = key;
    const map = mapRef.current;
    const hold = canvasRef.current;
    if (!enabled || !mapLoaded || !map || !hold || !map.loaded()) return;
    const source = map.getCanvas();
    // A WebGL canvas can be copied only right after it draws, before the frame is shown.
    map.redraw();
    hold.width = source.width;
    hold.height = source.height;
    const ctx = hold.getContext('2d');
    if (ctx) {
      // The map's canvas is not fully opaque (line edges are see-through over the page). The picture is laid on the
      // same colour first, so it is opaque and matches the screen exactly; a see-through picture let the live map show
      // through, which doubled the line edges.
      ctx.fillStyle = getComputedStyle(hold.parentElement ?? hold).backgroundColor || '#fff';
      ctx.fillRect(0, 0, hold.width, hold.height);
      ctx.drawImage(source, 0, 0);
    }
    hold.style.transition = 'none';
    hold.style.opacity = '1';
    hold.style.visibility = 'visible';
    held.current = true;
  }, [key, enabled, mapLoaded, mapRef]);
  // After the change is on the map: wait until it has fully redrawn, then fade the picture out. "Fully" means the
  // map is idle, no source is still processing new data (a GeoJSON source's setData reports idle before its worker
  // has the data), and nothing new has started loading for MAP_HOLD_QUIET_MS (the route layers' data follows the
  // filter a moment later).
  useEffect(() => {
    const map = mapRef.current;
    const hold = canvasRef.current;
    if (!held.current || !map || !hold) return;
    held.current = false;
    const pending = new Set<string>();
    let quietTimer = 0;
    let hideTimer = 0;
    let released = false;
    const cleanup = () => {
      window.clearTimeout(quietTimer);
      window.clearTimeout(maxTimer);
      map.off('dataloading', onLoading);
      map.off('sourcedata', onData);
      map.off('idle', onIdle);
      map.off('movestart', release);
    };
    function release() {
      if (released) return;
      released = true;
      cleanup();
      hold!.style.transition = `opacity ${MAP_HOLD_FADE_MS}ms ease-out`;
      hold!.style.opacity = '0';
      hideTimer = window.setTimeout(() => { hold!.style.visibility = 'hidden'; }, MAP_HOLD_FADE_MS + 20);
    }
    function onLoading(e: { dataType?: string; sourceId?: string }) {
      window.clearTimeout(quietTimer);
      if (e.dataType === 'source' && e.sourceId) pending.add(e.sourceId);
    }
    function onData(e: { dataType?: string; sourceId?: string; sourceDataType?: string }) {
      if (e.dataType === 'source' && e.sourceId && e.sourceDataType === 'content') pending.delete(e.sourceId);
    }
    function onIdle() {
      if (pending.size > 0) return;
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(() => { if (pending.size === 0 && map!.areTilesLoaded()) release(); }, MAP_HOLD_QUIET_MS);
    }
    const maxTimer = window.setTimeout(release, MODE_ENTER_MAX_WAIT_MS);
    map.on('dataloading', onLoading);
    map.on('sourcedata', onData);
    map.on('idle', onIdle);
    map.on('movestart', release);
    map.triggerRepaint();
    return () => { cleanup(); window.clearTimeout(hideTimer); };
  }, [key, mapRef]);
  return canvasRef;
}

/**
 * Words that cross-fade when they change (a mode's search hint): the old words fade out where they were while the new
 * ones fade in over them (CIV-1567). Off: just the words.
 */
export function ModeCrossFadeText({ text, enabled }: { text: string; enabled: boolean }) {
  const [shown, setShown] = useState(text);
  const [old, setOld] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  if (enabled && text !== shown) {
    setOld(shown);
    setShown(text);
    setFading(false);
  }
  useEffect(() => {
    if (old == null) return;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setFading(true)); });
    const timer = window.setTimeout(() => { setOld(null); setFading(false); }, 350);
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); window.clearTimeout(timer); };
  }, [old]);
  if (!enabled) return <>{text}</>;
  const fade = 'transition-opacity duration-300 ease-out motion-reduce:transition-none';
  return (
    <span className="inline-grid">
      {old != null && <span aria-hidden="true" className={`[grid-area:1/1] ${fade} ${fading ? 'opacity-0' : 'opacity-100'}`}>{old}</span>}
      <span className={`[grid-area:1/1] ${old != null ? `${fade} ${fading ? 'opacity-100' : 'opacity-0'}` : ''}`}>{shown}</span>
    </span>
  );
}

/**
 * Fades something in from its first painted frame (a loading panel), rather than from the moment it mounts: when the
 * page is busy as it mounts, a fade timed from the mount would finish before anything is painted. Render-prop: gets the
 * classes to put on the element. Off: no classes.
 */
export function ModeFadeInOnMount({ enabled, children }: { enabled: boolean; children: (className: string) => ReactNode }) {
  const [shown, setShown] = useState(!enabled);
  useEffect(() => {
    if (shown) return;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setShown(true)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [shown]);
  if (!enabled) return <>{children('')}</>;
  return <>{children(shown ? 'opacity-100 transition-opacity duration-200 ease-out motion-reduce:transition-none' : 'opacity-0')}</>;
}
