const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/** Default public API budget. In-memory only — resets per Vercel isolate. */
export const DEFAULT_RATE_LIMIT = 60;
export const DEFAULT_RATE_WINDOW_MS = 60_000;

function cleanupExpired() {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}

/**
 * Checks if a given IP has exceeded the rate limit.
 * Defaults to 60 requests per minute.
 * Note: process-local Map — not shared across Vercel instances (known gap).
 */
export function isRateLimited(
  ip: string,
  limit: number = DEFAULT_RATE_LIMIT,
  windowMs: number = DEFAULT_RATE_WINDOW_MS
): boolean {
  const now = Date.now();

  // Periodic cleanup to prevent memory leaks if map grows large
  if (rateLimitMap.size > 1000) {
    cleanupExpired();
  }

  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, {
      count: 1,
      resetTime: now + windowMs,
    });
    return false;
  }

  record.count += 1;
  return record.count > limit;
}

/** JSON 429 body for Fetch-style (Web Response) handlers. */
export function rateLimitWebResponse(): Response {
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': '60',
    },
  });
}
