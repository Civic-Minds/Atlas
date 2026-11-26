/**
 * The Atlas Studio MCP tools that read only published data (CIV-1840): their handlers, with no file, process or pipeline
 * import, so the local stdio server and the hosted Worker serve the very same tools. The store they read is set with
 * useStore() in atlasData.ts. Definitions are in toolDefs.ts, shared helpers in toolHelpers.ts, the Live tools in
 * liveTools.ts, and the tools that read files on this Mac (trip times, combined frequency, buses needed) in localTools.ts.
 */
import { PERIOD_KEYS, PERIOD_LABELS, formatPeriodRange } from '../../shared/config';
import { clockTime } from '../../shared/timeText';
import { countryForRegion } from '../../shared/regionCountry';
import * as data from './atlasData';
import { isoDate } from '../../shared/dateText';
import { headwayEvery } from '../../shared/headwayText';
import { NEARBY_ROUTES_RADIUS_M, RANK_AGENCIES_MAX } from '../../shared/rules/limits';
import { LIVE_TOOLS, liveHandlers } from './liveTools';
import { agencyGroupName, groupAgencies, groupHome } from '../../shared/agencyGroups';
import { PARENT_AGENCIES } from '../../shared/parentAgencyList';
import { needAgency, needPeriod, mapLink, validThrough, SOURCE, windowNote, nowAt, nowBlock, periodOrNow, windowOrNow, type Args, FIGURE_LABELS } from './toolHelpers';
import { isNow } from './nowClock';
import { sameRegion } from './places';
import { STUDIO_TARGETS, groupAtTarget } from '../../shared/studioVehicles';

export * from './toolDefs';
export * from './toolHelpers';
export { LIVE_TOOLS };

/** Days after which a schedule comparison may no longer be the agency's latest change (#1624: Hamilton's compared two spring 2026 schedules in November). */
export const COMPARISON_STALE_DAYS = 45;
/** A note when a comparison's later schedule is from well before today, so an answer doesn't call a route gone that runs now. */
export function staleComparisonNote(afterYmd: string, nowMs: number): { staleNote?: string } {
  const after = Date.parse(`${afterYmd.slice(0, 4)}-${afterYmd.slice(4, 6)}-${afterYmd.slice(6, 8)}T12:00:00Z`);
  if (Number.isNaN(after) || (nowMs - after) / 86_400_000 <= COMPARISON_STALE_DAYS) return {};
  return { staleNote: 'This comparison is between schedules as of those dates. The agency may have changed its schedule since, so before saying a route was removed or cut, check route_frequency for today\'s schedule.' };
}

/**
 * #1700, #1702: the agencies a region or country holds that are left out by their data terms, each with its reason, so a
 * list they would be in says why they're missing (DC's only public agency is WMATA).
 */
async function leftOutIn(what: 'ranking' | 'list', reg: string, ctry: string): Promise<string | null> {
  if (!reg && !ctry) return null;
  const excluded = await data.excludedAgencies(a => (!reg || sameRegion(a.region, reg)) && (!ctry || data.sameCountry(countryForRegion(a.region), ctry)));
  return excluded.length ? `Left out of this ${what} by their data terms, though the Atlas map shows them: ${excluded.slice(0, 8).map(x => `${x.name} (${x.reason})`).join('; ')}${excluded.length > 8 ? `; and ${excluded.length - 8} more` : ''}.` : null;
}

/**
 * #1701: a region no agency in Atlas has (by any of its names) says so, instead of an empty list read as "no transit
 * there". Agencies left out by their data terms count as in Atlas: their own note says why they're missing.
 */
async function unknownRegion(reg: string): Promise<{ regionNote: string } | null> {
  if (!reg) return null;
  const all = [...await data.publicAgencies(), ...await data.excludedCatalog()];
  return all.some(a => sameRegion(a.region, reg)) ? null : { regionNote: `Atlas has no agency in a state or province named "${reg}". Give its full name or its short form, such as "Ontario" or "ON".` };
}

export const handlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  ...liveHandlers,
  list_agencies: async ({ query, region, country, near, km, include_parts }) => {
    if (near != null) {
      const res = await data.agenciesNear(String(near), km != null ? Number(km) : 60);
      if (!res) throw new Error(`No agency or city matching "${near}".`);
      const { serverHas, atlasHas, ...rest } = res;
      // #1687: a server with only some of Atlas's agencies (the hosted pilot) marks the ones it can't answer for.
      const partial = serverHas < atlasHas;
      const missing = res.agencies.slice(0, 40).filter(a => !a.here);
      const pilotNote = partial && missing.length ? await data.notOnThisServerNote(missing.length <= 3 ? missing.map(a => a.name) : ['The agencies marked "not on this server"']) : null;
      return {
        ...rest, ...(pilotNote ? { note: [rest.note, pilotNote].filter(Boolean).join(' ') } : {}),
        agencies: res.agencies.slice(0, 40).map(a => `${a.name} | ${a.region ?? ''} | ${a.km} km${partial && !a.here ? ' | not on this server' : ''}`),
        columns: `name | region | distance from ${res.centredOn} to each agency's area centre${partial ? ' | "not on this server" where this server has no schedules for it' : ''}`,
      };
    }
    const q = String(query ?? '').trim().toLowerCase(), reg = String(region ?? '').trim().toLowerCase(), ctry = String(country ?? '').trim();
    const all = await data.availableAgencies();
    // One entry per agency or region (shared/agencyGroups.ts): a parent's feeds are one row under its name.
    const entries = groupAgencies(all);
    if (!q && !reg && !ctry) return { agencies: entries.length, note: 'Filter by name or city, region or country to list them.' };
    // #1681: an operator's name (Metrolinx) lists the agencies it runs, which Atlas lists under their own names.
    const operator = q ? data.operatorNamed(q, all) : null;
    // #1705: an agency's short name (HSR) finds it, as it does in the route tools.
    const short = q ? await data.shortNames() : new Map<string, string>();
    const matches = (g: (typeof entries)[number]) => {
      const home = groupHome(g);
      // A name or place matches where a word starts ("GO Transit" is not inside "Chicago Transit", #1682).
      return (!q || (g.parent && [g.parent.slug, g.parent.name].some(x => data.hasWordsAt(x, q))) || g.members.some(a => [a.slug, a.name, short.get(a.slug) ?? '', ...(a.cities ?? [])].some(x => data.hasWordsAt(x, q))) || !!operator?.members.some(a => g.members.includes(a)))
        && (!reg || g.members.some(a => sameRegion(a.region, reg)))
        && (!ctry || data.sameCountry(countryForRegion(home.region), ctry));
    };
    const hitGroups = entries.filter(matches);
    const earliest = (xs: Array<string | null>) => xs.filter((x): x is string => !!x).sort()[0] ?? null;
    // CIV-2081: when its schedule was added (the earliest of a parent's feeds) beside when it runs out.
    const hits = hitGroups.map(g => ({ name: agencyGroupName(g, a => a.name), region: groupHome(g).region, added: earliest(g.members.map(m => isoDate(m.lastRefreshedAt))), end: earliest(g.members.map(m => validThrough(m))), parts: g.parent ? g.members : null }));
    // include_parts (#1625): a parent agency's feeds too, each with its own schedule end, as rank_agencies lists them.
    const parts = include_parts === true ? Object.fromEntries(hits.slice(0, 40).filter(h => h.parts).map(h => [h.name, h.parts!.map(m => `${m.name} | ${isoDate(m.lastRefreshedAt) ?? ''} | ${validThrough(m) ?? ''}`)])) : null;
    if (!hits.length && q) {
      const excluded = await data.excludedAgencyNote(q);
      if (excluded) return { matches: 0, note: excluded };
    }
    if (!hits.length) {
      // #1687: agencies Atlas has that this server carries no schedules for (the hosted pilot): say so instead of nothing.
      const haveSlugs = new Set(all.map(a => a.slug));
      const elsewhere = groupAgencies((await data.publicAgencies()).filter(a => !haveSlugs.has(a.slug))).filter(matches);
      if (elsewhere.length) return { matches: 0, note: await data.notOnThisServerNote(elsewhere.slice(0, 5).map(g => agencyGroupName(g, a => a.name)), Math.max(0, elsewhere.length - 5)) };
    }
    if (!hits.length && !q && (reg || ctry)) {
      const leftOut = await leftOutIn('list', reg, ctry);
      if (leftOut) return { matches: 0, leftOutAgencies: leftOut };
    }
    if (!hits.length && reg) {
      const unknown = await unknownRegion(String(region ?? '').trim());
      if (unknown) return { matches: 0, ...unknown };
    }
    if (!hits.length && q && !reg && !ctry) {
      // A service brand is not an agency name (Viva is part of York Region Transit): look for it in route names.
      const inRoutes = await data.agenciesWithRouteName(q);
      if (inRoutes.length) return { matches: 0, note: `No agency is named "${query}". It appears in route names at these agencies, so it may be a service run by one of them: ${inRoutes.slice(0, 8).map(x => x.agency).join(', ')}.`, inRouteNames: inRoutes.slice(0, 8) };
    }
    // #1702 (MCP Breaker): a partial server (the hosted pilot) says how many more agencies the filter finds in Atlas that it
    // has no schedules for ("ON" listed the pilot's 5 Ontario agencies and said nothing of the other 30).
    const haveAll = new Set(all.map(a => a.slug));
    const others = hits.length ? groupAgencies((await data.publicAgencies()).filter(a => !haveAll.has(a.slug))).filter(matches).length : 0;
    const othersNote = others ? { notOnThisServer: await data.notOnThisServerNote([`The ${others} other ${others === 1 ? 'agency' : 'agencies'} this filter finds`]) } : {};
    return { matches: hits.length, ...othersNote, agencies: hits.slice(0, 40).map(a => [a.name, a.region ?? '', a.added ?? '', a.end ?? ''].join(' | ')), columns: 'name | region | schedule added | schedule valid through', ...(parts && Object.keys(parts).length ? { parts, partsColumns: 'feed | schedule added | schedule valid through' } : {}), ...(operator ? { operatorNote: `${operator.name} runs ${operator.members.map(a => a.name).join(' and ')}; Atlas lists each as its own agency.` } : {}), ...(hits.length > 40 ? { note: 'First 40 shown; narrow the filter for the rest.' } : {}) };
  },
  rank_agencies: async (args) => {
    const feeds = await data.rankAgencies();
    if (!feeds) throw new Error('The agency index has not been built for the current data. Run: nice -n 15 npx tsx scripts/mcp/buildIndex.ts');
    if (isNow(args.period)) throw new Error('A ranking spans agencies with their own clocks, so it takes a part of the day, not "now". Use routes_at_frequency with period "now" for one agency.');
    const dayType = data.parseDay(args.day), key = needPeriod(args.period), minutes = Number(args.every);
    let lo = args.min_routes != null ? Number(args.min_routes) : 0, hi = args.max_routes != null ? Number(args.max_routes) : Infinity;
    let like: string | null = null;
    let kind: 'bus' | 'rail' | 'ferry' | null = args.kind === 'bus' || args.kind === 'rail' || args.kind === 'ferry' ? args.kind : null;
    const KIND_TEXT = { bus: 'buses only', rail: 'with rail', ferry: 'ferries only' };
    const ends = new Map((await data.publicAgencies()).map(x => [x.slug, validThrough(x)]));
    const waits = await data.rankWaits(dayType);
    const at = PERIOD_KEYS.indexOf(key);
    // One entry per agency or region (shared/agencyGroups.ts): a parent's feeds rank as one agency, a route in two of
    // them counted once. include_parts lists the feeds on their own instead.
    const parts = args.include_parts === true;
    const parentSlug = (name: string | null) => (name ? PARENT_AGENCIES.find(p => p.name === name)?.slug : undefined);
    const groups = groupAgencies(feeds.map(a => ({ ...a, parentAgency: parts ? undefined : parentSlug(a.partOf) })));
    const labelKey = ([route, name]: [string, string | null]) => `${route}\u0000${name ?? ''}`;
    const entries = await Promise.all(groups.map(async g => {
      const home = groupHome(g);
      if (!g.parent) return { slug: home.slug, name: home.name, region: home.region, country: home.country, partOf: home.partOf, kind: home.kind, weekdayRoutes: home.weekdayRoutes, members: [home] };
      const weekday = new Set<string>();
      for (const m of g.members) for (const l of await data.rankLabels(m.slug, 'Weekday')) weekday.add(labelKey(l));
      const kinds = g.members.map(m => m.kind);
      return { slug: g.slug, name: g.parent.name, region: home.region, country: home.country, partOf: null, kind: kinds.includes('rail') ? 'rail' as const : kinds.every(k => k === 'ferry') ? 'ferry' as const : 'bus' as const, weekdayRoutes: weekday.size, members: g.members };
    }));
    if (args.similar_to != null) {
      const a = await needAgency(args.similar_to);
      const self = entries.find(x => x.members.some(m => m.slug === a.slug));
      if (!self) throw new Error(`${a.name} is not in the index.`);
      kind ??= self.kind;
      like = `${self.name}: ${self.weekdayRoutes} weekday routes, ${KIND_TEXT[self.kind]}`;
      lo = Math.ceil(self.weekdayRoutes / 2); hi = self.weekdayRoutes * 2;
    }
    const reg = String(args.region ?? '').trim().toLowerCase(), ctry = String(args.country ?? '').trim();
    const pool = entries.filter(a => (!reg || sameRegion(a.region, reg)) && (!ctry || data.sameCountry(a.country, ctry)) && a.weekdayRoutes >= lo && a.weekdayRoutes <= hi
      && (!kind || a.kind === kind));
    // Count from the waits alone (a parent's routes once each by name), then read route names only for the agencies shown.
    const counted = await Promise.all(pool.map(async a => {
      if (a.members.length === 1) {
        const routes = waits[a.slug] ?? [];
        const meeting = routes.map((w, i) => ({ slug: a.slug, i, w: w[at], wait: data.rankWaitValue(w[at]) })).filter(r => data.rankWaitPasses(r.w, minutes)).map(({ slug, i, wait }) => ({ slug, i, wait })).sort((x, y) => x.wait! - y.wait!);
        return { a, routesOnDay: routes.length, meeting };
      }
      const seen = new Set<string>();
      let routesOnDay = 0;
      const meeting: Array<{ slug: string; i: number; wait: number | null }> = [];
      for (const m of a.members) {
        const labels = await data.rankLabels(m.slug, dayType);
        (waits[m.slug] ?? []).forEach((w, i) => {
          const k = labels[i] ? labelKey(labels[i]) : `${m.slug}\u0000${i}`;
          if (seen.has(k)) return;
          seen.add(k);
          routesOnDay++;
          if (data.rankWaitPasses(w[at], minutes)) meeting.push({ slug: m.slug, i, wait: data.rankWaitValue(w[at]) });
        });
      }
      return { a, routesOnDay, meeting: meeting.sort((x, y) => x.wait! - y.wait!) };
    }));
    counted.sort((x, y) => y.meeting.length - x.meeting.length || x.a.name.localeCompare(y.a.name));
    // Each agency shown reads its route names file; the hosted server's plan allows 50 reads a call, so a ranking shows
    // RANK_AGENCIES_MAX at most (CIV chain test, 2026-11-21: limit 100 failed with "Too many subrequests").
    const asked = args.limit != null ? Number(args.limit) : 15;
    const limit = Math.min(asked, RANK_AGENCIES_MAX);
    const shown = await Promise.all(counted.slice(0, limit).map(async ({ a, routesOnDay, meeting }) => {
      const labels = new Map(await Promise.all(a.members.map(async m => [m.slug, await data.rankLabels(m.slug, dayType)] as const)));
      const end = a.members.map(m => ends.get(m.slug)).filter((x): x is string => !!x).sort()[0] ?? null;
      return { agency: a.name, region: a.region, ...(a.partOf ? { partOf: a.partOf } : {}), kind: KIND_TEXT[a.kind], scheduleValidThrough: end, weekdayRoutes: a.weekdayRoutes, routesOnDay, routesMeeting: meeting.length, routes: meeting.map(r => { const l = labels.get(r.slug)![r.i]; return `${l[0]}${l[1] ? ` ${l[1]}` : ''} (every ${r.wait})`; }) };
    }));
    // #1700: a region or country with agencies left out by their data terms says so (Yukon's only agency is left out,
    // so its ranking was empty with no reason).
    const leftOutNote = await leftOutIn('ranking', reg, ctry);
    return {
      day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes,
      ...(like ? { peersOf: like } : {}), ...(kind ? { kind: KIND_TEXT[kind] } : {}), ...(parts ? { listed: 'each feed of a larger agency on its own' } : {}), sizeRange: `${lo}–${hi === Infinity ? 'any' : hi} weekday routes`,
      agenciesCompared: counted.length, ranking: shown, ...(leftOutNote ? { leftOutAgencies: leftOutNote } : {}), ...(await unknownRegion(String(args.region ?? '').trim()) ?? {}), ...(asked > limit ? { shownLimit: `The ranking shows ${RANK_AGENCIES_MAX} agencies at most; narrow it by country, region, kind or size to see others.` } : {}), source: SOURCE,
    };
  },
  route_frequency: async (args) => {
    const a = await needAgency(args.agency);
    // from_time "now" (#1627): the hour from the agency's current time, on today's day type.
    const { w, now } = await windowOrNow(a, args);
    const dayType = now && args.day == null ? now.day : data.parseDay(args.day);
    const list = await data.routeList(a, dayType);
    const found = data.findRoute(list, String(args.route ?? ''));
    if (!found) throw new Error(`${a.name} has no route matching "${args.route}" on ${dayType}.`);
    const also = data.otherExactMatches(list, String(args.route ?? ''), found);
    const r = await data.routeWithRows(a, dayType, found);
    const sameRoutes = await data.sameNameRoutes(a, dayType, r);
    // #1867: a route that runs all night says so, with its Overnight figure, in place of a first or last time.
    const allNight = data.runsThroughNight(found.night);
    return {
      agency: a.name, route: r.name, name: r.longName, mode: r.mode, day: dayType, figure: `waitMinutes is ${FIGURE_LABELS.typical}`,
      // The summary holds these, made by the same functions from the same rows: a hosted call doesn't work them out again.
      periods: PERIOD_KEYS.map(p => found.figures[p]),
      runsAllNight: allNight,
      service: allNight ? data.allNightService(found, data.runsOvernightOnly(found) ? [] : await data.daysRunningEveryHour(a, found)) : found.span,
      branches: await data.branchesOf(a, dayType, r),
      branchesNote: 'Branches that end at the same stop are one row, with their trips counted once; startsAt names where its trips begin.',
      ...(now ? nowBlock(now, found.figures[now.period]?.shown === 'no service') : {}),
      ...(also.length ? { alsoNamed: also.map(o => ({ route: o.name, name: o.longName, mode: o.mode })), alsoNamedNote: `"${args.route}" also names ${also.map(o => `${o.name} (${o.mode.toLowerCase()})`).join(', ')}. This answer is ${found.name} (${found.mode.toLowerCase()}); say so, name the other, and offer it.` } : {}),
      ...(() => { const same = sameRoutes; return same.length ? { sameNameRoutes: same, sameNameNote: `Other ${a.name} routes with the same name, often a night or express version on the same street. A rider on this street can use them too; combined_frequency between two stops counts them together.` } : {}; })(),
      ...(w ? { window: w.label, hourly: data.hourlyFrequency(r, w.start, w.end, await data.endOfRows(a, dayType, r)), windowNote: windowNote(w), hourlyNote: "Each column is one branch's own frequency by hour. Branches that end at the same stop share their trips, so the direction as a whole runs more often than any one column says." } : {}),
      mapLink: mapLink({ route: found.routeIds[0] != null ? { agency: a.slug, routeId: found.routeIds[0] } : undefined, day: dayType }),
      scheduleValidThrough: validThrough(a), source: SOURCE,
    };
  },
  routes_at_frequency: async ({ agency: q, period: p, every: n, day: d }) => {
    const a = await needAgency(q);
    const { key, dayType, now } = await periodOrNow(a, p, d);
    const minutes = Number(n);
    const res = await data.routesMeeting(a, dayType, key, minutes);
    return { agency: a.name, ...(now ? nowBlock(now, res.routesRunningInPeriod === 0) : {}), day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes, figure: `waitMinutes is ${FIGURE_LABELS.typical}`, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, meeting: res.meeting.map(m => ({ route: m.route, name: m.longName, mode: m.mode, shown: m.shown, waitMinutes: m.waitMinutes })), ...(res.leftOut.length ? { leftOutByRule: res.leftOut.map(m => ({ route: m.route, name: m.longName, shown: m.shown, waitMinutes: m.waitMinutes })), leftOutNote: `These routes' typical wait is every ${minutes} min or better, but some of their waits in this part of the day run longer, so the map's every-${minutes} filter leaves them out. Name them when you answer.` } : {}), mapLink: mapLink({ agencies: [a.slug], day: dayType, period: key, every: minutes }), scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  compare_agencies: async ({ agencies, period: p, every: n, day: d }) => {
    // #1700: an agency left out by its data terms is a note beside the others' rows, not the whole answer.
    const asked = Array.isArray(agencies) ? agencies.map(q => String(q ?? '')) : [];
    const leftOut: string[] = [];
    const lookup = async (q: string) => {
      try {
        const e = await data.findAgencyEntry(q);
        if (e) return e;
      } catch (err) {
        const note = await data.excludedAgencyNote(q);
        if (!note) throw err;
        leftOut.push(note);
        return 'left out' as const;
      }
      const note = await data.excludedAgencyNote(q);
      if (note) { leftOut.push(note); return 'left out' as const; }
      return null;
    };
    const looked = await Promise.all(asked.map(async q => ({ q, e: await lookup(q) })));
    const missing = looked.find(f => !f.e);
    if (missing) {
      const elsewhere = await data.agencyNotOnThisServer(missing.q);
      throw new Error(elsewhere ? await data.notOnThisServerNote([elsewhere.name]) : `No agency matching "${missing.q}" has data here. Use list_agencies to search.`);
    }
    const found = looked.flatMap(f => (f.e && f.e !== 'left out' ? [{ q: f.q, e: f.e }] : []));
    if (!found.length && leftOut.length) throw new Error(leftOut.join(' '));
    // "now" reads the first agency's clock (#1627); the answer says so when the others keep another time zone.
    const first = found[0]?.e ?? null;
    if (isNow(p) && !first) throw new Error('Name the agencies to compare.');
    const { key, dayType, now } = first ? await periodOrNow(first.members[0], p, d) : { key: needPeriod(p), dayType: data.parseDay(d), now: null };
    const minutes = Number(n);
    // One entry per agency or region (shared/agencyGroups.ts): "MTA New York" is its feeds together, a route in two of
    // them counted once.
    // #1683: the same agency named twice ("TTC" and "Toronto Transit Commission") is one row, with a note.
    const byEntry = new Map<string, { e: data.AgencyEntry; names: string[] }>();
    for (const { q, e } of found) { const k = e.members.map(m => m.slug).sort().join(','); (byEntry.get(k) ?? byEntry.set(k, { e, names: [] }).get(k)!).names.push(q); }
    const sameNotes = [...byEntry.values()].filter(x => x.names.length > 1).map(x => `${x.names.map(n => `"${n}"`).join(' and ')} are the same agency (${x.e.name}), shown once.`);
    const rows = await Promise.all([...byEntry.values()].map(async ({ e }) => {
      const res = await data.entryRoutesMeeting(e, dayType, key, minutes);
      const ends = e.members.map(m => validThrough(m)).filter((x): x is string => !!x).sort();
      return { slugs: e.members.map(m => m.slug), agency: e.name, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, routesMeeting: res.meeting.length, scheduleValidThrough: ends[0] ?? null };
    }));
    const zones = now ? [...new Set(await Promise.all(rows.map(async r => (await data.timeZoneOf(r.slugs[0])) ?? now.timeZone)))] : [];
    return { ...(now ? { ...nowBlock(now), ...(zones.length > 1 ? { nowZones: `These agencies keep different time zones (${zones.join(', ')}); "now" is ${rows[0].agency}'s.` } : {}) } : {}), day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes, agencies: rows.map(({ slugs: _slugs, ...row }) => row), ...(sameNotes.length ? { sameAgencyNote: sameNotes.join(' ') } : {}), ...(leftOut.length ? { leftOutAgencies: leftOut.join(' ') } : {}), mapLink: mapLink({ agencies: rows.flatMap(r => r.slugs), day: dayType, period: key, every: minutes }), source: SOURCE };
  },
  buses_needed: async (args) => {
    const a = await needAgency(args.agency);
    // period "now" (#1627): the agency's current part of the day. The figures are for a representative weekday.
    const { key, now } = await periodOrNow(a, args.period, null);
    const nowInfo = now ? { ...nowBlock(now), ...(now.day !== 'Weekday' ? { nowDayNote: `It's ${now.day} there now, but buses-needed figures are for a weekday.` } : {}) } : {};
    const route = String(args.route ?? '');
    const every = args.every != null ? Number(args.every) : null;
    // The file names routes by short name ("blue" for Viva Blue, #1632): resolve the name as the other tools do, then fall back to it as typed.
    const named = data.findRoute(await data.routeList(a, 'Weekday'), route);
    const tried = named ? await data.busesNeeded(a.slug, named.shortName, key) : null;
    const res = tried?.cached && tried.groups.length ? tried : await data.busesNeeded(a.slug, route, key);
    const period = `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`;
    if (!res.cached) return { agency: a.name, route, period, ...nowInfo, scheduleValidThrough: validThrough(a), answer: `Atlas Studio has no buses-needed figures for ${a.name} yet. They are worked out once per agency ahead of time, not while you wait. Don't estimate a number yourself.` };
    if (!res.groups.length) return { agency: a.name, route, period, ...nowInfo, scheduleValidThrough: validThrough(a), answer: `Route ${route} isn't in ${a.name}'s buses-needed figures for the ${PERIOD_LABELS[key].replace(/^(?![AP]M)\w/, c => c.toLowerCase())}: it may not run then, or its number is written differently.` };
    const missing = every != null && !STUDIO_TARGETS.includes(every);
    const targets = every != null && !missing ? [every] : [...STUDIO_TARGETS];
    const neededAt = (at: Partial<Record<number, number>>) => Object.fromEntries(targets.filter(t => at[t] != null).map(t => [headwayEvery(t), at[t]]));
    return {
      // #1688: the schedule's end date, as every schedule tool gives it (and the ends-within-a-week warning reads).
      agency: a.name, route, period, ...nowInfo, scheduleValidThrough: validThrough(a),
      ...(res.olderSchedule ? { note: `These figures come from an older schedule file (${res.feed}) than the newest one on this Mac.` } : {}),
      day: `A representative weekday in the week of ${res.referenceDate}.`,
      groups: res.groups.map(g => ({
        routesSharingBuses: g.routes,
        scheduledNow: g.scheduled,
        neededAtCurrentFrequency: g.implied,
        // Summed over every direction and branch of the group (#1618), not one round trip.
        runningMinutesAllPatterns: g.runningMin,
        layoverMinutesAllPatterns: g.layoverMin,
        // The same figures Studio's buses-needed page shows for each branch split (groupAtTarget).
        neededAt: neededAt(groupAtTarget(g, 'current')),
        ...(g.atTargetEven ? { neededAtWithBranchesEven: neededAt(groupAtTarget(g, 'even')) } : {}),
      })),
      targetsNote: `Atlas Studio works buses out only for every ${STUDIO_TARGETS.join(', ')} minutes. For any other frequency, say Atlas has no figure; don't work one out yourself.`,
      ...(missing ? { warning: `Atlas Studio works these out only for every ${STUDIO_TARGETS.join(', ')} minutes, not every ${every}. Give the nearest of those; don't work out ${every} yourself.` } : {}),
      howToRead: "'scheduledNow' is buses on these routes at the middle of the period; 'neededAtCurrentFrequency' is buses needed at each pattern's own frequency (running time plus layover, divided by the minutes between buses, rounded up once for the group). Where branches share a middle section, a target is for that middle, and its trips go to the branches in their current shares ('WithBranchesEven' splits them evenly). Trips to and from the garage are not in schedules and not counted. 'runningMinutesAllPatterns' and 'layoverMinutesAllPatterns' add up every direction and branch of the group (short turns left out), so they are not one round trip: never divide them by a frequency to check or replace a count.",
      source: "Atlas Studio's buses-needed file, worked out from the agency's own schedule.",
    };
  },
  routes_near: async ({ agency: q, place, metres, when }) => {
    const a = await needAgency(q);
    const res = await data.routesNear(a, String(place ?? ''), metres != null ? Number(metres) : NEARBY_ROUTES_RADIUS_M);
    if (!res.matchedStops.length) return { agency: a.name, place, routes: [], note: 'No stop name matches every part of that place. Try a station or a street name as the stops are named.', scheduleValidThrough: validThrough(a) };
    if (!isNow(when)) return { agency: a.name, place, ...res, scheduleValidThrough: validThrough(a), source: SOURCE };
    // when "now" (#1627): each route's service in the current part of the day, on today's day type.
    const now = await nowAt(a);
    const today = new Map((await data.routeList(a, now.day)).map(r => [r.name, r.figures[now.period]?.shown ?? 'no service']));
    const routes = res.routes.map(r => ({ ...r, now: today.get(r.route) ?? 'no service' }));
    return { agency: a.name, place, ...nowBlock(now, routes.every(r => r.now === 'no service')), ...res, routes, scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  stop_frequency: async ({ agency: q, stop, route, day: d }) => {
    const a = await needAgency(q);
    const dayType = data.parseDay(d);
    const res = await data.stopFrequency(a, String(stop ?? ''), dayType, route != null ? String(route) : null);
    if (!res.matched) return res.choices?.length
      ? { agency: a.name, stop, matched: null, choices: res.choices, ...(res.more ? { more: res.more } : {}), note: 'Several stops match. Ask which one is meant, or call again with one of these names exactly.' }
      : { agency: a.name, stop, matched: null, note: 'No stop name matches every part of that. Try the stop as the agency names it, or a corner.', scheduleValidThrough: validThrough(a) };
    // CIV-2089: how often any route leaves the stop needs departure times, which only the local server reads.
    return { agency: a.name, day: dayType, ...res, allRoutes: 'Not on this server: it has no combined figure for every route at a stop. Give each route\'s own figure and don\'t add them up.', mapLink: mapLink({ agencies: [a.slug], day: dayType }), scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  route_history: async ({ agency: q, route, day: d }) => {
    const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
    if (!a) throw new Error(`No agency matches "${q}".`);
    const dayType = data.parseDay(d);
    const h = await data.routeHistory(a, String(route ?? ''), dayType);
    if (!h) return { agency: a.name, history: null, note: "Atlas's History has no data for this agency." };
    if (!h.route) return { agency: a.name, history: null, note: `Atlas's History has ${h.routes} routes for this agency, none matching "${route}".` };
    return { agency: a.name, day: dayType, figure: `Each figure is ${FIGURE_LABELS.grade}, not the typical wait route_frequency gives.`, ...h, scheduleValidThrough: validThrough(a), note: 'Each schedule is one Atlas kept from that time; a part of the day with no figure is left out. Older schedules may lack weekend figures. Where a route starts or stops partway through a part of the day, Atlas counts the wait to the edge of that part, so a figure can be far longer than the gap between the trips that run (a route every 10 min until 1 AM shows every 61 min from 11 PM to 2 AM). That is the rule Atlas uses, not a data error.', source: "Atlas's History data." };
  },
  routes_by_hours: async (args) => {
    const a = await needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const endsBefore = args.ends_before != null ? data.parseClock(args.ends_before) : null;
    const startsAfter = args.starts_after != null ? data.parseClock(args.starts_after) : null;
    if (endsBefore == null && startsAfter == null) throw new Error('Give ends_before or starts_after as a clock time, such as "22:00".');
    const routes = await data.routesByHours(a, dayType, endsBefore, startsAfter);
    return { agency: a.name, day: dayType, ...(endsBefore != null ? { endsBefore: clockTime(endsBefore) } : {}), ...(startsAfter != null ? { startsAfter: clockTime(startsAfter) } : {}), routesOnDay: (await data.routeList(a, dayType)).length, count: routes.length, routes, note: 'A last trip after midnight counts as that night, not as early.', scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  schedule_changes: async ({ agency: q, offset, limit }) => {
    const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
    if (!a) throw new Error(`No agency matches "${q}".`);
    const file = await data.scheduleComparison(a.slug);
    if (!file) return { agency: a.name, comparison: null, note: 'Atlas has not built a schedule comparison for this agency.' };
    const changes = data.frequencyChanges(file);
    const from = offset != null ? Math.max(0, Number(offset)) : 0, size = limit != null ? Math.max(1, Math.min(200, Number(limit))) : 40;
    const paired = data.pairedChanges(file);
    const date = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    return {
      compares: `${file.day ?? 'one day'} service on ${date(file.before.date)} (before) with ${date(file.after.date)} (after)`,
      agency: a.name, scheduleValidThrough: validThrough(a),
      figure: `before and after are each ${FIGURE_LABELS.grade}, not the typical wait route_frequency gives.`,
      routesAdded: paired.filter(c => !c.before).map(c => c.route), routesRemoved: paired.filter(c => !c.after).map(c => c.route),
      frequencyChanges: changes.slice(from, from + size).map(c => ({ route: c.route, name: c.name, period: `${c.period} (${c.hours})`, before: c.before == null ? 'no service' : headwayEvery(c.before), after: c.after == null ? 'no service' : headwayEvery(c.after), better: c.better, ...(c.tripsBefore != null && c.tripsAfter != null ? { tripsPerDay: `${c.tripsBefore} → ${c.tripsAfter}` } : {}), ...(c.publicChange ? {} : { sameOnTheMap: true }) })),
      frequencyChangeCount: changes.length, shown: `${from + 1}–${Math.min(from + size, changes.length)}`,
      ...staleComparisonNote(file.after.date, Date.now()),
      howToRead: "before and after are Atlas's frequency grades: the route's slower direction and quietest part, as the map colours it. tripsPerDay is the route's trips that day. A big grade change with about the same trips usually means one long gap or a branch end, not a cut: check route_frequency's 'shown' before calling it one.",
      ...(from + size < changes.length ? { more: `Call again with offset ${from + size} for the next ${Math.min(size, changes.length - from - size)}.` } : {}),
    };
  },
};
