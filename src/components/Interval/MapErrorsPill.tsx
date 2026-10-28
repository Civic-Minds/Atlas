import { useEffect, useRef, useState } from 'react';
import { MAP_ERRORS_PILL } from '../../content/noticeCopy';
import { MAP_BADGE, MAP_NOTICE_SLOT, Z_PANEL } from '../../styles';
import ListRow from '../ui/ListRow';
import Panel from '../ui/Panel';

/**
 * Phones (CIV-1057): the map's error notices as one "Error" pill, so they never stack; a tap lists them. The list keeps
 * the messages it opened with until it closes, so a hint that times out doesn't empty it mid-read.
 */
export default function MapErrorsPill({ messages }: { messages: readonly string[] }) {
  const [listed, setListed] = useState<readonly string[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!listed) return;
    const close = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setListed(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [listed]);
  if (!messages.length && !listed) return null;
  return (
    <div className={`${MAP_NOTICE_SLOT} ${Z_PANEL} pointer-events-none`} data-map-overlay="notice">
      <div ref={rootRef} className="relative pointer-events-auto">
        {listed && (
          <Panel className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[min(18rem,calc(100vw-3rem))]">
            {listed.map(message => (
              <ListRow key={message} as="div" className="text-xs text-[var(--text-muted)] cursor-default">{message}</ListRow>
            ))}
          </Panel>
        )}
        <button
          type="button"
          aria-expanded={listed != null}
          onClick={() => setListed(listed ? null : messages)}
          className={`${MAP_BADGE} h-8 max-sm:h-[32px] px-3 py-1.5 text-xs text-[var(--text-muted)] cursor-pointer`}
        >
          {MAP_ERRORS_PILL}
        </button>
      </div>
    </div>
  );
}
