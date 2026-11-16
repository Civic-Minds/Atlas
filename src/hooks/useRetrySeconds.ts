import { useEffect, useState } from 'react';

/** Whole seconds until `at` (epoch ms), never below 0. */
export const secondsUntil = (at: number, now: number): number => Math.max(0, Math.ceil((at - now) / 1000));

/**
 * CIV-1768: the seconds left until the next try at `at` (epoch ms), ticking once a second; null when
 * there is no next try. Live's "Retrying in 12s" reads it.
 */
export function useRetrySeconds(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [at]);
  return at == null ? null : secondsUntil(at, now);
}
