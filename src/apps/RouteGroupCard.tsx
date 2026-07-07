import React from 'react';
import { type RouteGroup, fmtHeadway } from './corridor-types';

export function RouteGroupCard({ group }: { group: RouteGroup }) {
  return (
    <div className="bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span
          className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0"
          style={{ backgroundColor: group.color || '#555' }}
        >
          {group.routeShortName}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{group.agencyName}</span>
        {group.bestHeadway != null && (
          <span className="ml-auto text-xs font-black text-[var(--text-primary)]">
            {fmtHeadway(group.bestHeadway, 'compact')}
          </span>
        )}
      </div>

      <div className="divide-y divide-[var(--border-primary)]">
        {group.branches.map((b, i) => {
          const hw = b.toStopHeadway ?? b.headway;
          return (
            <div key={i} className="px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-muted)]">
                to {b.headsign || b.routeLongName}
              </span>
              {hw != null && (
                <span className="text-[11px] font-bold text-[var(--text-primary)]">
                  {fmtHeadway(hw, 'compact')}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
