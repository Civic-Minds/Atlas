const INTERNAL_TEST_PARAM = 'atlas_internal';
const INTERNAL_TEST_KEY = 'atlas.internal-test';

/**
 * Mark a browser as an internal test session with `?atlas_internal=1`.
 * This is a testing convenience, not an access-control mechanism.
 */
export function isInternalTestSession(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get(INTERNAL_TEST_PARAM) === '1') {
    window.localStorage.setItem(INTERNAL_TEST_KEY, '1');
    return true;
  }
  return window.localStorage.getItem(INTERNAL_TEST_KEY) === '1';
}
