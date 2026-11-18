import { useEffect, useMemo, useRef } from 'react';
import { FLOATING_CARD, Z_MODAL_TOP, CARD_NOTE } from '../styles';
import { agencyNames } from '../utils/agencyName';
import { loadingText } from '../content/noticeCopy';

type NamedAgency = { slug: string; name: string; cities?: string[]; displayArea?: string };

/**
 * CIV-1861: what a dimmed Live or History tab says when tapped. It names the cities that have the view
 * (the lists come from their shared sources, passed in as slugs) and each one jumps there.
 */
export default function ModeUnavailableNote({ mode, slugs, agencies, onJump, onClose }: {
  mode: 'Live' | 'History';
  slugs: readonly string[];
  agencies: readonly NamedAgency[];
  onJump: (slug: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    const wanted = new Set(slugs);
    return agencies
      .filter(a => wanted.has(a.slug))
      .map(a => ({ slug: a.slug, ...agencyNames(a).list }))
      .sort((a, b) => a.primary.localeCompare(b.primary));
  }, [slugs, agencies]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // The tabs toggle the note themselves.
      if (!ref.current?.contains(target) && !target?.closest('[data-mode-tab]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Where ${mode} is available`}
      className={`fixed top-16 left-3 right-3 sm:right-auto sm:w-72 ${FLOATING_CARD} p-3 flex flex-col gap-2 ${Z_MODAL_TOP} pointer-events-auto`}
    >
      <p className="text-xs font-bold text-[var(--text-primary)]">{mode} isn’t available here. These cities have it:</p>
      {rows.length === 0 ? (
        <p className={CARD_NOTE}>{loadingText('the list')}</p>
      ) : (
        <ul className="flex flex-col max-h-64 overflow-y-auto -mx-1">
          {rows.map(r => (
            <li key={r.slug}>
              <button
                type="button"
                onClick={() => onJump(r.slug)}
                className="w-full text-left px-1 py-1.5 rounded text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]"
              >
                {r.primary}{r.secondary && <span className="font-normal text-[var(--text-dim)]"> · {r.secondary}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
