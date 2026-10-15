import { R2_PUBLIC_URL } from '../../shared/config';
import type { AgencyHistory } from '../apps/History';

let pending: Promise<AgencyHistory[]> | null = null;

/**
 * History's multi-megabyte config, fetched once and shared: the History screen asks for it when it opens,
 * and the app can ask earlier (idle time, or the moment the tab is hovered) so opening feels instant.
 * A failed fetch is not remembered, so the next ask tries again.
 */
export function loadHistoryConfig(): Promise<AgencyHistory[]> {
  if (!pending) {
    pending = fetch(`${R2_PUBLIC_URL}/atlas/history-config.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP error! status: ${r.status}`);
        return r.json() as Promise<AgencyHistory[]>;
      })
      .catch(err => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

/** Warm everything History needs: its code and its config. Safe to call repeatedly. */
export function preloadHistory(): void {
  void import('../apps/History');
  loadHistoryConfig().catch(() => {});
}
