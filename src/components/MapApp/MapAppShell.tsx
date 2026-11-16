import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { PILL_ROW } from '../ui/PillGroup';
import { PHONE_MEDIA_QUERY, phoneModeFlags, useMediaQuery } from '../../hooks/useMediaQuery';

/**
 * A map-and-sidebar page (Live's tool page, Studio): the whole screen, a top bar, then the body (MapAppLayout) filling
 * the rest. Nothing scrolls but the panels the body chooses. Desktop only (Ryan, 2026-11-16, CIV-1732): on a phone the
 * page falls back to the map, as History and Compare do.
 */
export function MapAppShell({ children }: { children: ReactNode }) {
  const onPhone = !phoneModeFlags(useMediaQuery(PHONE_MEDIA_QUERY)).mapApps;
  const navigate = useNavigate();
  useEffect(() => { if (onPhone) navigate('/', { replace: true }); }, [onPhone, navigate]);
  if (onPhone) return null;
  return <main className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">{children}</main>;
}

/** The top bar: one row with every switcher (logo, names, view pills, menus). */
export function MapAppHeader({ children }: { children: ReactNode }) {
  return <header className={`${PILL_ROW} border-b border-[var(--border-primary)] bg-[var(--bg-header)] px-4 py-2`}>{children}</header>;
}
