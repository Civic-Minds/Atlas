import PageShell from './ui/PageShell';
import ArrowLink from './ui/ArrowLink';
import { PageTitle } from './ui/PageTitle';
import { LIVE_OFF_BODY, LIVE_OFF_TITLE } from '../content/noticeCopy';

/**
 * Shown instead of a silent redirect when someone opens /apps/live in a local copy where Live is switched off.
 * (Deployments keep the redirect: Live does not exist there.)
 */
export default function LiveOffNotice() {
  return (
    <PageShell variant="wide">
      <PageTitle className="mt-24">{LIVE_OFF_TITLE}</PageTitle>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
        {LIVE_OFF_BODY.start} <code className="font-black">{LIVE_OFF_BODY.command}</code> {LIVE_OFF_BODY.middle} <code className="font-black">{LIVE_OFF_BODY.path}</code> {LIVE_OFF_BODY.end}
      </p>
      <ArrowLink href="/" className="mt-6">Open the Atlas map</ArrowLink>
    </PageShell>
  );
}
