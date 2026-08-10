import { useCallback, useEffect, useRef, useState } from 'react';
import { R2_PUBLIC_URL } from '../../shared/config';

const UPDATE_CHECK_COOLDOWN_MS = 60 * 60 * 1000;

export interface AppUpdateState {
  deployment: boolean;
  data: boolean;
}

export function useAppUpdate(enabled: boolean): AppUpdateState {
  const [update, setUpdate] = useState<AppUpdateState>({ deployment: false, data: false });
  const initialDataVersion = useRef<string | null>(null);
  const lastCheckAt = useRef(0);

  const checkForUpdate = useCallback(async () => {
    const now = Date.now();
    if (now - lastCheckAt.current < UPDATE_CHECK_COOLDOWN_MS) return;
    lastCheckAt.current = now;

    const [versionResult, dataVersionResult] = await Promise.allSettled([
      fetch(`/api/version?t=${now}`, { cache: 'no-store', headers: { Accept: 'application/json' } }),
      fetch(`${R2_PUBLIC_URL}/atlas/data-version.json?t=${now}`, { cache: 'no-store' }),
    ]);

    if (versionResult.status === 'fulfilled' && versionResult.value.ok) {
      const body = await versionResult.value.json() as { buildId?: string | null };
      if (body.buildId && body.buildId !== __ATLAS_BUILD_ID__) {
        setUpdate(previous => ({ ...previous, deployment: true }));
      }
    }

    if (dataVersionResult.status === 'fulfilled' && dataVersionResult.value.ok) {
      const body = await dataVersionResult.value.json() as { v?: string };
      if (!body.v) return;
      if (initialDataVersion.current === null) {
        initialDataVersion.current = body.v;
      } else if (body.v !== initialDataVersion.current) {
        setUpdate(previous => ({ ...previous, data: true }));
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const check = () => {
      if (!cancelled) void checkForUpdate().catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };

    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const interval = window.setInterval(check, UPDATE_CHECK_COOLDOWN_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkForUpdate, enabled]);

  return update;
}
