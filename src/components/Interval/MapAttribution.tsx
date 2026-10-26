import { useCallback, useEffect, useRef, useState } from 'react';
import { FLOATING_CARD, MAP_BADGE, MAP_BADGE_LABEL, Z_PANEL } from '../../styles';
import { FEATURES } from '../../../shared/config';
import { version as appVersion } from '../../../package.json';
import { shortVersion } from '../../data/whatsNew';
import { WhatsNewPanel } from '../WhatsNewPanel';
import { trackEvent } from '../../lib/analytics';
import { OutboundLink } from '../OutboundLink';
import { ConsentPill } from '../AnalyticsConsent';
import { registerConsentRow, useConsentPrompt } from '../../lib/consentPrompt';
import { BASEMAP_ATTRIBUTION } from '../../lib/basemap';

const ATTRIB_LINK =
  `${MAP_BADGE_LABEL} text-[var(--text-dim)] no-underline hover:text-[var(--text-primary)]`;


/** Basemap credit: CARTO's required line, "© OpenStreetMap contributors, © CARTO", with both names linked. */
export function MapAttribution({ whatsNewEnabled = FEATURES.whatsNew }: { whatsNewEnabled?: boolean } = {}) {
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  // The analytics prompt is this row's last pill on sm and up, so it shares the row's baseline
  // and wraps above it (flex-wrap-reverse) only when the row is out of width (#999).
  const consent = useConsentPrompt();
  useEffect(() => registerConsentRow(), []);
  const closeWhatsNew = useCallback(() => setWhatsNewOpen(false), []);
  // Phones fold About, What's new and Feedback into one "About" pill with a small card.
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aboutOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (aboutRef.current && !aboutRef.current.contains(e.target as Node)) setAboutOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAboutOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [aboutOpen]);
  const feedbackHref = `mailto:hey@ryanisnota.pro?subject=Atlas%20Feedback&body=${encodeURIComponent(`Feedback:\n\n\nPage: ${window.location.href}\n`)}`;

  return (
    <>
    <div
      className={`max-sm:absolute max-sm:bottom-6 max-sm:left-6 max-sm:max-w-[calc(100vw-3rem)] ${Z_PANEL} sm:min-w-0 pointer-events-none [&>*]:pointer-events-auto flex flex-wrap-reverse items-center gap-1.5`}
      data-map-attribution=""
      title={BASEMAP_ATTRIBUTION}
    >
      <div ref={aboutRef} className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setAboutOpen(open => !open)}
          aria-expanded={aboutOpen}
          aria-haspopup="true"
          className={`${MAP_BADGE} h-[32px] ${MAP_BADGE_LABEL} whitespace-nowrap hover:text-[var(--text-primary)]`}
        >
          About
        </button>
        {aboutOpen && (
          <div className={`absolute bottom-full left-0 mb-2 ${FLOATING_CARD} min-w-44 p-1.5 flex flex-col gap-0.5`}>
            <a href="/about" className={`${MAP_BADGE_LABEL} px-3 py-2 rounded-xl no-underline hover:text-[var(--text-primary)]`}>About Atlas</a>
            {whatsNewEnabled && (
              <button
                type="button"
                onClick={() => { setAboutOpen(false); setWhatsNewOpen(true); }}
                aria-haspopup="dialog"
                className={`${MAP_BADGE_LABEL} px-3 py-2 rounded-xl text-left flex items-center justify-between gap-4 hover:text-[var(--text-primary)]`}
              >
                <span>What's new</span>
                <span className="text-[var(--text-muted)]">v{shortVersion(appVersion)}</span>
              </button>
            )}
            <a
              href={feedbackHref}
              onClick={() => { trackEvent('feedback_opened', { source: 'map_attribution' }); setAboutOpen(false); }}
              className={`${MAP_BADGE_LABEL} px-3 py-2 rounded-xl no-underline hover:text-[var(--text-primary)]`}
            >
              Feedback
            </a>
          </div>
        )}
      </div>
      <a
        href="/about"
        className={`${MAP_BADGE} h-8 max-sm:hidden ${MAP_BADGE_LABEL} whitespace-nowrap no-underline hover:text-[var(--text-primary)]`}
      >
        About Atlas
      </a>
      {whatsNewEnabled && (
        <button
          type="button"
          onClick={() => setWhatsNewOpen(open => !open)}
          aria-expanded={whatsNewOpen}
          aria-haspopup="dialog"
          className={`${MAP_BADGE} h-8 max-sm:hidden ${MAP_BADGE_LABEL} whitespace-nowrap hover:text-[var(--text-primary)]`}
        >
          v{shortVersion(appVersion)} · What's new
        </button>
      )}
      <a
        href={feedbackHref}
        onClick={() => trackEvent('feedback_opened', { source: 'map_attribution' })}
        className={`${MAP_BADGE} h-8 max-sm:hidden ${MAP_BADGE_LABEL} no-underline hover:text-[var(--text-primary)]`}
      >
        Feedback
      </a>
      <div className={`${MAP_BADGE} h-8 max-sm:h-[32px]`}>
        <p className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>
          <OutboundLink
            href="https://www.openstreetmap.org/copyright"
            kind="attribution"
            className={ATTRIB_LINK}
          >
            © OpenStreetMap contributors
          </OutboundLink>
          <span className={MAP_BADGE_LABEL}>, </span>
          <OutboundLink
            href="https://carto.com/attributions"
            kind="attribution"
            className={ATTRIB_LINK}
          >
            © CARTO
          </OutboundLink>
        </p>
      </div>
      {consent.open && <ConsentPill className="max-sm:hidden" choose={consent.choose} />}
    </div>
    {whatsNewEnabled && whatsNewOpen && (
      // The map's bottom row turns pointer events off; the panel's backdrop needs them back.
      <div className="contents pointer-events-auto">
        <WhatsNewPanel onClose={closeWhatsNew} includeBeta={FEATURES.whatsNewBetaItems} />
      </div>
    )}
    </>
  );
}
