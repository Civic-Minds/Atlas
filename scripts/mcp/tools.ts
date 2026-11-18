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
import { headwayEvery } from '../../shared/headwayText';
import { NEARBY_ROUTES_RADIUS_M } from '../../shared/rules/limits';
import { LIVE_TOOLS, liveHandlers } from './liveTools';
import { needAgency, needPeriod, window, mapLink, validThrough, SOURCE, windowNote, type Args } from './toolHelpers';

export * from './toolDefs';
export * from './toolHelpers';
export { LIVE_TOOLS };

export const handlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  ...liveHandlers,
  list_agencies: async ({ query, region, country, near, km }) => {
    if (near != null) {
      const res = await data.agenciesNear(String(near), km != null ? Number(km) : 60);
      if (!res) throw new Error(`No agency or city matching "${near}".`);
      return { ...res, agencies: res.agencies.slice(0, 40).map(a => `${a.name} | ${a.region ?? ''} | ${a.km} km`), columns: 'name | region | distance between area centres' };
    }
    const q = String(query ?? '').trim().toLowerCase(), reg = String(region ?? '').trim().toLowerCase(), ctry = String(country ?? '').trim();
    const all = await data.availableAgencies();
    if (!q && !reg && !ctry) return { agencies: all.length, note: 'Filter by name or city, region or country to list them.' };
    const hits = all.filter(a => (!q || [a.slug, a.name, ...(a.cities ?? [])].some(x => x.toLowerCase().includes(q)))
      && (!reg || (a.region ?? '').toLowerCase() === reg)
      && (!ctry || data.sameCountry(countryForRegion(a.region), ctry)));
    if (!hits.length && q && !reg && !ctry) {
      // A service brand is not an agency name (Viva is part of York Region Transit): look for it in route names.
      const inRoutes = await data.agenciesWithRouteName(q);
      if (inRoutes.length) return { matches: 0, note: `No agency is named "${query}". It appears in route names at these agencies, so it may be a service run by one of them: ${inRoutes.slice(0, 8).map(x => x.agency).join(', ')}.`, inRouteNames: inRoutes.slice(0, 8) };
    }
    return { matches: hits.length, agencies: hits.slice(0, 40).map(a => [a.name, a.region ?? '', validThrough(a) ?? ''].join(' | ')), columns: 'name | region | schedule valid through', ...(hits.length > 40 ? { note: 'First 40 shown; narrow the filter for the rest.' } : {}) };
  },
  rank_agencies: async (args) => {
    const agencies = await data.rankAgencies();
    if (!agencies) throw new Error('The agency index has not been built for the current data. Run: nice -n 15 npx tsx scripts/mcp/buildIndex.ts');
    const dayType = data.parseDay(args.day), key = needPeriod(args.period), minutes = Number(args.every);
    let lo = args.min_routes != null ? Number(args.min_routes) : 0, hi = args.max_routes != null ? Number(args.max_routes) : Infinity;
    let like: string | null = null;
    let kind: 'bus' | 'rail' | 'ferry' | null = args.kind === 'bus' || args.kind === 'rail' || args.kind === 'ferry' ? args.kind : null;
    const KIND_TEXT = { bus: 'buses only', rail: 'with rail', ferry: 'ferries only' };
    const ends = new Map((await data.publicAgencies()).map(x => [x.slug, validThrough(x)]));
    let skipParts = false;
    if (args.similar_to != null) {
      const a = await needAgency(args.similar_to);
      const self = agencies.find(x => x.slug === a.slug);
      if (!self) throw new Error(`${a.name} is not in the index.`);
      kind ??= self.kind;
      skipParts = args.include_parts !== true;
      like = `${a.name}: ${self.weekdayRoutes} weekday routes, ${KIND_TEXT[self.kind]}`;
      lo = Math.ceil(self.weekdayRoutes / 2); hi = self.weekdayRoutes * 2;
    }
    const reg = String(args.region ?? '').trim().toLowerCase(), ctry = String(args.country ?? '').trim();
    const pool = agencies.filter(a => (!reg || (a.region ?? '').toLowerCase() === reg) && (!ctry || data.sameCountry(a.country, ctry)) && a.weekdayRoutes >= lo && a.weekdayRoutes <= hi
      && (!kind || a.kind === kind) && !(skipParts && a.partOf));
    // Count from the waits alone, then read route names only for the agencies shown.
    const waits = await data.rankWaits(dayType);
    const at = PERIOD_KEYS.indexOf(key);
    const counted = pool.map(a => {
      const routes = waits[a.slug] ?? [];
      const meeting = routes.map((w, i) => ({ i, wait: w[at] })).filter(r => r.wait != null && r.wait <= minutes).sort((x, y) => x.wait! - y.wait!);
      return { a, routesOnDay: routes.length, meeting };
    }).sort((x, y) => y.meeting.length - x.meeting.length || x.a.name.localeCompare(y.a.name));
    const limit = args.limit != null ? Number(args.limit) : 15;
    const shown = await Promise.all(counted.slice(0, limit).map(async ({ a, routesOnDay, meeting }) => {
      const labels = await data.rankLabels(a.slug, dayType);
      return { agency: a.name, region: a.region, ...(a.partOf ? { partOf: a.partOf } : {}), kind: KIND_TEXT[a.kind], scheduleValidThrough: ends.get(a.slug) ?? null, weekdayRoutes: a.weekdayRoutes, routesOnDay, routesMeeting: meeting.length, routes: meeting.map(r => `${labels[r.i][0]}${labels[r.i][1] ? ` ${labels[r.i][1]}` : ''} (every ${r.wait})`) };
    }));
    return {
      day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes,
      ...(like ? { peersOf: like } : {}), ...(kind ? { kind: KIND_TEXT[kind] } : {}), ...(skipParts ? { leftOut: 'agencies that are part of a larger operator' } : {}), sizeRange: `${lo}–${hi === Infinity ? 'any' : hi} weekday routes`,
      agenciesCompared: counted.length, ranking: shown, source: SOURCE,
    };
  },
  route_frequency: async (args) => {
    const a = await needAgency(args.agency);
    const dayType = data.parseDay(args.day);
    const found = data.findRoute(await data.routeList(a, dayType), String(args.route ?? ''));
    if (!found) throw new Error(`${a.name} has no route matching "${args.route}" on ${dayType}.`);
    const r = await data.routeWithRows(a, dayType, found);
    const w = window(args);
    const sameRoutes = await data.sameNameRoutes(a, dayType, r);
    return {
      agency: a.name, route: r.name, name: r.longName, mode: r.mode, day: dayType,
      // The summary holds these, made by the same functions from the same rows: a hosted call doesn't work them out again.
      periods: PERIOD_KEYS.map(p => found.figures[p]),
      service: found.span,
      branches: await data.branchesOf(a, dayType, r),
      branchesNote: 'Branches that end at the same stop are one row, with their trips counted once; startsAt names where its trips begin.',
      ...(() => { const same = sameRoutes; return same.length ? { sameNameRoutes: same, sameNameNote: `Other ${a.name} routes with the same name, often a night or express version on the same street. A rider on this street can use them too; combined_frequency between two stops counts them together.` } : {}; })(),
      ...(w ? { window: w.label, hourly: data.hourlyFrequency(r, w.start, w.end, await data.endOfRows(a, dayType, r)), windowNote: windowNote(w), hourlyNote: "Each column is one branch's own frequency by hour. Branches that end at the same stop share their trips, so the direction as a whole runs more often than any one column says." } : {}),
      mapLink: mapLink({ route: found.routeIds[0] != null ? { agency: a.slug, routeId: found.routeIds[0] } : undefined, day: dayType }),
      scheduleValidThrough: validThrough(a), source: SOURCE,
    };
  },
  routes_at_frequency: async ({ agency: q, period: p, every: n, day: d }) => {
    const a = await needAgency(q);
    const dayType = data.parseDay(d), key = needPeriod(p), minutes = Number(n);
    const res = await data.routesMeeting(a, dayType, key, minutes);
    return { agency: a.name, day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, meeting: res.meeting.map(m => ({ route: m.route, name: m.longName, mode: m.mode, shown: m.shown, waitMinutes: m.waitMinutes })), mapLink: mapLink({ agencies: [a.slug], day: dayType, period: key, every: minutes }), scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  compare_agencies: async ({ agencies, period: p, every: n, day: d }) => {
    const dayType = data.parseDay(d), key = needPeriod(p), minutes = Number(n);
    const rows = await Promise.all((Array.isArray(agencies) ? agencies : []).map(async q => {
      const a = await needAgency(q);
      const res = await data.routesMeeting(a, dayType, key, minutes);
      return { slug: a.slug, agency: a.name, routesOnDay: res.routesOnDay, routesRunningInPeriod: res.routesRunningInPeriod, routesMeeting: res.meeting.length, scheduleValidThrough: validThrough(a) };
    }));
    return { day: dayType, period: `${PERIOD_LABELS[key]} (${formatPeriodRange(key)})`, every: minutes, agencies: rows.map(({ slug: _slug, ...row }) => row), mapLink: mapLink({ agencies: rows.map(r => r.slug), day: dayType, period: key, every: minutes }), source: SOURCE };
  },
  routes_near: async ({ agency: q, place, metres }) => {
    const a = await needAgency(q);
    const res = await data.routesNear(a, String(place ?? ''), metres != null ? Number(metres) : NEARBY_ROUTES_RADIUS_M);
    if (!res.matchedStops.length) return { agency: a.name, place, routes: [], note: 'No stop name matches every part of that place. Try a station or a street name as the stops are named.', scheduleValidThrough: validThrough(a) };
    return { agency: a.name, place, ...res, scheduleValidThrough: validThrough(a), source: SOURCE };
  },
  route_history: async ({ agency: q, route, day: d }) => {
    const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
    if (!a) throw new Error(`No agency matches "${q}".`);
    const dayType = data.parseDay(d);
    const h = await data.routeHistory(a, String(route ?? ''), dayType);
    if (!h) return { agency: a.name, history: null, note: "Atlas's History has no data for this agency." };
    if (!h.route) return { agency: a.name, history: null, note: `Atlas's History has ${h.routes} routes for this agency, none matching "${route}".` };
    return { agency: a.name, day: dayType, ...h, scheduleValidThrough: validThrough(a), note: 'Each schedule is one Atlas kept from that time; a part of the day with no figure is left out. Older schedules may lack weekend figures. Where a route starts or stops partway through a part of the day, Atlas counts the wait to the edge of that part, so a figure can be far longer than the gap between the trips that run (a route every 10 min until 1 AM shows every 61 min from 11 PM to 2 AM). That is the rule Atlas uses, not a data error.', source: "Atlas's History data." };
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
      routesAdded: paired.filter(c => !c.before).map(c => c.route), routesRemoved: paired.filter(c => !c.after).map(c => c.route),
      frequencyChanges: changes.slice(from, from + size).map(c => ({ route: c.route, name: c.name, period: `${c.period} (${c.hours})`, before: c.before == null ? 'no service' : headwayEvery(c.before), after: c.after == null ? 'no service' : headwayEvery(c.after), better: c.better, ...(c.publicChange ? {} : { sameOnTheMap: true }) })),
      frequencyChangeCount: changes.length, shown: `${from + 1}–${Math.min(from + size, changes.length)}`,
      ...(from + size < changes.length ? { more: `Call again with offset ${from + size} for the next ${Math.min(size, changes.length - from - size)}.` } : {}),
    };
  },
};
