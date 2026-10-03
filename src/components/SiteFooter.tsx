export default function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border-primary)] pt-5 text-sm text-[var(--text-dim)]" aria-label="Site footer">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>© 2026 Civic Minds.</span>
        <span aria-hidden="true">·</span>
        <a className="text-[var(--accent)] hover:underline" href="/about/docs">Documentation</a>
        <span aria-hidden="true">·</span>
        <a className="text-[var(--accent)] hover:underline" href="/terms">Terms of Service</a>
        <span aria-hidden="true">·</span>
        <a className="text-[var(--accent)] hover:underline" href="/privacy">Privacy Policy</a>
      </div>
    </footer>
  );
}
