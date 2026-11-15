import { useCallback, useEffect, useRef, useState } from 'react';
import { MAP_FOOTER_PILLS_PHONE_SLOT, MAP_FOOTER_PILLS_PHONE_SLOT_CLEAR_CONTROLS, FLOATING_CARD, MAP_BADGE, MAP_BADGE_LABEL, Z_PANEL } from '../../styles';
import { FEATURES } from '../../../shared/config';
import { version as appVersion } from '../../../package.json';
import { shortVersion } from '../../data/whatsNew';
import { WhatsNewPanel } from '../WhatsNewPanel';
import { trackEvent } from '../../lib/analytics';
import { ConsentPill } from '../AnalyticsConsent';
import { registerConsentRow, useConsentPrompt } from '../../lib/consentPrompt';
import { BASEMAP_ATTRIBUTION } from '../../lib/basemap';
import { BasemapCredit, BASEMAP_CREDIT_LINK } from '../BasemapCredit';
import { OutboundLink } from '../OutboundLink';
import { CONTEXT_CREDIT_SHORT, contextCreditTitle, ABOUT_ATLAS, WHATS_NEW_TITLE } from '../../content/noticeCopy';
import { acsWindow } from '../../utils/contextLayer';


/** Basemap credit — linked names satisfy OSM + CARTO attribution requirements. */
export function MapAttribution({ whatsNewEnabled = FEATURES.whatsNew, contextLayerOn = false, contextYear = null }: { whatsNewEnabled?: boolean; /** The population / income shading is on: add its data credit to the OpenStreetMap pill. */ contextLayerOn?: boolean; contextYear?: number | null } = {}) {
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
      className={`${contextLayerOn ? MAP_FOOTER_PILLS_PHONE_SLOT_CLEAR_CONTROLS : MAP_FOOTER_PILLS_PHONE_SLOT} ${Z_PANEL} sm:min-w-0 pointer-events-none [&>*]:pointer-events-auto flex flex-wrap-reverse items-center gap-1.5`}
      data-map-attribution=""
      data-map-overlay="footer-pills"
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
            <a href="/about" className={`${MAP_BADGE_LABEL} px-3 py-2 rounded-xl no-underline hover:text-[var(--text-primary)]`}>{ABOUT_ATLAS}</a>
            {whatsNewEnabled && (
              <button
                type="button"
                onClick={() => { setAboutOpen(false); setWhatsNewOpen(true); }}
                aria-haspopup="dialog"
                className={`${MAP_BADGE_LABEL} px-3 py-2 rounded-xl text-left flex items-center justify-between gap-4 hover:text-[var(--text-primary)]`}
              >
                <span>{WHATS_NEW_TITLE}</span>
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
        {ABOUT_ATLAS}
      </a>
      {whatsNewEnabled && (
        <button
          type="button"
          onClick={() => setWhatsNewOpen(open => !open)}
          aria-expanded={whatsNewOpen}
          aria-haspopup="dialog"
          className={`${MAP_BADGE} h-8 max-sm:hidden ${MAP_BADGE_LABEL} whitespace-nowrap hover:text-[var(--text-primary)]`}
        >
          v{shortVersion(appVersion)} · {WHATS_NEW_TITLE}
        </button>
      )}
      <a
        href={feedbackHref}
        onClick={() => trackEvent('feedback_opened', { source: 'map_attribution' })}
        className={`${MAP_BADGE} h-8 max-sm:hidden ${MAP_BADGE_LABEL} no-underline hover:text-[var(--text-primary)]`}
      >
        Feedback
      </a>
      {/* With the shading on, the credit is longer: on phones the row is narrowed and the credit shrinks (ellipsis) so it stays left of the zoom buttons. */}
      <div className={`${MAP_BADGE} h-8 max-sm:h-[32px] ${contextLayerOn ? 'max-w-full min-w-0' : ''}`}>
        <BasemapCredit
          className={contextLayerOn ? 'min-w-0 truncate' : ''}
          extra={contextLayerOn ? (
            <OutboundLink
              href="https://www.census.gov/programs-surveys/acs"
              kind="attribution"
              className={BASEMAP_CREDIT_LINK}
              title={contextYear ? contextCreditTitle(acsWindow(contextYear)) : undefined}
            >
              {CONTEXT_CREDIT_SHORT}
            </OutboundLink>
          ) : undefined}
        />
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
