export type FeedRefreshMeta = {
  /** GitHub Actions schedule cron — synced from refresh-feeds.yml (git) */
  scheduleCron: string;
  /** ISO timestamp of last full refresh run — on R2, not git */
  lastCompletedAt?: string | null;
};

/** Parse GitHub weekly cron: minute hour * * weekday (0=Sun … 6=Sat). */
export function parseWeeklyCron(cron: string): { minute: number; hour: number; weekday: number } | null {
  const match = cron.trim().match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+(\d+)$/);
  if (!match) return null;
  return { minute: Number(match[1]), hour: Number(match[2]), weekday: Number(match[3]) };
}

/** Next scheduled weekly run strictly after `after` (UTC). */
export function nextFeedRefreshRun(cron: string, after = new Date()): Date | null {
  const parsed = parseWeeklyCron(cron);
  if (!parsed) return null;

  const candidate = new Date(after);
  candidate.setUTCHours(parsed.hour, parsed.minute, 0, 0);
  const addDays = (parsed.weekday - candidate.getUTCDay() + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + addDays);
  if (candidate.getTime() <= after.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 7);
  }
  return candidate;
}

function calendarDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((end - start) / 86_400_000);
}

export function daysUntilNextFeedRefresh(meta: FeedRefreshMeta, from = new Date()): number | null {
  const next = nextFeedRefreshRun(meta.scheduleCron, from);
  if (!next) return null;
  return calendarDaysBetween(from, next);
}

export function feedRefreshCountdownLabel(meta: FeedRefreshMeta | null | undefined, from = new Date()): string {
  const days = meta ? daysUntilNextFeedRefresh(meta, from) : null;
  if (days == null) return 'We check for updates weekly.';
  if (days === 0) return "We'll check for updates again today.";
  if (days === 1) return "We'll check for updates again tomorrow.";
  return `We'll check for updates again in ${days} days.`;
}
