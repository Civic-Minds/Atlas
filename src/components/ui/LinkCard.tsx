import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { ChevronRight, ExternalLink, Mail } from 'lucide-react';
import AppLink from './AppLink';

const ICONS = { chevron: ChevronRight, external: ExternalLink, mail: Mail } as const;

const CARD = 'flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group';
const LABEL = 'text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors';

type LinkCardProps<T extends ElementType> = {
  /** What it renders as: a link (default), a button, or OutboundLink for leaving Atlas. */
  as?: T;
  /** Small icon on the right: where it goes (chevron = in Atlas, external = other site, mail = email). */
  icon?: keyof typeof ICONS;
  /** A card that opens a part below it (Schedule sources' credits): set when open; the chevron turns down. */
  expanded?: boolean;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children'>;

/** Bordered row with a label and a small icon, used for links and actions in panels. */
export default function LinkCard<T extends ElementType = 'a'>(props: LinkCardProps<T>) {
  const { as, icon, expanded, children, className = '', ...rest } = props as { as?: ElementType; icon?: keyof typeof ICONS; expanded?: boolean; children: ReactNode; className?: string };
  const plainHref = !as && typeof (rest as { href?: unknown }).href === 'string' ? (rest as { href: string }).href : null;
  if (plainHref != null) { delete (rest as { href?: string }).href; (rest as { to?: string }).to = plainHref; }
  const Tag: ElementType = as ?? (plainHref != null ? AppLink : 'a');
  const Icon = icon ? ICONS[icon] : null;
  return (
    <Tag className={`${Tag === 'button' ? 'w-full text-left ' : ''}${CARD} ${className}`.trim()} {...(Tag === 'button' ? { type: 'button' } : {})} {...(expanded != null ? { 'aria-expanded': expanded } : {})} {...rest}>
      <span className={LABEL}>{children}</span>
      {/* Never squeezed by a long label: every card's icon is the same size (CIV-461). */}
      {Icon && <Icon aria-hidden className={`w-3 h-3 shrink-0 ml-2 text-[var(--text-dim)] transition-transform${expanded ? ' rotate-90' : ''}`} />}
    </Tag>
  );
}
