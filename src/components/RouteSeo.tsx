import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { ATLAS_MODE, FEATURES } from '../../shared/config';
import { resolveSeo } from '../../shared/seo';
import { applySeoToDocument } from '../lib/seoDom';

/** Sets the page title, description, canonical and robots tags for the current route. */
export default function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const seo = resolveSeo(pathname, {
      mode: ATLAS_MODE,
      flags: {
        researchApps: FEATURES.researchApps,
        whatsNew: FEATURES.whatsNew,
        live: FEATURES.live,
        history: FEATURES.history,
      },
      // Production keeps the real site address; staging builds describe the host they run on.
      origin: ATLAS_MODE === 'public' ? undefined : window.location.origin,
    });
    applySeoToDocument(document, seo);
  }, [pathname]);
  return null;
}
