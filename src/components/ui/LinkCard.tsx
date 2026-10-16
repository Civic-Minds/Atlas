import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { ChevronRight, ExternalLink, Mail } from 'lucide-react';

const ICONS = { chevron: ChevronRight, external: ExternalLink, mail: Mail } as const;

const CARD = 'flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-primary)] hover:border-[var(--accent)] transition-colors group';
const LABEL = 'text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors';

type LinkCardProps<T extends ElementType> = {
  /** What it renders as: a link (default), a button, or OutboundLink for leaving Atlas. */
  as?: T;
  /** Small icon on the right: where it goes (chevron = in Atlas, external = other site, mail = email). */
  icon?: keyof typeof ICONS;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children'>;

/** Bordered row with a label and a small icon, used for links and actions in panels. */
export default function LinkCard<T extends ElementType = 'a'>(props: LinkCardProps<T>) {
  const { as, icon, children, className = '', ...rest } = props as { as?: ElementType; icon?: keyof typeof ICONS; children: ReactNode; className?: string };
  const Tag: ElementType = as ?? 'a';
  const Icon = icon ? ICONS[icon] : null;
  return (
    <Tag className={`${Tag === 'button' ? 'w-full ' : ''}${CARD} ${className}`.trim()} {...(Tag === 'button' ? { type: 'button' } : {})} {...rest}>
      <span className={LABEL}>{children}</span>
      {Icon && <Icon className="w-3 h-3 text-[var(--text-dim)]" />}
    </Tag>
  );
}
