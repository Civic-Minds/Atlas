import EmptyPage from './ui/EmptyPage';
import ArrowLink from './ui/ArrowLink';
import { LIVE_OFF_BODY, LIVE_OFF_TITLE } from '../content/noticeCopy';

/**
 * Shown instead of a silent redirect when someone opens /apps/live in a local copy where Live is switched off.
 * (Deployments keep the redirect: Live does not exist there.)
 */
export default function LiveOffNotice() {
  return (
    <EmptyPage
      title={LIVE_OFF_TITLE}
      body={<>{LIVE_OFF_BODY.start} <code className="font-black">{LIVE_OFF_BODY.command}</code> {LIVE_OFF_BODY.middle} <code className="font-black">{LIVE_OFF_BODY.path}</code> {LIVE_OFF_BODY.end}</>}
      action={<ArrowLink href="/">Open the Atlas map</ArrowLink>}
    />
  );
}
