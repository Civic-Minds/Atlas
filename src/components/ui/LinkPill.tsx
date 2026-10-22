import { ArrowRight } from 'lucide-react';
import Pill from './Pill';

/** A pill that is a link to another page in Atlas: the pill look with the same trailing arrow as ArrowLink. Always one line: a long name is cut with an ellipsis (full text in the tooltip and label), the arrow stays. */
export default function LinkPill({ href, children, className = '' }: { href: string; children: string; className?: string }) {
  return (
    <Pill as="a" tone="outline" href={href} title={children} aria-label={children} className={`inline-flex max-w-full items-center gap-1 ${className}`.trim()}>
      <span className="min-w-0 truncate">{children}</span>
      <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
    </Pill>
  );
}
