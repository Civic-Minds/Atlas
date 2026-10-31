import { useNavigate } from 'react-router';
import { FEATURE_ROUTES } from '../../shared/config';
import { useAgencies } from '../hooks/useAgencies';
import FrequentServiceStory from './FrequentServiceStory';

/** The Frequent service story as its own page, on the shared page shell like the other research pages (CIV-1172). */
export default function FrequentServiceStoryPage() {
  const navigate = useNavigate();
  const { agencies } = useAgencies();
  return <FrequentServiceStory agencies={agencies} onExploreMap={() => navigate(FEATURE_ROUTES.frequentService.map)} />;
}
