export interface StatItem {
  value: string;
  label: string;
}

/** Plain large numbers with small labels in one row, separated by space only (wraps on phones). */
export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-6">
      {items.map(item => (
        <div key={item.label} className="min-w-0 max-w-[16rem]">
          <dd className="whitespace-nowrap text-3xl font-black tracking-tight">{item.value}</dd>
          <dt className="mt-1 text-sm text-[var(--text-muted)]">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}
