import { useCallback, useEffect, useState } from 'react';

const KEY = 'atlas_recent_searches';

/**
 * The top search bar's recent searches, one store for the map and History (#1028 item 22): read
 * when the bar gets focus, saved newest first (five, no repeats), cleared together.
 */
export function useRecentSearches(searchFocused: boolean) {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (!searchFocused) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setRecentSearches(JSON.parse(raw));
    } catch (e) {
      console.error(e);
    }
  }, [searchFocused]);

  const saveRecentSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    try {
      const raw = localStorage.getItem(KEY);
      const recents: string[] = raw ? JSON.parse(raw) : [];
      const next = [trimmed, ...recents.filter(s => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, 5);
      localStorage.setItem(KEY, JSON.stringify(next));
      setRecentSearches(next);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const clearRecentSearches = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
      setRecentSearches([]);
    } catch (e) {
      console.error(e);
    }
  }, []);

  return { recentSearches, saveRecentSearch, clearRecentSearches };
}
