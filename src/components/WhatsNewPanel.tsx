import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { FLOATING_CARD, PANEL_ENTER, Z_MODAL_TOP } from '../styles';
import { resolveDataRelease, type DataRelease } from '../lib/dataRelease';
import { formatStoredDate } from '../utils/format';
import { WhatsNewItemText } from './WhatsNewItemText';
import { shortVersion, visibleWhatsNew, type WhatsNewRelease } from '../data/whatsNew';

/** "Oct 9, 2026" from the release manifest, or null when it carries no usable date. */
export function dataUpdatedLabel(release: Pick<DataRelease, 'generatedAt'> | null | undefined): string | null {
  const generatedAt = release?.generatedAt;
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) return null;
  return formatStoredDate(generatedAt.slice(0, 10)) || null;
}

interface Props {
  onClose: () => void;
  includeBeta: boolean;
  releases?: WhatsNewRelease[];
  /** Injected in tests; defaults to the cached manifest the map already loads. */
  loadRelease?: () => Promise<Pick<DataRelease, 'generatedAt'> | null>;
}

export function WhatsNewPanel({ onClose, includeBeta, releases, loadRelease = resolveDataRelease }: Props) {
  const [dataDate, setDataDate] = useState<string | null>(null);
  // Only the latest version here; older ones live on /changelog.
  const visible = visibleWhatsNew(includeBeta, releases).slice(0, 1);

  useEffect(() => {
    let cancelled = false;
    loadRelease()
      .then(release => { if (!cancelled) setDataDate(dataUpdatedLabel(release)); })
      .catch(() => { if (!cancelled) setDataDate(null); });
    return () => { cancelled = true; };
  }, [loadRelease]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 ${Z_MODAL_TOP}`} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        onClick={event => event.stopPropagation()}
        className={`absolute bottom-24 sm:bottom-16 left-3 right-3 sm:left-6 sm:right-auto sm:w-[340px] max-h-[min(70vh,520px)] flex flex-col overflow-hidden ${FLOATING_CARD} ${PANEL_ENTER}`}
      >
        <div className="shrink-0 flex items-center justify-between px-5 border-b border-[var(--border-primary)] h-12">
          <h2 id="whats-new-title" className="text-xs font-black text-[var(--text-primary)]">What's new</h2>
          <button
            type="button"
            aria-label="Close what's new"
            onClick={onClose}
            className="w-7 h-7 -mr-1.5 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-y-auto custom-scrollbar px-5 py-4 space-y-4 text-xs">
          {dataDate && (
            <p className="pb-3 text-[11px] font-bold text-[var(--text-muted)]">Map data updated {dataDate}</p>
          )}
          {visible.map(release => (
            <section key={release.version} aria-label={`App version ${shortVersion(release.version)}`}>
              <h3 className="text-[11px] font-black text-[var(--text-primary)]">
                App version {shortVersion(release.version)}
                <span className="font-semibold text-[var(--text-dim)]"> · {release.month}</span>
              </h3>
              <ul className="mt-2 space-y-2">
                {release.items.map(item => (
                  <li key={item.text} className="flex items-start gap-2 leading-relaxed text-[var(--text-dim)]">
                    <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" />
                    <span><WhatsNewItemText item={item} tagClass="text-[9px]" /></span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <a href="/changelog" className="block text-[11px] font-bold text-[var(--accent)] hover:underline">See all changes</a>
        </div>
      </div>
    </div>
  );
}
