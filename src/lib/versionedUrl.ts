/** Add the `v` cache-busting parameter unless the URL already carries one (release URLs do). */
export function withVersionParam(url: string, version: string): string {
  if (/[?&]v=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
}
