import { routeLabels } from '../utils/format';
import { agencyNames } from '../utils/agencyName';
import { SidebarCardHeader } from './Interval/cardUi';
import { RouteTitleName } from './RouteRowName';

interface Props {
  /** The route's label, when the caller already has it (the map's route card, CIV-984); else built from the names. */
  label?: { primary: string; secondary?: string; text: string };
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
  /** The agency's full name, when `agencyName` is already shortened: the back link names the agency, never a bracketed city (#1102). */
  agencyFullName?: string | null;
  /** A back link to somewhere other than the agency card ("← Near You", CIV-930); the agency name shows as the eyebrow under it. */
  back?: { to: string; onClick: () => void };
}

export default function RouteCardTitle({ label: givenLabel, routeShortName, routeLongName, agencyName, routeType, agencySlug, onAgencyClick, showAgency = true, agencyBackLink = false, agencyFullName, back: otherBack }: Props) {
  // On screen the number in bold and the name lighter, no dash (CIV-1128).
  const label = givenLabel ?? routeLabels({ shortName: routeShortName, longName: routeLongName, routeType, agencySlug, agencyName });
  const displayAgency = showAgency && agencyName ? agencyNames(agencyName).name : null;
  const back = otherBack
    ?? (agencyBackLink && onAgencyClick && displayAgency ? { to: agencyNames(agencyFullName ?? agencyName!).backLink, onClick: onAgencyClick } : undefined);
  return (
    <SidebarCardHeader
      back={back}
      eyebrow={back && !otherBack ? null : displayAgency}
      title={<RouteTitleName label={label} />}
      onEyebrowClick={back && !otherBack ? undefined : onAgencyClick}
      titleClamp
    />
  );
}
