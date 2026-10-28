/** Period-key parsing shared by build-history and its tests (pure; no I/O). */

export function parsePeriodKey(key: string): { year: number; label: string } {
  // YYYYMMDD
  const compact = key.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const year = parseInt(compact[1]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(compact[2]) - 1] ?? '';
    return { year, label: `${month} ${year}` };
  }
  // YYYY-MM-DD
  const dashed = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashed) {
    const year = parseInt(dashed[1]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(dashed[2]) - 1] ?? '';
    return { year, label: `${month} ${year}` };
  }
  // Month-name keys like "Jun-27-2014", "jul-10-2018", "Jun-16-2020"
  const monthNameMatch = key.match(/([A-Za-z]+)[-\s]+(\d+)[-\s]+(20\d{2})/);
  if (monthNameMatch) {
    const year = parseInt(monthNameMatch[3]);
    const monthAbbr = monthNameMatch[1].slice(0, 3);
    const label = `${monthAbbr.charAt(0).toUpperCase()}${monthAbbr.slice(1).toLowerCase()} ${year}`;
    return { year, label };
  }
  // Plain year like "2016"
  const yearOnlyMatch = key.match(/^(20\d{2})$/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1]);
    return { year, label: String(year) };
  }
  const yearMatch = key.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  return { year, label: key };
}

export function getPeriodKeySortValue(key: string): number {
  // YYYYMMDD
  const compact = key.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return parseInt(compact[1]) * 10000 + parseInt(compact[2]) * 100 + parseInt(compact[3]);
  }
  // YYYY-MM-DD
  const dashed = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashed) {
    return parseInt(dashed[1]) * 10000 + parseInt(dashed[2]) * 100 + parseInt(dashed[3]);
  }
  // Month-name keys like "Jun-27-2014", "jul-10-2018", "Jun-16-2020", "june-2-2022"
  const monthNameMatch = key.match(/([A-Za-z]+)[-\s]+(\d+)[-\s]+(20\d{2})/);
  if (monthNameMatch) {
    const year = parseInt(monthNameMatch[3]);
    const day = parseInt(monthNameMatch[2]);
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthAbbr = monthNameMatch[1].slice(0, 3).toLowerCase();
    const monthIdx = monthNames.indexOf(monthAbbr);
    const month = monthIdx >= 0 ? monthIdx + 1 : 1;
    return year * 10000 + month * 100 + day;
  }
  // Plain year like "2016"
  const yearOnlyMatch = key.match(/^(20\d{2})$/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1]);
    return year * 10000 + 101;
  }
  const yearMatch = key.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  return year * 10000 + 101;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Label for a real service day (YYYYMMDD), e.g. "Jun 2024". Null when not a real date. */
export function labelFromRefDate(refDate: string | null | undefined): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(refDate ?? '');
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${MONTHS[month - 1]} ${m[1]}`;
}

/**
 * A History change file named by its refresh run's date (YYYY-MM-DD): refresh.ts falls back to the
 * run date when a feed has no end date or version, so the row records a pipeline run, not a schedule
 * change (#1114). Feed end dates are YYYYMMDD. A file whose processedAt is on another day was not
 * written by that run and is kept.
 */
export function isRefreshRunPeriodKey(periodKey: string, processedAt?: unknown): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return false;
  return typeof processedAt !== 'string' || processedAt.slice(0, 10) === periodKey;
}
