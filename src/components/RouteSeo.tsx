import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { ATLAS_MODE, FEATURES, seoFlags } from '../../shared/config';
import { resolveSeo } from '../../shared/seo';
import { AGENCY_PATH_PREFIX } from '../../shared/agencyPages';
import { AREA_PATH_PREFIX } from '../../shared/areas';
import { AGENCY_INDEX_PATH } from '../../shared/agencyIndex';
import { applySeoToDocument } from '../lib/seoDom';

/** Sets the page title, description, canonical and robots tags for the current route. */
export default function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Agency pages set their own head once their data is in.
    if (FEATURES.agencyPages && (pathname.startsWith(AGENCY_PATH_PREFIX) || pathname.startsWith(AREA_PATH_PREFIX) || pathname === AGENCY_INDEX_PATH)) return;
    const seo = resolveSeo(pathname, {
      mode: ATLAS_MODE,
      flags: seoFlags(),
      // Production keeps the real site address; staging builds describe the host they run on.
      origin: ATLAS_MODE === 'public' ? undefined : window.location.origin,
    });
    applySeoToDocument(document, seo);
  }, [pathname]);
  return null;
}
