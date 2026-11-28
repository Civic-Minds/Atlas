/**
 * CIV-3192: links from MCP answers carry utm_source / utm_medium so their visits can be counted. Once the page has loaded
 * (the visit's page view has been sent with them), the address bar drops every utm_ tag, so a link copied from it is clean.
 */
export function withoutUtm(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of [...q.keys()]) if (k.startsWith('utm_')) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function stripUtmAfterLoad(win: Window = window): void {
  if (!/[?&]utm_/.test(win.location.search)) return;
  const strip = () => {
    const search = withoutUtm(win.location.search);
    if (search !== win.location.search) win.history.replaceState(win.history.state, '', `${win.location.pathname}${search}${win.location.hash}`);
  };
  if (win.document.readyState === 'complete') win.setTimeout(strip, 0);
  else win.addEventListener('load', () => win.setTimeout(strip, 0), { once: true });
}
