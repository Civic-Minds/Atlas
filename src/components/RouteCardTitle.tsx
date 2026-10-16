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
}

export default function RouteCardTitle({ routeShortName, routeLongName, agencyName, routeType, agencySlug, onAgencyClick }: Props) {
  const title = routeLabels({ shortName: routeShortName, longName: routeLongName, routeType, agencySlug, agencyName }).text;
  const displayAgency = agencyName ? shortenAgencyName(agencyName) : null;
  return (
    <SidebarCardHeader
      eyebrow={displayAgency}
      title={title}
      onEyebrowClick={onAgencyClick}
      titleClamp
    />
  );
}
