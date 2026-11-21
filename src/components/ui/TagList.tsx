import AppLink from './AppLink';
import Tag from './Tag';
import { MISSING_VALUE } from '../../../shared/missingValue';

/** A tag that opens its page (pointer and hover as the shared pills), or a plain tag where there is no page to open. */
export interface TagListItem { label: string; to?: string }

/**
 * CIV-2003: a table cell's small tags (the agencies page's Tag), all on one line; a dash when none apply. Studio's
 * Coverage table lists each agency's views this way.
 */
export default function TagList({ tags }: { tags: readonly TagListItem[] }) {
  return tags.length === 0
    ? <>{MISSING_VALUE}</>
    : <span className="inline-flex flex-nowrap justify-end gap-1 whitespace-nowrap">
        {tags.map(p => p.to
          ? <AppLink key={p.label} to={p.to}><Tag size="inline" className="hover:border-[var(--accent-border)] hover:text-[var(--text-primary)] transition-colors">{p.label}</Tag></AppLink>
          : <Tag key={p.label} size="inline">{p.label}</Tag>)}
      </span>;
}
