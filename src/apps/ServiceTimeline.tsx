import React from 'react';
import { getTimelineHeadwayColor } from '../utils/colors';
import { TIME_PERIODS, formatPeriodRangeLong } from '../../shared/config';
import { type RouteGroup } from './corridor-types';
import { fmtHeadway } from '../utils/format';
import type { StopEntry } from './corridor-search';

const TIMELINE_PERIODS = TIME_PERIODS.map(p => ({
  key: p.key,
  label: p.label,
  time: formatPeriodRangeLong(p.startHour, p.endHour),
  flex: 1,
}));

const LABEL_W = 136;

export function ServiceTimeline({
  results,
  fromStop,
  toStop,
  day,
}: {
  results: RouteGroup[];
  fromStop: StopEntry | null;
  toStop: StopEntry | null;
  day: string;
}) {
  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--text-muted)] text-xs text-center">
        No direct service found between these stations
      </div>
    );
  }

  return (
    <div className="overflow-y-auto px-4 py-3">
      <p className="text-[10px] font-bold text-[var(--text-muted)] tracking-wide mb-3">
        {results.length} route{results.length !== 1 ? 's' : ''} · {day}
      </p>

      <div className="flex items-end mb-2">
        <div style={{ width: LABEL_W }} className="shrink-0" />
        {TIMELINE_PERIODS.map(p => (
          <div key={p.key} className="flex-1 flex flex-col">
            <span className="text-[10px] font-bold text-[var(--text-primary)] leading-none">{p.label}</span>
            <span className="text-[9px] text-[var(--text-dim)] mt-0.5">{p.time}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {results.map((g, gi) => (
          <div key={gi}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0"
                style={{ backgroundColor: g.color || '#555' }}
              >
                {g.routeShortName}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">{g.agencyName}</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {g.branches.map((b, bi) => {
                const hw = Object.values(b.fromStopHeadwayByPeriod).some(v => v != null)
                  ? b.fromStopHeadwayByPeriod
                  : Object.values(b.toStopHeadwayByPeriod).some(v => v != null)
                    ? b.toStopHeadwayByPeriod
                    : b.headwayByPeriod;
                return (
                  <div key={bi} className="flex items-center gap-1">
                    <div className="shrink-0 pr-2" style={{ width: LABEL_W }}>
                      <span className="text-[10px] text-[var(--text-muted)] truncate block">
                        to {b.headsign || b.routeLongName}
                      </span>
                    </div>
                    <div className="flex flex-1 rounded overflow-hidden h-7 gap-px">
                      {TIMELINE_PERIODS.map(p => {
                        const val = hw[p.key] ?? null;
                        const { bg, fg } = getTimelineHeadwayColor(val);
                        return (
                          <div key={p.key} className="flex flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
                            <span className="text-[10px] font-bold" style={{ color: fg }}>{fmtHeadway(val, 'compact')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <span className="text-[9px] text-[var(--text-dim)] uppercase tracking-wider font-bold">Frequency</span>
        {[
          { label: '≤10 min', hw: 10 },
          { label: '≤15 min', hw: 15 },
          { label: '≤20 min', hw: 20 },
          { label: '≤30 min', hw: 30 },
          { label: '≤60 min', hw: 60 },
          { label: '>60 min', hw: 120 },
        ].map(({ label, hw }) => {
          const { bg } = getTimelineHeadwayColor(hw);
          return (
            <div key={label} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: bg }} />
              <span className="text-[9px] text-[var(--text-muted)]">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
