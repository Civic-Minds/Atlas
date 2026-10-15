import { routeGroupKey } from './routeGroupKey.js';

export type NightServiceDirectionFeature = {
  properties: {
    routeId?: unknown;
    routeShortName?: string | null;
    routeBranch?: string | null;
    day?: unknown;
    directionId?: number | null;
    nightService?: boolean;
    nightService30?: boolean;
    nightService60?: boolean;
    [key: string]: unknown;
  };
};

/**
 * Night Service follows the main frequency rule (FREQUENCY_RULES rule 1): every direction must
 * pass, so the slower direction decides. Processing judges each drawn pattern on its own; this
 * runs afterwards and clears the flags on every feature of a route+day unless each of its
 * directions has at least one passing pattern (checked separately for the 30 and 60 minute rules).
 * It never lights a pattern that did not pass on its own.
 *
 * - A direction with no passing pattern fails the whole route-day.
 * - A route-day with a single direction in the feed (a loop, a one-way route) is that one
 *   direction and still qualifies.
 * - Features with no direction id never count as a direction of their own when the route has real
 *   directions; when none of a route-day's features has one, they are the single direction.
 */
export function stampNightServiceEveryDirection(features: readonly NightServiceDirectionFeature[]): void {
  const keyOf = (p: NightServiceDirectionFeature['properties']): string =>
    `${routeGroupKey(p.routeShortName, p.routeId)}::${p.routeBranch ?? ''}::${p.day ?? ''}`;

  type Verdict = { dirs: Map<number | 'none', { pass30: boolean; pass60: boolean }> };
  const byRoute = new Map<string, Verdict>();
  for (const f of features) {
    const p = f.properties;
    const key = keyOf(p);
    let verdict = byRoute.get(key);
    if (!verdict) { verdict = { dirs: new Map() }; byRoute.set(key, verdict); }
    const dir = p.directionId ?? 'none';
    const entry = verdict.dirs.get(dir) ?? { pass30: false, pass60: false };
    if (p.nightService30 === true) entry.pass30 = true;
    if (p.nightService60 === true || p.nightService === true) entry.pass60 = true;
    verdict.dirs.set(dir, entry);
  }

  const passes = (verdict: Verdict, field: 'pass30' | 'pass60'): boolean => {
    const real = [...verdict.dirs].filter(([dir]) => dir !== 'none');
    const judged = real.length > 0 ? real : [...verdict.dirs];
    return judged.every(([, entry]) => entry[field]);
  };

  for (const f of features) {
    const p = f.properties;
    const verdict = byRoute.get(keyOf(p))!;
    const ok30 = passes(verdict, 'pass30');
    const ok60 = passes(verdict, 'pass60');
    // Only ever clears: a pattern that did not pass on its own is never lit by its siblings.
    if (p.nightService30 === true && !ok30) p.nightService30 = false;
    if (p.nightService60 === true && !ok60) p.nightService60 = false;
    if (p.nightService === true && !ok60) p.nightService = false;
  }
}
