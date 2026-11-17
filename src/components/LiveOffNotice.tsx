import EmptyPage from './ui/EmptyPage';
import ArrowLink from './ui/ArrowLink';
import { LIVE_OFF_BODY, LIVE_OFF_TITLE, MAP_LINK } from '../content/noticeCopy';
import { LIVE_REPORT_UNAVAILABLE } from '../lib/liveReportData';

/**
 * Shown instead of a silent redirect when someone opens /apps/live in a local copy where Live is switched off.
 * (Deployments keep the redirect: Live does not exist there.) A Live report page (`report`) says only the approved line
 * for a report that can't load, with the way back to the map (CIV-1795).
 */
export default function LiveOffNotice({ report = false }: { report?: boolean }) {
  // A sentence, not a heading's fixed words: kept as written, not title-cased.
  if (report) return <EmptyPage title={<>{LIVE_REPORT_UNAVAILABLE}</>} action={<ArrowLink href="/">{MAP_LINK}</ArrowLink>} />;
  return (
    <EmptyPage
      title={LIVE_OFF_TITLE}
      body={<>{LIVE_OFF_BODY.start} <code className="font-black">{LIVE_OFF_BODY.command}</code> {LIVE_OFF_BODY.middle} <code className="font-black">{LIVE_OFF_BODY.path}</code> {LIVE_OFF_BODY.end}</>}
      action={<ArrowLink href="/">{MAP_LINK}</ArrowLink>}
    />
  );
}
