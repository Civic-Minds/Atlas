import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import AppLink from '../ui/AppLink';
import { MAP_FOOTER_PILLS_PHONE_SLOT, MAP_FOOTER_PILLS_PHONE_SLOT_CLEAR_CONTROLS, FLOATING_CARD, MAP_BADGE, MAP_BADGE_LABEL, Z_PANEL } from '../../styles';
import { FEATURES } from '../../../shared/config';
import { version as appVersion } from '../../../package.json';
import { shortVersion } from '../../data/whatsNew';
import { WhatsNewPanel } from '../WhatsNewPanel';
import { trackEvent, withoutMapPosition } from '../../lib/analytics';
import { BASEMAP_ATTRIBUTION } from '../../lib/basemap';
import { BasemapCredit, BASEMAP_CREDIT_LINK } from '../BasemapCredit';
import { OutboundLink } from '../OutboundLink';
import { CONTEXT_CREDIT_SHORT, contextCreditTitle, MASSDOT_CREDIT_SHORT, MASSDOT_CREDIT_URL, MBTA_VEHICLES_CREDIT, ABOUT_ATLAS, WHATS_NEW_TITLE, FEEDBACK_LABEL } from '../../content/noticeCopy';
import { acsWindow } from '../../utils/contextLayer';
import type { AgencyCredit } from '../../utils/agencyCredits';
import { ABOUT_PATH } from '../../../shared/pagePaths';
import { mailto } from '../../../shared/contact';
import { andOthers } from '../../../shared/overflowText';
import { markWhatsNewSeen, whatsNewUnseen } from '../../utils/whatsNewSeen';

/** A small dot on What's New while this release hasn't been opened here (light, no fill around it; VISUAL.md). */
function UnseenDot() {
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" aria-hidden="true" />;
}


/** The most agency names the credit pill lists before "and N other agencies" (CIV-461): one compact line. */
const PILL_CREDITS_MAX = 2;

/** Basemap credit — linked names satisfy OSM + CARTO attribution requirements. */
export function MapAttribution({ contextLayerOn = false, contextYear = null, massDotOn = false, agencyCredits = [], onCreditOpen }: { /** The population / income shading is on: add its data credit to the OpenStreetMap pill. */ contextLayerOn?: boolean; contextYear?: number | null; /** CIV-2046: MBTA vehicles are on the map: credit MassDOT in the same pill. */ massDotOn?: boolean; /** CIV-461: the agencies in view whose data licence requires credit, in the same pill (MassDOT's pattern). */ agencyCredits?: readonly AgencyCredit[]; /** CIV-461: a credited name (or the "and N other agencies" overflow, null) opens About → Schedule sources there. */ onCreditOpen?: (slug: string | null) => void } = {}) {
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  // The census credit lengthens the pill: on phones it narrows and ellipses. Agency credits never ellipse (CIV-461, Ryan:
  // "the crowding can just list the one(s) tequiring attribution then + more"): the names that fit, then "and N other agencies".
  // One entry per short name (nine "BC Transit" agencies are one), at most PILL_CREDITS_MAX before the overflow (Ryan, on
  // the full legal names running across the map: keep it to one compact line); full names and sentences are in About.
  const pillCredits = agencyCredits.filter((c, i) => agencyCredits.findIndex(o => o.shortName === c.shortName) === i);
  const creditsKey = pillCredits.map(c => c.slug).join('|');
  const [shownCredits, setShownCredits] = useState(Math.min(pillCredits.length, PILL_CREDITS_MAX));
  const creditBoxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useLayoutEffect(() => { setShownCredits(Math.min(pillCredits.length, PILL_CREDITS_MAX)); }, [creditsKey, boxWidth, pillCredits.length]);
  useLayoutEffect(() => {
    const el = creditBoxRef.current;
    if (el && shownCredits > 1 && el.scrollWidth > el.clientWidth) setShownCredits(n => n - 1);
  }, [shownCredits, creditsKey, boxWidth]);
  useEffect(() => {
    const el = creditBoxRef.current?.parentElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setBoxWidth(Math.round(entries[0]?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hasCredits = pillCredits.length > 0;
  const hiddenCredits = pillCredits.length - Math.min(shownCredits, pillCredits.length);
  // The overflow counts agencies, not entries: a hidden "BC Transit" entry stands for each BC Transit agency in view.
  const shownNames = new Set(pillCredits.slice(0, pillCredits.length - hiddenCredits).map(c => c.shortName));
  const hiddenAgencies = agencyCredits.filter(c => !shownNames.has(c.shortName)).length;
  // The dot shows until What's New is opened, and returns with the next release.
  const [unseen, setUnseen] = useState(() => whatsNewUnseen(appVersion));
  useEffect(() => {
    if (!whatsNewOpen) return;
    markWhatsNewSeen(appVersion);
    setUnseen(false);
  }, [whatsNewOpen]);
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
  const feedbackHref = mailto('Atlas Feedback', `Feedback:\n\n\nPage: ${withoutMapPosition(window.location.href)}\n`);

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
          className={`${MAP_BADGE} h-[32px] ${MAP_BADGE_LABEL} whitespace-nowrap hover:text-[var(--text-primary)] inline-flex items-center gap-1.5`}
        >
          About
          {unseen && <UnseenDot />}
        </button>
        {aboutOpen && (
          <div className={`absolute bottom-full left-0 mb-2 ${FLOATING_CARD} min-w-44 p-1.5 flex flex-col gap-0.5`}>
            <AppLink to={ABOUT_PATH} className={`${MAP_BADGE_LABEL} px-3 py-2 rounded-xl no-underline hover:text-[var(--text-primary)]`}>{ABOUT_ATLAS}</AppLink>
            <button
              type="button"
              onClick={() => { setAboutOpen(false); setWhatsNewOpen(true); }}
              aria-haspopup="dialog"
              className={`${MAP_BADGE_LABEL} px-3 py-2 rounded-xl text-left flex items-center justify-between gap-4 hover:text-[var(--text-primary)]`}
            >
              <span className="flex items-center gap-1.5">{WHATS_NEW_TITLE}{unseen && <UnseenDot />}</span>
              <span className="text-[var(--text-muted)]">v{shortVersion(appVersion)}</span>
            </button>
            <a
              href={feedbackHref}
              onClick={() => { trackEvent('feedback_opened', { source: 'map_attribution' }); setAboutOpen(false); }}
              className={`${MAP_BADGE_LABEL} px-3 py-2 rounded-xl no-underline hover:text-[var(--text-primary)]`}
            >
              {FEEDBACK_LABEL}
            </a>
          </div>
        )}
      </div>
      <AppLink
        to={ABOUT_PATH}
        className={`${MAP_BADGE} h-8 max-sm:hidden ${MAP_BADGE_LABEL} whitespace-nowrap no-underline hover:text-[var(--text-primary)]`}
      >
        {ABOUT_ATLAS}
      </AppLink>
      <button
        type="button"
        onClick={() => setWhatsNewOpen(open => !open)}
        aria-expanded={whatsNewOpen}
        aria-haspopup="dialog"
        className={`${MAP_BADGE} h-8 max-sm:hidden ${MAP_BADGE_LABEL} whitespace-nowrap hover:text-[var(--text-primary)]`}
      >
        v{shortVersion(appVersion)} · {WHATS_NEW_TITLE}{unseen && <span className="ml-1.5 inline-flex align-middle"><UnseenDot /></span>}
      </button>
      <a
        href={feedbackHref}
        onClick={() => trackEvent('feedback_opened', { source: 'map_attribution' })}
        className={`${MAP_BADGE} h-8 max-sm:hidden ${MAP_BADGE_LABEL} no-underline hover:text-[var(--text-primary)]`}
      >
        {FEEDBACK_LABEL}
      </a>
      {/* With the shading on, the credit is longer: on phones the row is narrowed and the credit shrinks (ellipsis) so it stays left of the zoom buttons. */}
      <div ref={creditBoxRef} className={`${MAP_BADGE} h-8 max-sm:h-[32px] ${contextLayerOn || hasCredits ? 'max-w-full min-w-0' : ''} ${hasCredits ? 'overflow-hidden' : ''}`}>
        <BasemapCredit
          className={contextLayerOn && !hasCredits ? 'min-w-0 truncate' : ''}
          extra={contextLayerOn || massDotOn || agencyCredits.length > 0 ? (
            <>
              {[
                ...(contextLayerOn ? [(
                  <OutboundLink
                    key="context"
                    href="https://www.census.gov/programs-surveys/acs"
                    kind="attribution"
                    className={BASEMAP_CREDIT_LINK}
                    title={contextYear ? contextCreditTitle(acsWindow(contextYear)) : undefined}
                  >
                    {CONTEXT_CREDIT_SHORT}
                  </OutboundLink>
                )] : []),
                ...(massDotOn ? [(
                  <OutboundLink key="massdot" href={MASSDOT_CREDIT_URL} kind="attribution" className={BASEMAP_CREDIT_LINK} title={MBTA_VEHICLES_CREDIT}>
                    {MASSDOT_CREDIT_SHORT}
                  </OutboundLink>
                )] : []),
                ...pillCredits.slice(0, pillCredits.length - hiddenCredits).map(c => (
                  <button key={`agency-${c.slug}`} type="button" className={`${BASEMAP_CREDIT_LINK} cursor-pointer`} title={c.text} onClick={() => onCreditOpen?.(c.slug)}>
                    {c.shortName}
                  </button>
                )),
                ...(hiddenCredits > 0 ? [(
                  <button key="agency-more" type="button" className={`${BASEMAP_CREDIT_LINK} cursor-pointer`} onClick={() => onCreditOpen?.(null)}>
                    {andOthers(hiddenAgencies, 'agency', 'agencies')}
                  </button>
                )] : []),
              ].map((link, i) => (
                <span key={link.key}>{i > 0 && <span className={MAP_BADGE_LABEL}> · </span>}{link}</span>
              ))}
            </>
          ) : undefined}
        />
      </div>
    </div>
    {whatsNewOpen && (
      // The map's bottom row turns pointer events off; the panel's backdrop needs them back.
      <div className="contents pointer-events-auto">
        <WhatsNewPanel onClose={closeWhatsNew} includeBeta={FEATURES.whatsNewBetaItems} />
      </div>
    )}
    </>
  );
}
