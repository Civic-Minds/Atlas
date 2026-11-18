import FeatureCard from './FeatureCard';
import ArrowLink from './ui/ArrowLink';
import { titleCase } from '../../shared/titleCase';
import { mailto } from '../../shared/contact';
import { REQUEST_DEMO_LABEL } from '../content/noticeCopy';

/**
 * The Request a demo card (CIV-1706; Ryan, 2026-11-16: "no i meant like a feature card", and "we could refactor the demo
 * card and have it on other pages too potentially"). One card for every page that asks for a demo: the same feature
 * card, its words from noticeCopy, and the page's call-to-action link (ArrowLink) where the other cards put theirs; the
 * old outlined pill blended into the card's tint (Ryan, 2026-11-16: "the request a demo button looks odd here"). It has no picture
 * (Ryan, 2026-11-16: "Well the demo card can just not have a pic"), but keeps the picture's place so it is the same size as the others (CIV-1873). Each page passes its own `text` from noticeCopy, since
 * a demo means different things to planners and researchers (CIV-1793).
 */
export default function RequestDemoCard({ color, text, flip = false }: { color: string; text: string; flip?: boolean }) {
  return (
    <FeatureCard title={titleCase(REQUEST_DEMO_LABEL)} color={color} picture={null} flip={flip}>
      <p>{text}</p>
      <ArrowLink href={mailto(REQUEST_DEMO_LABEL)}>{REQUEST_DEMO_LABEL}</ArrowLink>
    </FeatureCard>
  );
}
