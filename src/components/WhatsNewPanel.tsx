import { useEffect } from 'react';
import AppLink from './ui/AppLink';
import ArrowLink from './ui/ArrowLink';
import { PHONE_MEDIA_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { shortDate } from '../../shared/dateText';
import { Z_MODAL_TOP } from '../styles';
import Panel from './ui/Panel';
import PanelHeader from './ui/PanelHeader';
import { WhatsNewItemText } from './WhatsNewItemText';
import { CLOSE_PLACES, closeLabel, WHATS_NEW_TITLE, SEE_ALL_CHANGES_LABEL } from '../content/noticeCopy';
import { panelItems, shortVersion, visibleWhatsNew, type WhatsNewFeature, type WhatsNewRelease } from '../data/whatsNew';
import { CHANGELOG_PATH } from '../../shared/pagePaths';

/** "Released Nov 9, 2026" from the release's own date; nothing when the date is unusable. */
function releasedLabel(release: WhatsNewRelease): string | null {
  const date = shortDate(release.date);
  return date ? `Released ${date}` : null;
}

interface Props {
  onClose: () => void;
  includeBeta: boolean;
  features?: WhatsNewFeature[];
  releases?: { version: string; date: string }[];
}

export function WhatsNewPanel({ onClose, includeBeta, features, releases }: Props) {
  // Only the latest version here, and only its highlights (CIV-2026); every line and older versions live on /changelog.
  const visible = visibleWhatsNew(includeBeta, features, releases).slice(0, 1);
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);

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
        <PanelHeader titleId="whats-new-title" title={WHATS_NEW_TITLE} onClose={onClose} closeLabel={closeLabel(CLOSE_PLACES.whatsNew)} />
        <div className="overflow-y-auto custom-scrollbar px-5 py-4 space-y-4 text-xs">
          {visible.map(release => (
            <section key={release.version} aria-label={`Version ${shortVersion(release.version)}`}>
              <h3 className="text-xs font-black text-[var(--text-primary)]">
                Version {shortVersion(release.version)}
                {releasedLabel(release) && <span className="font-semibold text-[var(--text-dim)]"> · {releasedLabel(release)}</span>}
              </h3>
              <ul className="mt-2 space-y-2">
                {panelItems(release).map(item => (
                  <li key={item.text} className="flex items-start gap-2 leading-relaxed text-[var(--text-dim)]">
                    <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" />
                    <span>
                      <WhatsNewItemText item={item} tagClass="text-xs" leadClass="font-normal" hideNew />
                      {/* CIV-1999: runs on after the sentence, as "Learn more →" does in card notices. */}
                      {item.link && !(item.link.desktopOnly && isPhone) && <>{' '}<ArrowLink href={item.link.to} tone="inline" size="xs" wrap onClick={onClose}>{item.link.label}</ArrowLink></>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <AppLink to={CHANGELOG_PATH} className="block text-xs font-bold text-[var(--accent)] hover:underline">{SEE_ALL_CHANGES_LABEL}</AppLink>
        </div>
      </Panel>
    </div>
  );
}
