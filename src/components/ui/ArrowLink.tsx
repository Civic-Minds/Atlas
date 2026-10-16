import type { ComponentPropsWithoutRef, ElementType } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';

const TONES = {
  /** A call to action on a page: accent, bold, with an underline on hover. */
  page: { link: 'inline-flex items-center gap-2 text-sm font-black text-[var(--accent)] hover:underline', icon: 'h-4 w-4' },
  /** A link inside a line of text, a panel or a card: accent, regular weight. */
  inline: { link: 'inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline', icon: 'h-3.5 w-3.5' },
  /** A link in the site header: takes the surrounding colour and darkens on hover. */
  quiet: { link: 'inline-flex items-center gap-1 hover:text-[var(--text-primary)]', icon: 'h-3.5 w-3.5' },
} as const;

type ArrowLinkProps<T extends ElementType> = {
  /** What it renders as: a link (default), a button, react-router's Link, OutboundLink, or a span inside a card that is itself a link. */
  as?: T;
  tone?: keyof typeof TONES;
  /** xs is the small text of side panels and cards. */
  size?: 'sm' | 'xs';
  /** The arrow slides right when a parent with `group` is hovered (for a span inside a clickable card). */
  nudge?: boolean;
  /** Points left, before the text ("back" links). */
  back?: boolean;
  /** Link to another site or open an outside page: the arrow is the shared external-link icon. */
  external?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, 'as'>;

/** Text with an arrow: the one "go here" link, so it looks and behaves the same on every page and panel. */
export default function ArrowLink<T extends ElementType = 'a'>(props: ArrowLinkProps<T>) {
  const { as, tone = 'page', size, nudge = false, back = false, external = false, className = '', children, ...rest } = props as {
    as?: ElementType; tone?: keyof typeof TONES; size?: 'sm' | 'xs'; nudge?: boolean; back?: boolean; external?: boolean; className?: string; children?: React.ReactNode;
  };
  const Tag: ElementType = as ?? 'a';
  const t = TONES[tone];
  const xs = size === 'xs';
  const Icon = external ? ExternalLink : back ? ArrowLeft : ArrowRight;
  const icon = (
    <Icon className={`${xs ? 'h-3 w-3' : t.icon}${nudge ? ' transition-transform group-hover:translate-x-1' : ''}`} aria-hidden="true" />
  );
  return (
    <Tag className={`${xs ? t.link.replace('text-sm', 'text-xs') : t.link} ${className}`.trim()} {...(Tag === 'button' ? { type: 'button' } : {})} {...rest}>
      {back && icon}
      {children}
      {!back && icon}
    </Tag>
  );
}
