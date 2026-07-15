/** Read a request header from either Fetch's Headers or Vercel's Node headers. */
export function requestHeader(
  req: { headers: Headers | Record<string, string | string[] | undefined> },
  name: string,
): string | null {
  const headers = req.headers;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name);
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
