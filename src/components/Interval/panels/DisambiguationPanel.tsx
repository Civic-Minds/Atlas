import React from 'react';
import { routeLabels } from '../../../utils/format';
import { PANEL_ENTER, LIST_ROW_PRIMARY, SIDEBAR_CARD_SURFACE } from '../../../styles';
import ListRow from '../../ui/ListRow';
import AgencyGroupHeader from '../../ui/AgencyGroupHeader';
import { CardBackLink } from '../../CardBack';
import RouteRowName from '../../RouteRowName';

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
      {/* Nothing comes before the chooser, so its back link closes it (CIV-929). */}
      <div className="px-4 pt-4">
        <CardBackLink onClick={() => setDisambiguationRoutes(null)}>Map</CardBackLink>
      </div>
      <div>
        {groups.map(g => (
          <div key={g.agencyName}>
            {g.agencyName && (
              <AgencyGroupHeader rule="none">{g.agencyName}</AgencyGroupHeader>
            )}
            {g.routes.map(r => {
              const label = routeLabels({ shortName: r.shortName, longName: r.longName, routeType: r.routeType, agencySlug: r.agencySlug, agencyName: r.agencyName });
              return (
              <ListRow
                key={r.key}
                variant="spaced"
                onClick={() => { setSelectedRoute(r.key); setDisambiguationRoutes(null); }}
              >
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className={LIST_ROW_PRIMARY}>
                    <RouteRowName shortName={label.primary} name={label.secondary} />
                  </span>
                </div>
              </ListRow>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
