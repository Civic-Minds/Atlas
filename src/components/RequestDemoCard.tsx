import FeatureCard from './FeatureCard';
import { titleCase } from '../../shared/titleCase';
import { mailto } from '../../shared/contact';
import { REQUEST_DEMO_LABEL, REQUEST_DEMO_TEXT } from '../content/noticeCopy';

/**
 * The Request a demo card (CIV-1706; Ryan, 2026-11-16: "no i meant like a feature card", and "we could refactor the demo
 * card and have it on other pages too potentially"). One card for every page that asks for a demo: the same feature
 * card, its words from noticeCopy, and the button where the other cards put their link. It has no picture
 * (Ryan, 2026-11-16: "Well the demo card can just not have a pic").
 */
export default function RequestDemoCard({ color }: { color: string }) {
  return (
    <FeatureCard title={titleCase(REQUEST_DEMO_LABEL)} color={color} picture={null}>
      <p>{REQUEST_DEMO_TEXT}</p>
      <div className="flex flex-wrap gap-3 pt-2">
        <a href={mailto(REQUEST_DEMO_LABEL)} className="inline-flex h-11 items-center rounded-full border border-[var(--border-primary)] px-5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)]">{REQUEST_DEMO_LABEL}</a>
      </div>
    </FeatureCard>
  );
}
