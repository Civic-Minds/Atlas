import { useInRouterContext, useNavigate, type NavigateFunction } from 'react-router';
import { HEADER_TAG_INTERNAL } from '../../shared/siteMode';
import { INTERNAL_PATH } from '../../shared/pagePaths';

const TAG_CLASS = 'font-medium text-[var(--text-muted)]';

function InternalTag({ word }: { word: string }) {
  const navigate: NavigateFunction = useNavigate();
  const open = (e: { preventDefault(): void; stopPropagation(): void }) => { e.preventDefault(); e.stopPropagation(); navigate(INTERNAL_PATH); };
  // The tag sits inside the logo's link, so it can't be a link itself; it opens the local-only home page the same way.
  return (
    <span
      className={`${TAG_CLASS} cursor-pointer hover:text-[var(--text-primary)]`}
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={e => { if (e.key === 'Enter') open(e); }}
    > {word}</span>
  );
}

/**
 * The word beside the Atlas name that says which Atlas this is (CIV-1692). On the local site ("Internal", dev server only) it
 * also opens the local-only home page (CIV-1872); Beta stays plain text.
 */
export default function ModeTag({ word }: { word: string }) {
  const inRouter = useInRouterContext();
  if (word === HEADER_TAG_INTERNAL && inRouter) return <InternalTag word={word} />;
  return <span className={TAG_CLASS}> {word}</span>;
}
