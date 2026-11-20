import { useEffect, useState } from 'react';
import { APP_URL, currentSearch, readUrlParam } from './urlSchema';

/** The parts of the browser's Network Information API that Atlas reads (Chromium only; other browsers report none). */
export interface ConnectionHints {
  saveData?: boolean;
  effectiveType?: string;
}

/** CIV-98: slow when the visitor asked their browser to save data, or the link behaves like 2G or 3G. */
export function isSlowConnection(connection: ConnectionHints | null | undefined): boolean {
  if (!connection) return false;
  if (connection.saveData === true) return true;
  return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g' || connection.effectiveType === '3g';
}

function currentConnection(): (ConnectionHints & EventTarget) | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { connection?: ConnectionHints & EventTarget }).connection ?? null;
}

/** `?slowconnection=1` pretends the connection is slow, so the prompt can be tried on any browser. Read only when the feature is on. */
function forcedSlow(): boolean {
  return readUrlParam(currentSearch(), APP_URL.forceSlowConnection) === true;
}

export function useSlowConnection(enabled: boolean): boolean {
  const [slow, setSlow] = useState(() => enabled && (forcedSlow() || isSlowConnection(currentConnection())));
  useEffect(() => {
    if (!enabled) { setSlow(false); return; }
    const connection = currentConnection();
    const update = () => setSlow(forcedSlow() || isSlowConnection(connection));
    update();
    connection?.addEventListener?.('change', update);
    return () => connection?.removeEventListener?.('change', update);
  }, [enabled]);
  return enabled && slow;
}
