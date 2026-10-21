import { ArrowRight } from 'lucide-react';
import Pill from './Pill';

/** A pill that is a link to another page in Atlas: the pill look with the same trailing arrow as ArrowLink. Long text wraps inside it, the arrow staying with the last word. */
export default function LinkPill({ href, children, className = '' }: { href: string; children: string; className?: string }) {
  const cut = children.lastIndexOf(' ') + 1;
  return (
    <Pill as="a" tone="outline" href={href} className={`inline-block max-w-full text-left !whitespace-normal !rounded-[14px] ${className}`.trim()}>
      {children.slice(0, cut)}
      <span className="whitespace-nowrap">{children.slice(cut)}<ArrowRight className="ml-1 inline-block h-3 w-3 align-[-2px]" aria-hidden="true" /></span>
    </Pill>
  );
}
