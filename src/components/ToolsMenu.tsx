import React, { useEffect, useRef, useState } from 'react';
import { Table2, Wrench } from 'lucide-react';
import { FLOATING_CARD, Z_DROPDOWN } from '../styles';

export default function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-label="Tools"
        aria-expanded={open}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-panel)] hover:bg-[var(--bg-btn-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        <Wrench className="w-4 h-4" />
      </button>

      {open && (
        <div className={`absolute top-10 right-0 w-56 ${FLOATING_CARD} overflow-hidden ${Z_DROPDOWN} py-1.5`}>
          <a
            href="/apps/diagnostics"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors"
          >
            <Table2 className="w-5 h-5 text-[var(--text-dim)]" />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-[var(--text-primary)]">Diagnostics table</span>
              <span className="block text-[10px] text-[var(--text-muted)] truncate">Inspect route data across agencies</span>
            </span>
          </a>
        </div>
      )}
    </div>
  );
}
