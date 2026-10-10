const INTERNAL_TEST_PARAM = 'atlas_internal';
const INTERNAL_TEST_KEY = 'atlas.internal-test';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * True for traffic that should never count as a visitor: locally served
 * builds (e.g. `vite preview`) and browsers marked with `?atlas_internal=1`.
 * The marker persists in localStorage. This is a testing convenience, not an
 * access-control mechanism.
 */
export function isInternalTestSession(): boolean {
  if (typeof window === 'undefined') return false;
  if (LOCAL_HOSTNAMES.has(window.location.hostname)) return true;
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
