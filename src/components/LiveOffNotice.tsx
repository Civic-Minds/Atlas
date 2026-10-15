import PageShell from './ui/PageShell';
import { PAGE_ACTION } from '../pageStyles';
import { ArrowRight } from 'lucide-react';

/**
 * Shown instead of a silent redirect when someone opens /apps/live in a local copy where Live is switched off.
 * (Deployments keep the redirect: Live does not exist there.)
 */
export default function LiveOffNotice() {
  return (
    <PageShell variant="wide">
      <h1 className="mt-24 text-3xl font-black tracking-tight">Live is switched off in this copy of Atlas</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
        Live only runs on your own computer. Start it with <code className="font-black">npm run live</code> and open <code className="font-black">/apps/live</code> on the address it prints.
      </p>
      <a href="/" className={`${PAGE_ACTION} mt-6`}>Open the Atlas map <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
    </PageShell>
  );
}
