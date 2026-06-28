import React, { useEffect, useRef, useState, useMemo } from 'react';
import { HEADWAY_TIERS } from '../../shared/config';
import { useServiceQualityMapOverlay, type SQStop } from '../context/ServiceQualityMapOverlay';
import type { Agency } from '../App';

const THRESHOLDS = [
  { label: '≤10 min', value: 10 },
  { label: '≤15 min', value: 15 },
  { label: '≤20 min', value: 20 },
  { label: '≤30 min', value: 30 },
  { label: 'All', value: 999 },
];

interface Props {
  agencies: Agency[];
  active: boolean;
}

type StopsRecord = Record<string, { name: string; lat: number; lon: number; hw?: number }>;

export default function ServiceQuality({ agencies, active }: Props) {
  const { setOverlay } = useServiceQualityMapOverlay();
  const [threshold, setThreshold] = useState(15);
  const [allStops, setAllStops] = useState<SQStop[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!active || loadedRef.current) return;
    loadedRef.current = true;

    const urls = agencies.filter(a => a.stopsUrl).map(a => a.stopsUrl!);
    if (urls.length === 0) return;

    setLoading(true);
    const CHUNK = 10;
    const collected: SQStop[] = [];

    (async () => {
      for (let i = 0; i < urls.length; i += CHUNK) {
        const batch = urls.slice(i, i + CHUNK);
        const results = await Promise.allSettled(batch.map(u => fetch(u).then(r => r.json() as Promise<StopsRecord>)));
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          for (const entry of Object.values(r.value)) {
            if (entry.hw == null) continue;
            collected.push({ lon: entry.lon, lat: entry.lat, hw: entry.hw });
          }
        }
        setAllStops([...collected]);
      }
      setLoading(false);
    })();
  }, [active, agencies]);

  // Clear overlay on deactivate
  useEffect(() => {
    if (!active) {
      setOverlay(null);
      return;
    }
  }, [active, setOverlay]);

  useEffect(() => {
    if (!active || allStops.length === 0) return;
    setOverlay({ stops: allStops, threshold });
  }, [active, allStops, threshold, setOverlay]);

  const visibleCount = useMemo(
    () => allStops.filter(s => s.hw <= threshold).length,
    [allStops, threshold]
  );

  if (!active) return null;

  return (
    <div className="absolute top-0 right-0 h-full flex items-start justify-end pt-6 pr-4 pointer-events-none z-[500]">
      <div className="pointer-events-auto w-64 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-[var(--border-primary)]">
          <p className="text-xs font-black text-[var(--text-primary)]">Service Quality</p>
          <p className="text-[10px] text-[var(--text-dim)] mt-0.5">Best weekday headway per stop</p>
        </div>

        <div className="px-4 py-3 border-b border-[var(--border-primary)]">
          <p className="text-[10px] font-bold text-[var(--text-muted)] mb-2">Show stops with</p>
          <div className="flex flex-wrap gap-1.5">
            {THRESHOLDS.map(t => (
              <button
                key={t.value}
                onClick={() => setThreshold(t.value)}
                className={[
                  'px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors',
                  threshold === t.value
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-b border-[var(--border-primary)]">
          <p className="text-[10px] font-bold text-[var(--text-muted)] mb-2">Legend</p>
          <div className="space-y-1.5">
            {HEADWAY_TIERS.filter(t => t.max !== Infinity).map(t => (
              <div key={t.max} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: t.color }}
                />
                <span className="text-[10px] text-[var(--text-dim)]">{t.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#6b7280' }} />
              <span className="text-[10px] text-[var(--text-dim)]">Infrequent (&gt;60 min)</span>
            </div>
          </div>
        </div>

        <div className="px-4 py-3">
          {loading ? (
            <p className="text-[10px] text-[var(--text-dim)]">Loading stop data…</p>
          ) : (
            <div className="space-y-0.5">
              <p className="text-xs font-black text-[var(--text-primary)]">
                {visibleCount.toLocaleString()}
              </p>
              <p className="text-[10px] text-[var(--text-dim)]">
                stops with service {threshold === 999 ? 'shown' : `≤${threshold} min`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

