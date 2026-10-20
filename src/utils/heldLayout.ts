/** A row's laid-out size before a sparkline hover, kept so the hover cannot move the card. */
export interface HeldSize {
  /** Width of the row's value cell (headway or "limited"), in px. */
  valueWidth: number;
  /** Height of the whole row, in px. */
  rowHeight: number;
}

/**
 * Styles that hold a row at its pre-hover size while the sparkline is hovered.
 * The value cell keeps at least its earlier width, so the label beside it wraps
 * the same way, and the row keeps at least its earlier height, so a value line
 * that disappears on hover does not shrink it. Minimums only: a wider hover value
 * still fits. Nothing is held when not hovering or before the row was measured.
 */
export function heldRowStyles(hold: boolean, size: HeldSize | null): {
  row?: { minHeight: number };
  value?: { minWidth: number };
} {
  if (!hold || !size || size.valueWidth <= 0 || size.rowHeight <= 0) return {};
  return { row: { minHeight: size.rowHeight }, value: { minWidth: size.valueWidth } };
}
