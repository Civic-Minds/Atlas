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
  /** False when a back link above the title already names the agency. */
  showAgency?: boolean;
  /** The agency name above the title is the card's back link to the agency card ("← TTC") instead of a plain eyebrow.
   *  The map's and History's route cards; Live's cards have their own back link. */
  agencyBackLink?: boolean;
}

export default function RouteCardTitle({ routeShortName, routeLongName, agencyName, routeType, agencySlug, onAgencyClick, showAgency = true, agencyBackLink = false }: Props) {
  const title = routeLabels({ shortName: routeShortName, longName: routeLongName, routeType, agencySlug, agencyName }).text;
  const displayAgency = showAgency && agencyName ? shortenAgencyName(agencyName) : null;
  const back = agencyBackLink && onAgencyClick && displayAgency ? { to: displayAgency, onClick: onAgencyClick } : undefined;
  return (
    <SidebarCardHeader
      back={back}
      eyebrow={back ? null : displayAgency}
      title={title}
      onEyebrowClick={back ? undefined : onAgencyClick}
      titleClamp
    />
  );
}
