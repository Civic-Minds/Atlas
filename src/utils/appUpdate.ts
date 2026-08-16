import { useCallback, useEffect, useRef, useState } from 'react';

const UPDATE_CHECK_COOLDOWN_MS = 60 * 60 * 1000;

export function isNewerBuild(currentBuildId: string, latestBuildId: string | null): boolean {
  return Boolean(currentBuildId && latestBuildId && currentBuildId !== latestBuildId);
}

export function useAppUpdate(enabled: boolean): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const lastCheckAt = useRef(0);

  const checkForUpdate = useCallback(async () => {
    const now = Date.now();
    if (now - lastCheckAt.current < UPDATE_CHECK_COOLDOWN_MS) return;
    lastCheckAt.current = now;

    try {
      const response = await fetch(`/api/version?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const data = await response.json() as { buildId?: string | null };
      if (isNewerBuild(__ATLAS_BUILD_ID__, data.buildId ?? null)) {
        setUpdateAvailable(true);
      }
    } catch {
      // Update checks are optional; a failed check should never affect the app itself.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const check = () => {
      if (!cancelled) void checkForUpdate();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };

    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkForUpdate, enabled]);

  return updateAvailable;
}
