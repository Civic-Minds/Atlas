import { useEffect } from 'react';
import { Z_MODAL_TOP } from '../styles';
import Panel from './ui/Panel';
import PanelHeader from './ui/PanelHeader';
import { formatStoredDate } from '../utils/format';
import { WhatsNewItemText } from './WhatsNewItemText';
import { shortVersion, visibleWhatsNew, type WhatsNewRelease } from '../data/whatsNew';

/** "Released Nov 9, 2026" from the release's own date; the month when the date is unusable. */
function releasedLabel(release: WhatsNewRelease): string {
  const date = formatStoredDate(release.date);
  return date ? `Released ${date}` : release.month;
}

interface Props {
  onClose: () => void;
  includeBeta: boolean;
  releases?: WhatsNewRelease[];
}

export function WhatsNewPanel({ onClose, includeBeta, releases }: Props) {
  // Only the latest version here; older ones live on /changelog.
  const visible = visibleWhatsNew(includeBeta, releases).slice(0, 1);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 ${Z_MODAL_TOP}`} onClick={onClose}>
      <Panel
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        onClick={event => event.stopPropagation()}
        enter
        className="absolute bottom-24 sm:bottom-16 left-3 right-3 sm:left-6 sm:right-auto sm:w-[340px] max-h-[min(70vh,520px)]"
      >
        <PanelHeader titleId="whats-new-title" title="What's new" onClose={onClose} closeLabel="Close what's new" />
        <div className="overflow-y-auto custom-scrollbar px-5 py-4 space-y-4 text-xs">
          {visible.map(release => (
            <section key={release.version} aria-label={`Version ${shortVersion(release.version)}`}>
              <h3 className="text-xs font-black text-[var(--text-primary)]">
                Version {shortVersion(release.version)}
                <span className="font-semibold text-[var(--text-dim)]"> · {releasedLabel(release)}</span>
              </h3>
              <ul className="mt-2 space-y-2">
                {release.items.map(item => (
                  <li key={item.text} className="flex items-start gap-2 leading-relaxed text-[var(--text-dim)]">
                    <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" />
                    <span><WhatsNewItemText item={item} tagClass="text-xs" leadClass="font-normal" hideNew /></span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <a href="/changelog" className="block text-xs font-bold text-[var(--accent)] hover:underline">See all changes</a>
        </div>
      </Panel>
    </div>
  );
}
