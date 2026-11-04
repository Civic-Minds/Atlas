const INTERNAL_TEST_PARAM = 'atlas_internal';
const INTERNAL_TEST_KEY = 'atlas.internal-test';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * True when the page is served from this machine or the local network: localhost, loopback,
 * private IPv4 ranges (a dev or preview server opened with --host) and *.local / *.localhost
 * names. Analytics never loads there and the consent prompt never shows (CIV-1335).
 */
export function isLocalHost(hostname: string = typeof window === 'undefined' ? '' : window.location.hostname): boolean {
  const host = hostname.toLowerCase();
  if (!host) return false;
  if (LOCAL_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * True for traffic that should never count as a visitor: locally served
 * builds (e.g. `vite preview`) and browsers marked with `?atlas_internal=1`.
 * The marker persists in localStorage. This is a testing convenience, not an
 * access-control mechanism.
 */
export function isInternalTestSession(): boolean {
  if (typeof window === 'undefined') return false;
  if (isLocalHost()) return true;
  const params = new URLSearchParams(window.location.search);
  try {
    if (params.get(INTERNAL_TEST_PARAM) === '1') {
      window.localStorage.setItem(INTERNAL_TEST_KEY, '1');
      return true;
    }
    return window.localStorage.getItem(INTERNAL_TEST_KEY) === '1';
  } catch {
    return params.get(INTERNAL_TEST_PARAM) === '1';
  }
}
