import { useRef, useState, type Key } from 'react';

/** How far the other parts fade while one is active. */
export const FADED_OPACITY = 0.35;
/** Behind the active part's legend item or label. */
export const ACTIVE_BG = 'var(--bg-btn-hover)';
/** The words of a chart's legend, labels and axis, and the weight of its counts: the split bar's legend, in every chart that uses this (#1290). */
export const CHART_TEXT = 'text-xs text-[var(--text-primary)]';
export const CHART_COUNT = 'font-black';

/**
 * The split bar's way of picking a part (SplitBar, CategorySpark): hovering, focusing or tapping a part makes it the
 * active one and fades the others; tapping it again, leaving the chart or moving focus away clears it. A tap, a click after
 * hovering or Enter after tabbing to a part first makes it active rather than undoing the hover or focus just before it.
 * With `defaultKey`, that part is active whenever nothing else is (the age chart's most common age, CIV-1281).
 */
export function useActivePart(defaultKey: Key | null = null) {
  const [picked, setActive] = useState<Key | null>(null);
  const active = picked ?? defaultKey;
  const entered = useRef<Key | null>(null);
  const clear = () => setActive(null);
  return {
    active,
    clear,
    faded: (key: Key) => active !== null && active !== key,
    partEvents: (key: Key) => ({
      onMouseEnter: () => { entered.current = key; setActive(key); },
      onFocus: () => { entered.current = key; setActive(key); },
      onBlur: clear,
      onClick: () => {
        const justEntered = entered.current === key;
        entered.current = null;
        setActive(a => (a === key && !justEntered ? null : key));
      },
    }),
  };
}
