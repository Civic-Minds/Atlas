import { routeLabels, shortenAgencyName } from '../utils/format';
import { SidebarCardHeader } from './Interval/cardUi';

interface Props {
  routeShortName: string | null | undefined;
  routeLongName?: string | null;
  agencyName?: string | null;
  /** The feed's route_type and the agency slug: with them the title hides or shows a numeric id the same way lists and agency pages do. */
  routeType?: number | string | null;
  agencySlug?: string;
  onAgencyClick?: () => void;
  /** The card's own way back (Live's route list). Without it, the agency name is the back link to the agency card. */
  back?: { to: string; onClick: () => void };
}

export default function RouteCardTitle({ routeShortName, routeLongName, agencyName, routeType, agencySlug, onAgencyClick, back }: Props) {
  const title = routeLabels({ shortName: routeShortName, longName: routeLongName, routeType, agencySlug, agencyName }).text;
  const displayAgency = agencyName ? shortenAgencyName(agencyName) : null;
  const agencyBack = !back && onAgencyClick && displayAgency ? { to: displayAgency, onClick: onAgencyClick } : undefined;
  return (
    <SidebarCardHeader
      back={back ?? agencyBack}
      eyebrow={agencyBack ? null : displayAgency}
      title={title}
      onEyebrowClick={agencyBack ? undefined : onAgencyClick}
      titleClamp
    />
  );
}
