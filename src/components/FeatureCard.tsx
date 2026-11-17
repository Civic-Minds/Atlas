import type { ReactNode } from 'react';
import Card, { CARD_TITLE, cardTint } from './ui/Card';
import Tag from './ui/Tag';
import { BETA_TAG } from '../../shared/siteMode';

/** @public The card tint, under its older name (CIV-1789: it lives in the base Card). Kept while open branches
 * (civ-1709, civ-1721, civ-1768) still import it from here; remove once they merge. */
export const featureTint = cardTint;

const PICTURE = 'block aspect-[4/3] w-full rounded-xl border border-[var(--border-primary)] object-cover';

/**
 * A feature card's picture (CIV-1701): a faded real map with the card's own app control, 4:3 so the cards line up, in a
 * light and a dark version, and a smaller version for phones so the control's rows still read. `base` is the path
 * without its ending: `${base}-desktop-light.webp`, `${base}-phone-dark.webp` and so on (scripts/planner-pictures/capture.mts).
 */
export function FeatureCardPicture({ base }: { base: string }) {
  return (
    <>
      {(['light', 'dark'] as const).map(theme => (
        <picture key={theme} className={`block ${theme === 'light' ? 'theme-light-only' : 'theme-dark-only'}`}>
          <source media="(max-width: 639px)" srcSet={`${base}-phone-${theme}.webp`} />
          <img src={`${base}-desktop-${theme}.webp`} alt="" className={PICTURE} />
        </picture>
      ))}
    </>
  );
}

/**
 * The one feature card (CIV-1754): a tinted card, its heading and text beside its picture, stacked on phones with the
 * picture under the text. Made for the For Transit Planners page (CIV-1320) and shared by the Request a demo card
 * (CIV-1706). In a run of cards the picture side alternates on desktop, right then left (Ryan, 2026-11-16): the page
 * passes `flip` on every second card. A card with no picture has no picture column: its text runs across the card at a
 * readable width (CIV-1709, Ryan: "half of this is empty"). A card for a tool still in beta passes `beta`: the shared
 * "Beta" tag sits beside its title, outside the heading, so the heading still reads only the title (CIV-1793).
 */
export default function FeatureCard({ title, color, picture, flip = false, beta = false, children }: {
  title: string;
  color: string;
  /** The picture's path without its ending (FeatureCardPicture), or null for a card with no picture yet. */
  picture: string | null;
  /** Picture on the left on desktop. */
  flip?: boolean;
  /** Shows the "Beta" tag beside the title. */
  beta?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      as="section"
      tone={{ tint: color }}
      padding="roomy"
      className={picture ? `grid gap-8 lg:items-start lg:gap-10 ${flip ? 'lg:grid-cols-[1.1fr_0.9fr]' : 'lg:grid-cols-[0.9fr_1.1fr]'}` : undefined}
      data-picture-side={picture ? (flip ? 'left' : 'right') : undefined}
    >
      <div className={picture && flip ? 'lg:order-2' : undefined}>
        {beta
          ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 className={CARD_TITLE}>{title}</h2><Tag tone="accent" className="text-xs">{BETA_TAG}</Tag></div>
          : <h2 className={CARD_TITLE}>{title}</h2>}
        <div className={`mt-3 space-y-3 text-base leading-7 text-[var(--text-muted)]${picture ? '' : ' max-w-2xl'}`}>{children}</div>
      </div>
      {picture && <div className={flip ? 'lg:order-1' : undefined}><FeatureCardPicture base={picture} /></div>}
    </Card>
  );
}
