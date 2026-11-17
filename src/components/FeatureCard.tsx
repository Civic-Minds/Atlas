import type { ReactNode } from 'react';
import Card, { CARD_TITLE, cardTint } from './ui/Card';

/** The card tint, under its older name (CIV-1789: it lives in the base Card). */
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
 * passes `flip` on every second card.
 */
export default function FeatureCard({ title, color, picture, flip = false, children }: {
  title: string;
  color: string;
  /** The picture's path without its ending (FeatureCardPicture), or null for a card with no picture yet. */
  picture: string | null;
  /** Picture on the left on desktop. */
  flip?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      as="section"
      tone={{ tint: color }}
      padding="roomy"
      className={`grid gap-8 lg:items-start lg:gap-10 ${flip ? 'lg:grid-cols-[1.1fr_0.9fr]' : 'lg:grid-cols-[0.9fr_1.1fr]'}`}
      data-picture-side={picture ? (flip ? 'left' : 'right') : undefined}
    >
      <div className={flip ? 'lg:order-2' : undefined}>
        <h2 className={CARD_TITLE}>{title}</h2>
        <div className="mt-3 space-y-3 text-base leading-7 text-[var(--text-muted)]">{children}</div>
      </div>
      <div className={flip ? 'lg:order-1' : undefined}>{picture && <FeatureCardPicture base={picture} />}</div>
    </Card>
  );
}
