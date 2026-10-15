import { Fragment, useCallback, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * The Atlas logo is "home": it should leave the map exactly as a fresh visit to "/" would.
 * Map state (selected route or stop, search, compare, filters) is read from the URL when the map
 * mounts, so going home clears the URL first and then mounts a fresh map. Saved preferences in
 * localStorage are read again on mount, so they carry over.
 */
export default function HomeRemount({ children }: { children: (goHome: () => void) => ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [homeKey, setHomeKey] = useState(0);
  // The location key at the moment the logo was clicked, until the cleared URL arrives.
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const goHome = useCallback(() => {
    setPendingFrom(location.key);
    navigate('/');
  }, [navigate, location.key]);
  // The router applies navigations inside a transition. Swap in the fresh map in the very render
  // where the cleared URL lands: mounting it earlier would re-read the old route, and letting the
  // old map see the new URL first lets its URL writers put stale parameters back.
  if (pendingFrom !== null && location.key !== pendingFrom) {
    setPendingFrom(null);
    setHomeKey(k => k + 1);
  }
  return <Fragment key={homeKey}>{children(goHome)}</Fragment>;
}
