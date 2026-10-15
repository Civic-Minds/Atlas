import type { ComponentPropsWithoutRef, ElementType } from 'react';
import { ArrowRight } from 'lucide-react';

const TONES = {
  /** A call to action on a page: accent, bold, with an underline on hover. */
  page: { link: 'inline-flex items-center gap-2 text-sm font-black text-[var(--accent)] hover:underline', icon: 'h-4 w-4' },
  /** A link inside a line of text or under a title: accent, regular weight. */
  inline: { link: 'inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline', icon: 'h-3.5 w-3.5' },
  /** A link in the site header: takes the surrounding colour and darkens on hover. */
  quiet: { link: 'inline-flex items-center gap-1 hover:text-[var(--text-primary)]', icon: 'h-3.5 w-3.5' },
} as const;

type ArrowLinkProps<T extends ElementType> = {
  /** What it renders as: a link (default), react-router's Link, or a span inside a card that is itself a link. */
  as?: T;
  tone?: keyof typeof TONES;
  /** The arrow slides right when a parent with `group` is hovered (for a span inside a clickable card). */
  nudge?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, 'as'>;

/** Text followed by an arrow: the one "go here" link, so it looks and behaves the same on every page. */
export default function ArrowLink<T extends ElementType = 'a'>(props: ArrowLinkProps<T>) {
  const { as, tone = 'page', nudge = false, className = '', children, ...rest } = props as { as?: ElementType; tone?: keyof typeof TONES; nudge?: boolean; className?: string; children?: React.ReactNode };
  const Tag: ElementType = as ?? 'a';
  const t = TONES[tone];
  return (
    <Tag className={`${t.link} ${className}`.trim()} {...rest}>
      {children}
      <ArrowRight className={`${t.icon}${nudge ? ' transition-transform group-hover:translate-x-1' : ''}`} aria-hidden="true" />
    </Tag>
  );
}
