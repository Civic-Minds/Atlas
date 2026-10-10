type PageContentsItem = { id: string; label: string };

export default function PageContents({ items }: { items: readonly PageContentsItem[] }) {
  return (
    <nav aria-label="On this page" className="mb-8 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-btn)] p-4 lg:sticky lg:top-8 lg:mb-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pt-14">
      <p className="text-xs font-black text-[var(--text-muted)] mb-2">On this page</p>
      <div className="grid gap-1.5 text-sm lg:block lg:space-y-2">
        {items.map((item) => (
          <a key={item.id} className="block text-[var(--accent)] hover:underline" href={`#${item.id}`}>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
