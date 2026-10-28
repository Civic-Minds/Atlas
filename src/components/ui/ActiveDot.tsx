/** The accent dot on a control's corner that says a filter is on (the filter chips and the Settings button). The parent is `relative`. */
export default function ActiveDot() {
  return <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent)] border border-[var(--bg-panel)]" />;
}
