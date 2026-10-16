import PageShell from './ui/PageShell';
import ArrowLink from './ui/ArrowLink';
import { PageTitle } from './ui/PageTitle';

/**
 * Shown instead of a silent redirect when someone opens /apps/live in a local copy where Live is switched off.
 * (Deployments keep the redirect: Live does not exist there.)
 */
export default function LiveOffNotice() {
  return (
    <PageShell variant="wide">
      <PageTitle className="mt-24">Live is switched off in this copy of Atlas</PageTitle>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
        Live only runs on your own computer. Start it with <code className="font-black">npm run live</code> and open <code className="font-black">/apps/live</code> on the address it prints.
      </p>
      <ArrowLink href="/" className="mt-6">Open the Atlas map</ArrowLink>
    </PageShell>
  );
}
