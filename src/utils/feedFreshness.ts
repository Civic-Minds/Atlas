export function isFeedExpired(expiry: string | null | undefined, now = new Date()): boolean {
  if (!expiry || !/^\d{8}$/.test(expiry)) return false;
  const expiryTime = Date.UTC(
    Number(expiry.slice(0, 4)),
    Number(expiry.slice(4, 6)) - 1,
    Number(expiry.slice(6, 8)),
  );
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return expiryTime < todayUtc;
}
