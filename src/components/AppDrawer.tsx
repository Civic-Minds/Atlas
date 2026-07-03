import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeftRight, Clock, DollarSign } from 'lucide-react';
import { FLOATING_CARD, Z_DROPDOWN } from '../styles';

export type AppId = 'frequency' | 'corridors' | 'history' | 'live' | 'fares';

interface AppEntry {
  id: AppId;
  label: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
}

const APPS: AppEntry[] = [
  {
    id: 'corridors',
    label: 'Corridors',
    description: 'Routes connecting two stations',
    icon: <ArrowLeftRight className="w-5 h-5" />,
    available: true,
  },
  {
    id: 'fares',
    label: 'Fares',
    description: 'Routes colored by base fare',
    icon: <DollarSign className="w-5 h-5" />,
    available: false,
  },
  {
    id: 'history',
    label: 'History',
    description: 'Actual vs scheduled trip delays',
    icon: <Clock className="w-5 h-5" />,
    available: true,
  },
];

interface Props {
  activeApp: AppId;
  onSelect: (app: AppId) => void;
}

export default function AppDrawer({ activeApp, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open app drawer"
        className="w-8 h-8 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full flex items-center justify-center shadow-2xl hover:bg-[var(--bg-hover)] transition-colors"
      >
        <WaffleIcon active={open} />
      </button>

      {open && (
        <div className={`absolute top-10 left-0 w-56 ${FLOATING_CARD} overflow-hidden ${Z_DROPDOWN} py-1.5 cursor-default`}>
          {APPS.map(app => {
            const isActive = app.id === activeApp;
            return (
              <button
                key={app.id}
                disabled={!app.available || isActive}
                onClick={() => {
                  if (app.available && !isActive) {
                    onSelect(app.id);
                    setOpen(false);
                  }
                }}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  isActive
                    ? 'opacity-40 cursor-default'
                    : app.available
                      ? 'hover:bg-[var(--bg-hover)] cursor-pointer'
                      : 'opacity-40 cursor-not-allowed',
                ].join(' ')}
              >
                <span className="text-[var(--text-dim)]">{app.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                      {app.label}
                    </span>
                    {!app.available && (
                      <span className="text-[9px] font-bold text-[var(--text-muted)] bg-[var(--bg-active)] rounded px-1 py-0.5 shrink-0">
                        soon
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">{app.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WaffleIcon({ active }: { active: boolean }) {
  const color = active ? 'var(--accent)' : 'var(--text-dim)';
  const centers = [2, 7, 12];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      {centers.flatMap(cy =>
        centers.map(cx => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill={color} />
        ))
      )}
    </svg>
  );
}
