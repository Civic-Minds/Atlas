import { useEffect, useState } from 'react';

/** Whether a CSS media query currently matches; updates when the window changes. */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(query);
    const onChange = () => setMatches(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Phone-width screens (below Tailwind's sm breakpoint). */
export const PHONE_MEDIA_QUERY = '(max-width: 639px)';
