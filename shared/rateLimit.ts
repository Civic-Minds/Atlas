const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

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
 */
export function isRateLimited(
  ip: string,
  limit: number = 60,
  windowMs: number = 60000
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
