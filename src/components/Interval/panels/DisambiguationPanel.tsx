import React from 'react';
import { titleCase, getRouteLabel } from '../../../utils/format';
import { FLOATING_CARD, PANEL_ENTER, LIST_ROW, LIST_ROW_PRIMARY } from '../../../styles';

export interface DisambigRoute {
  key: string;
  shortName: string;
  longName: string;
  agencyName: string;
  color: string;
}

export interface DisambiguationPanelProps {
  disambigDetails: DisambigRoute[];
  setSelectedRoute: (r: string | null) => void;
  setDisambiguationRoutes: (routes: string[] | null) => void;
}

export const DisambiguationPanel: React.FC<DisambiguationPanelProps> = ({
  disambigDetails,
  setSelectedRoute,
  setDisambiguationRoutes,
}) => {
  const groups: { agencyName: string; routes: DisambigRoute[] }[] = [];
  for (const r of disambigDetails) {
    const last = groups[groups.length - 1];
    if (last && last.agencyName === r.agencyName) last.routes.push(r);
    else groups.push({ agencyName: r.agencyName, routes: [r] });
  }

  return (
    <div className={`${FLOATING_CARD} ${PANEL_ENTER} max-h-[380px] overflow-y-auto custom-scrollbar`}>
      <div>
        {groups.map(g => (
          <div key={g.agencyName}>
            {g.agencyName && (
              <div className="px-4 pt-2.5 pb-1">
                <span className="text-[10px] font-black tracking-wide text-[var(--text-dim)]">{g.agencyName}</span>
              </div>
            )}
            {g.routes.map(r => (
              <button
                key={r.key}
                onClick={() => { setSelectedRoute(r.key); setDisambiguationRoutes(null); }}
                className={LIST_ROW}
              >
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className={LIST_ROW_PRIMARY}>
                    {titleCase(getRouteLabel(r.shortName, r.longName, r.agencyName))}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
