import FeatureCard from './FeatureCard';
import { titleCase } from '../../shared/titleCase';
import { REQUEST_DEMO_LABEL, REQUEST_DEMO_TEXT } from '../content/noticeCopy';

const CONTACT_EMAIL = 'hey@ryanisnota.pro';
const pic = (name: string) => `/assets/planners/${name}`;

/**
 * The Request a demo card (CIV-1706; Ryan, 2026-11-16: "no i meant like a feature card", and "we could refactor the demo
 * card and have it on other pages too potentially"). One card for every page that asks for a demo: the same feature
 * card, its words from noticeCopy, and the button where the other cards put their link. Its picture is the local
 * Studio page for Kingston (CIV-1680) in the CIV-1701 card-picture layout, made by scripts/planner-pictures/capture.mts
 * like the other cards' (CIV-1767): Kingston's faded frequency map with Studio's changes list at the bottom right, at the
 * same width and scale as the other cards' controls, 4:3, with a smaller version for phones and a light and a dark one.
 */
export default function RequestDemoCard({ color }: { color: string }) {
  return (
    <FeatureCard title={titleCase(REQUEST_DEMO_LABEL)} color={color} picture={pic('card-demo')}>
      <p>{REQUEST_DEMO_TEXT}</p>
      <div className="flex flex-wrap gap-3 pt-2">
        <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(REQUEST_DEMO_LABEL)}`} className="inline-flex h-11 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">{REQUEST_DEMO_LABEL}</a>
      </div>
    </FeatureCard>
  );
}
