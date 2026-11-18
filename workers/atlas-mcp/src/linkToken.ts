const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;
/**
 * A tester's token from their link, for /t/<token>/mcp (the private link) or /mcp with the token in a header
 * (Authorization: Bearer, X-Api-Key) or a ?key= query: the ways Copilot Studio documents (CIV-1854). Undefined when the
 * request is for neither endpoint; '' when /mcp has no well-formed token. Tokens are never logged.
 */
export function linkToken(request: Request, url: URL): string | undefined {
  const inPath = /^\/t\/([^/]+)\/mcp\/?$/.exec(url.pathname);
  if (inPath) return TOKEN.test(inPath[1]) ? inPath[1] : '';
  if (!/^\/mcp\/?$/.test(url.pathname)) return undefined;
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  const given = bearer ?? request.headers.get('X-Api-Key') ?? url.searchParams.get('key') ?? '';
  return TOKEN.test(given) ? given : '';
}
