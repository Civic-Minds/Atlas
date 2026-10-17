import MenuButton from '../ui/MenuButton';
import { PERIOD_PILLS } from '../../../shared/liveWording';

export type Period = 'week' | 'yesterday';
const OPTIONS = [{ key: 'week', label: PERIOD_PILLS.week }, { key: 'yesterday', label: PERIOD_PILLS.yesterday }] as const;

/**
 * A Live page subtitle whose date ("Week of Oct 8–14" or "Tuesday, Oct 13") is the This week / Yesterday menu (CIV-278).
 * `text` is the whole subtitle and starts with `dateLabel`; without `onChange` the date is plain text.
 */
export default function PeriodSubtitle({ text, dateLabel, value, onChange }: { text: string; dateLabel: string; value: Period; onChange?: (p: Period) => void }) {
  if (!onChange || !dateLabel || !text.startsWith(dateLabel)) return <>{text}</>;
  return <><MenuButton label={dateLabel} value={value} options={OPTIONS} onChange={onChange} />{text.slice(dateLabel.length)}</>;
}
