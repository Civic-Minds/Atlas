/**
 * CIV-1456 (Ryan: "should the branches say the branch if applicable like 52 then the letter for the branch", "Well not
 * just ttc"): a route's branch ID as the agency's data names it, a route number plus one capital letter (52A, 10B, 41G).
 * Never invented: only a code the data gives (a lettered short name, the route_variant, or a code leading the trip
 * headsign) counts. X, L and R (express, limited, rapid) and N/S/E/W (direction) are not branches.
 */

/** Letters that mark a service type or direction, not a branch. */
const NOT_BRANCH_LETTERS = new Set(['X', 'L', 'R', 'N', 'S', 'E', 'W']);

/** The route number a lettered short name belongs to: "10A" → "10"; anything else is its own base. */
export function branchBase(shortName: string): string {
  const m = /^(\d{1,4})([A-Z])$/.exec(shortName.trim());
  return m && !NOT_BRANCH_LETTERS.has(m[2]) ? m[1] : shortName.trim();
}

/** `code` when it is a branch ID of the route `base` (its number plus one branch letter), else null. */
export function branchCodeOf(code: string | null | undefined, base: string | null | undefined): string | null {
  const c = code?.trim() ?? '', b = base?.trim() ?? '';
  if (!b || c.length !== b.length + 1 || !c.startsWith(b)) return null;
  const letter = c.slice(-1);
  return /^[A-Z]$/.test(letter) && !NOT_BRANCH_LETTERS.has(letter) ? c : null;
}

/**
 * The branch ID a raw trip headsign leads with (TTC: "West - 52A Lawrence West towards Pearson Airport", "South - 110C
 * Islington South"), for the route `shortName`; null when the headsign names none ("East - 52 Lawrence West ...").
 */
export function headsignBranchCode(headsign: string | null | undefined, shortName: string | null | undefined): string | null {
  const m = /^(?:[A-Za-z]+\s+-\s+)?(\S+)\s/.exec(headsign?.trim() ?? '');
  return m ? branchCodeOf(m[1], shortName) : null;
}
