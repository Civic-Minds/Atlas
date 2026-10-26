import React from 'react';
import { routeLabels } from '../../../utils/format';
import { PANEL_ENTER, LIST_ROW_PRIMARY, SIDEBAR_CARD_SURFACE } from '../../../styles';
import ListRow from '../../ui/ListRow';
import AgencyGroupHeader from '../../ui/AgencyGroupHeader';

export interface DisambigRoute {
  key: string;
  shortName: string;
  longName: string;
  agencyName: string;
  agencySlug?: string;
  routeType?: number;
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
    <div className={`${SIDEBAR_CARD_SURFACE} ${PANEL_ENTER} max-h-[380px] overflow-y-auto custom-scrollbar`}>
      <div>
        {groups.map(g => (
          <div key={g.agencyName}>
            {g.agencyName && (
              <AgencyGroupHeader rule="none">{g.agencyName}</AgencyGroupHeader>
            )}
            {g.routes.map(r => (
              <ListRow
                key={r.key}
                onClick={() => { setSelectedRoute(r.key); setDisambiguationRoutes(null); }}
              >
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className={LIST_ROW_PRIMARY}>
                    {routeLabels({ shortName: r.shortName, longName: r.longName, routeType: r.routeType, agencySlug: r.agencySlug, agencyName: r.agencyName }).text}
                  </span>
                </div>
              </ListRow>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
