import type { CSSProperties, ElementType, ReactNode } from 'react';
import { SURFACE } from '../../styles';

/** A pale tint of a frequency colour on the page background: never a dark fill (docs/style/VISUAL.md). */
export const cardTint = (color: string) => `color-mix(in srgb, ${color} 11%, var(--bg-app))`;

/** A card's inner space, from a figure tile to a feature card. */
const CARD_PADDING = {
  none: '',
  tight: 'p-4',
  compact: 'p-5',
  regular: 'p-6',
  roomy: 'p-6 sm:p-8',
} as const;

/** The title of a feature card or an icon tile. */
export const CARD_TITLE = 'text-2xl font-black tracking-tight';

/**
 * The one base card (CIV-1789; Ryan, 2026-11-16: "they mostly all have the same visual style right"): the same corners
 * on every card, its background either a pale frequency-colour tint (`{ tint: color }`) or the panel surface with its
 * border, and one of a few paddings. FeatureCard, About's icon and story tiles, the /research cards and the research
 * pages' figure tiles are all this card; each keeps its own layout inside it. styleGuard fails on a card built by hand.
 */
export default function Card({ as: Tag = 'div', tone, padding = 'none', className = '', style, children, ...rest }: {
  as?: ElementType;
  tone: { tint: string } | 'surface';
  padding?: keyof typeof CARD_PADDING;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  [attr: string]: unknown;
}) {
  const surface = tone === 'surface';
  const classes = ['rounded-2xl', surface ? SURFACE : '', CARD_PADDING[padding], className].filter(Boolean).join(' ');
  return (
    <Tag className={classes} style={surface ? style : { ...style, background: cardTint(tone.tint) }} {...rest}>
      {children}
    </Tag>
  );
}
