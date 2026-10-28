import { useLayoutEffect, useRef, useState } from 'react';
import { CHART_PERIOD_LABEL } from '../../styles';
import { PERIOD_OVERVIEW_BANDS } from '../../utils/sparklinePeriods';

/** The space a chart leaves above its bars for the names row of named bands. */
export const BAND_NAMES_ROW = 'pt-6';

/** A period's name, and its short form for a peak ("AM peak" -> "AM"). */
const shortPeriodLabel = (label: string) => label.replace(/ peak$/, '');

/** Space kept between a band's left edge and its name, and between two names, in px. */
const BAND_LABEL_INSET = 4;
const BAND_LABEL_GAP = 6;

/** The order names claim space on a narrow chart: the day's main periods first, so Late is the first to go. */
const BAND_LABEL_PRIORITY = ['amPeak', 'pmPeak', 'midday', 'evening', 'overnight', 'late'];

/**
 * Which name each period band shows, given the chart's width and each text's width (CIV-1094). The peaks are always
 * "AM" and "PM", so every chart reads the same. In priority order, each band gets its name, or nothing where it has
 * no room: a name starts at its band and may run past it, as long as it clears every name already placed and the
 * chart's right edge (the last band's name may instead end at that edge, still starting on its own band). With no
 * width known yet (or in tests), every band shows its name.
 */
export function layoutBandLabels(
  bands: readonly { key: string; label: string; left: number; width: number }[],
  chartWidth: number,
  textWidth: (text: string) => number,
): { key: string; text: string; alignRight: boolean }[] {
  if (chartWidth <= 0) return bands.map(band => ({ key: band.key, text: shortPeriodLabel(band.label), alignRight: false }));
  const rank = (key: string) => (BAND_LABEL_PRIORITY.indexOf(key) + 1 || BAND_LABEL_PRIORITY.length + 1);
  type Placed = { key: string; text: string; alignRight: boolean; start: number; end: number };
  const placed: Placed[] = [];
  const clear = (start: number, end: number) => start >= 0 && end <= chartWidth
    && placed.every(other => end + BAND_LABEL_GAP <= other.start || start >= other.end + BAND_LABEL_GAP);
  const lastKey = bands[bands.length - 1]?.key;
  for (const band of [...bands].sort((a, b) => rank(a.key) - rank(b.key))) {
    const text = shortPeriodLabel(band.label);
    const w = textWidth(text);
    const start = band.left * chartWidth + BAND_LABEL_INSET;
    if (clear(start, start + w)) placed.push({ key: band.key, text, alignRight: false, start, end: start + w });
    // A name always starts on its own band, or it would read as the band before's.
    else if (band.key === lastKey && chartWidth - w >= band.left * chartWidth && clear(chartWidth - w, chartWidth)) placed.push({ key: band.key, text, alignRight: true, start: chartWidth - w, end: chartWidth });
  }
  return bands.flatMap(band => placed.filter(l => l.key === band.key).map(({ key, text, alignRight }) => ({ key, text, alignRight })));
}

/** The period names drawn on a full-day chart's shaded bands, measured so no two overlap. */
function BandLabels() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [font, setFont] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    const style = getComputedStyle(el);
    setFont(`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
    // Measured again once the web font has loaded: a fallback font's widths differ.
    document.fonts?.ready.then(() => setFontsReady(true));
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const context = useMemoCanvas(width > 0 ? font : null, fontsReady);
  const labels = layoutBandLabels(PERIOD_OVERVIEW_BANDS, context ? width : 0, text => context?.measureText(text).width ?? 0);
  return (
    <div ref={ref} className={`absolute inset-x-0 top-1 h-4 pointer-events-none ${CHART_PERIOD_LABEL}`} data-testid="full-day-period-labels" aria-hidden="true">
      {labels.map(({ key, text, alignRight }) => {
        const band = PERIOD_OVERVIEW_BANDS.find(b => b.key === key)!;
        return (
          <span
            key={key}
            className="absolute top-0 whitespace-nowrap leading-4"
            style={alignRight ? { right: 0 } : { left: `calc(${band.left * 100}% + ${BAND_LABEL_INSET}px)` }}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

/** A 2D canvas context set to `font`, for measuring label widths; null until the font is known. */
function useMemoCanvas(font: string | null, fontsReady: boolean): CanvasRenderingContext2D | null {
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  useLayoutEffect(() => {
    if (!font) return;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    ctx.font = font;
    setContext(ctx);
  }, [font, fontsReady]);
  return context;
}

/**
 * The full-day charts' period bands (CIV-1094): every other period lightly shaded, behind the bars, the same on the
 * frequency and trip time charts. With `names`, each band also carries its period's name in a row above the bars
 * (the chart leaves BAND_NAMES_ROW for it). Fills its positioned parent.
 */
export function FullDayPeriodBands({ names, className = 'inset-0' }: { names: boolean; className?: string }) {
  return (
    <div className={`absolute pointer-events-none ${className}`} aria-hidden="true" data-testid="full-day-period-bands">
      {PERIOD_OVERVIEW_BANDS.map(band => (
        <div
          key={band.key}
          className="absolute top-0 bottom-0 rounded-sm odd:bg-[var(--bg-btn-hover)] even:bg-transparent opacity-40"
          style={{ left: `${band.left * 100}%`, width: `${band.width * 100}%` }}
        />
      ))}
      {names && <BandLabels />}
    </div>
  );
}
