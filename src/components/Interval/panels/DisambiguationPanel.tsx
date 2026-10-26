import React from 'react';
import { routeLabels } from '../../../utils/format';
import Panel, { PanelBody } from '../../ui/Panel';
import AgencyGroupHeader from '../../ui/AgencyGroupHeader';
import AgencyName from '../../ui/AgencyName';
import { CardBackLink } from '../../CardBack';
import RouteListRow from '../../RouteListRow';
import { CardReportButton } from '../cardUi';
import { reportDetails } from '../../../utils/reportIssue';

export interface DisambigRoute {
  key: string;
  shortName: string;
  /** The short name the label shows; blank when the feed has none but has a long name (#1099). Defaults to shortName. */
  labelShortName?: string;
  longName: string;
  agencyName: string;
  /** The agency's place, shown beside its name in the group heading ("TTC · Toronto"). */
  agencyPlace?: string;
  agencySlug?: string;
  routeType?: number;
  color: string;
}

export interface DisambiguationPanelProps {
  disambigDetails: DisambigRoute[];
  setSelectedRoute: (r: string | null) => void;
  setDisambiguationRoutes: (routes: string[] | null) => void;
}

/** What a report from the chooser sends (CIV-932): every route it lists, then the link (its `routes=` and map view). */
export function chooserReportDetails(routes: readonly DisambigRoute[]): string {
  return reportDetails([
    '**Routes listed:**',
    ...routes.map(r => `- ${r.agencyName}: ${routeLabels({ shortName: r.shortName, longName: r.longName, routeType: r.routeType, agencySlug: r.agencySlug, agencyName: r.agencyName }).text} (${r.key})`),
  ]);
}

export const DisambiguationPanel: React.FC<DisambiguationPanelProps> = ({
  disambigDetails,
  setSelectedRoute,
  setDisambiguationRoutes,
}) => {
  const groups: { agencyName: string; agencyPlace?: string; routes: DisambigRoute[] }[] = [];
  for (const r of disambigDetails) {
    const last = groups[groups.length - 1];
    if (last && last.agencyName === r.agencyName) last.routes.push(r);
    else groups.push({ agencyName: r.agencyName, agencyPlace: r.agencyPlace, routes: [r] });
  }

  return (
    // The shared card panel (CIV-971): its header stays put and only the routes scroll.
    <Panel sidebarSurface enter data-report-anchor="true" className="max-h-[380px]">
      {/* Nothing comes before the chooser, so its back link closes it (CIV-929). The report flag sits on the
          same line (CIV-932); its negative margin keeps the line its old height. */}
      <div className="shrink-0 px-4 pt-4 flex items-start justify-between gap-2">
        <CardBackLink onClick={() => setDisambiguationRoutes(null)}>Map</CardBackLink>
        <div className="-my-1">
          <CardReportButton
            title="Route chooser"
            details={chooserReportDetails(disambigDetails)}
            excludeReasons={['Stop is missing, misplaced, or assigned incorrectly']}
          />
        </div>
      </div>
      <PanelBody>
        {groups.map(g => (
          <div key={g.agencyName}>
            {g.agencyName && (
              <AgencyGroupHeader rule="none">
                <AgencyName primary={g.agencyName} secondary={g.agencyPlace} />
              </AgencyGroupHeader>
            )}
            {g.routes.map(r => {
              const label = routeLabels({ shortName: r.labelShortName ?? r.shortName, longName: r.longName, routeType: r.routeType, agencySlug: r.agencySlug, agencyName: r.agencyName });
              return (
                <RouteListRow
                  key={r.key}
                  shortName={label.primary}
                  name={label.secondary}
                  dotColor={r.color}
                  onClick={() => { setSelectedRoute(r.key); setDisambiguationRoutes(null); }}
                />
              );
            })}
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
};
