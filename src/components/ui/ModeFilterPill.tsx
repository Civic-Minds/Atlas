import Pill from './Pill';

/**
 * A mode filter pill with its route count ("Subway/Metro 4"): one look for the agency card and
 * History's agency view, so the same control never drifts between them.
 */
export default function ModeFilterPill({ label, count, selected, onClick, title }: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <Pill onClick={onClick} selected={selected} title={title} className="px-2">
      {label}
      <span className={selected ? 'opacity-80' : 'text-[var(--text-dim)]'}> {count}</span>
    </Pill>
  );
}
