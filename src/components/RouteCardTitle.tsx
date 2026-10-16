import { routeLabels, shortenAgencyName } from '../utils/format';
import { SidebarCardHeader } from './Interval/cardUi';

interface Props {
  routeShortName: string | null | undefined;
  routeLongName?: string | null;
  agencyName?: string | null;
  onAgencyClick?: () => void;
}

export default function RouteCardTitle({ routeShortName, routeLongName, agencyName, onAgencyClick }: Props) {
  const title = routeLabels({ shortName: routeShortName, longName: routeLongName, agencyName }).full;
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
