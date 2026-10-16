import { useCallback, useState } from 'react';
import { MAP_BADGE, MAP_BADGE_LABEL, Z_PANEL } from '../../styles';
import { FEATURES } from '../../../shared/config';
import { version as appVersion } from '../../../package.json';
import { shortVersion } from '../../data/whatsNew';
import { WhatsNewPanel } from '../WhatsNewPanel';
import { trackEvent } from '../../lib/analytics';
import { OutboundLink } from '../OutboundLink';

const ATTRIB_LINK =
  `${MAP_BADGE_LABEL} text-[var(--text-dim)] no-underline hover:text-[var(--text-primary)]`;

const FULL_ATTRIBUTION =
  'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.';

/** Basemap credit — linked names satisfy OSM + CARTO attribution requirements. */
export function MapAttribution({ whatsNewEnabled = FEATURES.whatsNew }: { whatsNewEnabled?: boolean } = {}) {
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const closeWhatsNew = useCallback(() => setWhatsNewOpen(false), []);
  const feedbackHref = `mailto:hey@ryanisnota.pro?subject=Atlas%20Feedback&body=${encodeURIComponent(`Feedback:\n\n\nPage: ${window.location.href}\n`)}`;

  return (
    <>
    <div
      className={`absolute bottom-6 left-6 ${Z_PANEL} pointer-events-auto flex flex-wrap-reverse items-center gap-1.5 max-w-[calc(100vw-3rem)]`}
      title={FULL_ATTRIBUTION}
    >
      <a
        href="/about"
        className={`${MAP_BADGE} h-8 ${MAP_BADGE_LABEL} whitespace-nowrap no-underline hover:text-[var(--text-primary)]`}
      >
        About Atlas
      </a>
      {whatsNewEnabled && (
        <button
          type="button"
          onClick={() => setWhatsNewOpen(open => !open)}
          aria-expanded={whatsNewOpen}
          aria-haspopup="dialog"
          className={`${MAP_BADGE} h-8 ${MAP_BADGE_LABEL} whitespace-nowrap hover:text-[var(--text-primary)]`}
        >
          v{shortVersion(appVersion)} · What's new
        </button>
      )}
      <a
        href={feedbackHref}
        onClick={() => trackEvent('feedback_opened', { source: 'map_attribution' })}
        className={`${MAP_BADGE} h-8 ${MAP_BADGE_LABEL} no-underline hover:text-[var(--text-primary)]`}
      >
        Feedback
      </a>
      <div className={`${MAP_BADGE} h-8`}>
        <p className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>
          <OutboundLink
            href="https://www.openstreetmap.org/copyright"
            kind="attribution"
            className={ATTRIB_LINK}
          >
            OpenStreetMap
          </OutboundLink>
          <span className={MAP_BADGE_LABEL}> · </span>
          <OutboundLink
            href="https://carto.com/attributions"
            kind="attribution"
            className={ATTRIB_LINK}
          >
            CARTO
          </OutboundLink>
        </p>
      </div>
    </div>
    {whatsNewEnabled && whatsNewOpen && (
      <WhatsNewPanel onClose={closeWhatsNew} includeBeta={FEATURES.whatsNewBetaItems} />
    )}
    </>
  );
}
