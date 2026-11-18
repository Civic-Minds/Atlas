import type { ElementType, ReactNode } from 'react';
import { SHOW_PLACEHOLDERS, devPlaceholder } from '../../shared/devPlaceholder';

export { SHOW_PLACEHOLDERS, devPlaceholder };

/** Wording Ryan hasn't given yet, as an element (shared/devPlaceholder.ts says why and where it shows). */
export function DevPlaceholder({ what, as: Tag = 'span', className, id }: { what: string; as?: ElementType; className?: string; id?: string }): ReactNode {
  return SHOW_PLACEHOLDERS ? <Tag id={id} className={className}>{devPlaceholder(what)}</Tag> : null;
}
