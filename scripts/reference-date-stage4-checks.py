"""Reference-date plan, stage 4 checks: hand-check the shadow report's changed routes against the GTFS.

Local and read-only (no network, no R2). Reads the shadow report JSON written by
scripts/reference-date-shadow.ts for the sample and the dates OLD and NEW read, then reads each
route's timetable straight from the local zip, independently of serviceDays.ts and
transit-calendar.ts: a trip runs on a date when its service's calendar.txt range covers the date
and the weekday flag is set, unless calendar_dates.txt removes it (type 2); a type 1 entry adds it.

For each sampled route and day it asks what a rider sees in the week starting the anchor
(Oct 28 - Nov 3 2026 for a run on Oct 27):
- gained: RIGHT if the route runs that day in the rider's week, WRONG if not.
- lost: RIGHT if the route does not run that day in the rider's week, WRONG if it does.
- trip counts only: RIGHT if NEW's trip count matches the rider's date, WRONG if OLD's matches
  and NEW's does not.
A date is a one-off for the route when its trip count differs from the same weekday one and two weeks
either side, which agree with each other (a game day, a holiday; every-other-week service is not). A one-off rider date is judged by the neighbouring weeks;
NEW's date must not be a one-off, or the check is WRONG.
Separate flags: depends on plan question 5 (NEW reads a timetable that starts within 7 days of
the anchor) and zip age (the zip has no service at all from some date before the end of the 8
weeks, so a rider date after it cannot be judged from this zip: UNKNOWN).

Usage: nice -n 15 python3 scripts/reference-date-stage4-checks.py [--shadow FILE] [--out FILE]
"""
import argparse
import csv
import io
import json
import re
import zipfile
from collections import Counter, defaultdict
from datetime import date, timedelta

REPORTS = '/Users/ryan/Developer/Code/Platforms/Atlas-worktrees/_reports'
DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
CAL_FIELDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
TOP_AGENCIES = 10
TOP_ROUTE_CAP = 20
TRIP_ONLY_SAMPLE = ['hamilton', 'septa', 'wsf']


def ymd(d):
    return d.strftime('%Y%m%d')


def parse(s):
    return date(int(s[:4]), int(s[4:6]), int(s[6:8]))


class Feed:
    """One zip's calendar, calendar_dates, trips and routes, read with the csv module."""

    def __init__(self, path):
        z = zipfile.ZipFile(path)
        names = z.namelist()
        base = ''
        if 'routes.txt' not in names:
            hit = next((n for n in names if n.endswith('/routes.txt')), None)
            if hit:
                base = hit[: -len('routes.txt')]

        def rows(name):
            if base + name not in names:
                return []
            text = z.read(base + name).decode('utf-8-sig', errors='replace')
            return [{(k or '').strip(): (v or '').strip() for k, v in r.items()} for r in csv.DictReader(io.StringIO(text))]

        self.calendar = defaultdict(list)
        for r in rows('calendar.txt'):
            if re.fullmatch(r'\d{8}', r.get('start_date', '')) and re.fullmatch(r'\d{8}', r.get('end_date', '')):
                self.calendar[r['service_id']].append((r['start_date'], r['end_date'], [r.get(f) == '1' for f in CAL_FIELDS]))
        self.exceptions = defaultdict(dict)  # date -> service -> '1' | '2'
        for r in rows('calendar_dates.txt'):
            prev = self.exceptions[r['date']].get(r['service_id'])
            # Removal then addition on the same date: the addition wins.
            if prev != '1':
                self.exceptions[r['date']][r['service_id']] = r['exception_type']
        self.routes = {r['route_id']: r for r in rows('routes.txt')}
        self.trips_by_route = defaultdict(Counter)  # route_id -> service -> trips
        self.services = set()
        for t in rows('trips.txt'):
            self.trips_by_route[t['route_id']][t['service_id']] += 1
            self.services.add(t['service_id'])

    def runs(self, service, day):
        exc = self.exceptions.get(ymd(day), {}).get(service)
        if exc == '1':
            return True
        if exc == '2':
            return False
        dow = day.weekday()
        s = ymd(day)
        return any(start <= s <= end and flags[dow] for start, end, flags in self.calendar.get(service, []))

    def route_ids(self, label):
        """Route ids drawn under a shadow label: route_short_name, else long name, else id; plus letter branches the pipeline merges onto it (`label X`)."""
        out = []
        for rid, r in self.routes.items():
            name = r.get('route_short_name') or r.get('route_long_name') or rid
            if name == label or re.fullmatch(re.escape(label) + r'\s+[A-Z]', name):
                out.append(rid)
        return out

    def trips_on(self, route_ids, day):
        return sum(n for rid in route_ids for svc, n in self.trips_by_route.get(rid, {}).items() if self.runs(svc, day))

    def last_service(self, start, days):
        """Last date in [start, start + days) with any service that has trips, or None."""
        last = None
        for k in range(days):
            d = start + timedelta(days=k)
            if any(self.runs(s, d) for s in self.services):
                last = d
        return last


def old_date(old, day):
    """The date OLD nominally reads for a day: next-service-dates' date, else the date of that day within 3 days of the reference."""
    if old.get('mode') == 'next service dates':
        nsd = old['nextServiceDates']
        return nsd['Weekday'] if day in DAY_NAMES[:5] else nsd[day]
    ref = parse(old['referenceDate'])
    for k in range(-3, 4):
        d = ref + timedelta(days=k)
        if d.weekday() == DAY_NAMES.index(day):
            return ymd(d)
    return None


def spread(pairs, cap):
    """Distinct routes, each on one day, chosen round-robin over days and gained/lost so the sample spreads."""
    by_key = defaultdict(list)
    for p in pairs:
        by_key[(p['day'], p['kind'])].append(p)
    keys = sorted(by_key, key=lambda k: (DAY_NAMES.index(k[0]), k[1]))
    seen, out = set(), []
    while len(out) < cap and any(by_key[k] for k in keys):
        for k in keys:
            while by_key[k] and by_key[k][0]['route'] in seen:
                by_key[k].pop(0)
            if by_key[k] and len(out) < cap:
                p = by_key[k].pop(0)
                seen.add(p['route'])
                out.append(p)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shadow', default=f'{REPORTS}/reference-date-shadow-2026-10-27.json')
    ap.add_argument('--out', default=f'{REPORTS}/reference-date-stage4-checks-2026-10-27.md')
    ap.add_argument('--extra', default='', help='comma-separated slug:route:day checks to add even when the route did not change (kind "checked")')
    ap.add_argument('--before', default='', help="a previous run's JSON: adds its counts and the checks whose verdict changed")
    a = ap.parse_args()
    shadow = json.load(open(a.shadow))
    anchor = parse(shadow['anchor'])
    window_end = anchor + timedelta(days=55)
    top = [r['slug'] for r in shadow['ranking'][:TOP_AGENCIES]]
    changed = {r['slug'] for r in shadow['ranking']}

    samples = []  # (agency, feed, pair)
    notes = {}
    for ag in shadow['agencies']:
        pairs = []
        trip_pairs = []
        for f in ag['feeds']:
            if 'days' not in f:
                continue
            for day in DAY_NAMES:
                d = f['days'][day]
                pairs += [{'feed': f, 'day': day, 'route': r, 'kind': 'gained'} for r in d['routesGained']]
                pairs += [{'feed': f, 'day': day, 'route': r, 'kind': 'lost'} for r in d['routesLost']]
                trip_pairs += [{'feed': f, 'day': day, 'route': t['route'], 'kind': 'trips', 'old': t['old'], 'new': t['new']} for t in d['tripChanges']]
        if ag['slug'] in changed:
            routes = {p['route'] for p in pairs}
            if ag['slug'] in top:
                chosen = spread(pairs, TOP_ROUTE_CAP)
                if len(routes) > TOP_ROUTE_CAP:
                    notes[ag['slug']] = f'{len(routes)} changed routes; {TOP_ROUTE_CAP} checked, spread across days and gained/lost'
            else:
                chosen = spread(pairs, 1)
            samples += [(ag, p) for p in chosen]
        elif ag['slug'] in TRIP_ONLY_SAMPLE and trip_pairs:
            samples.append((ag, max(trip_pairs, key=lambda p: abs(p['new'] - p['old']))))
        for extra in filter(None, a.extra.split(',')):
            slug, route, day = extra.split(':')
            if slug == ag['slug']:
                f = next(f for f in ag['feeds'] if 'days' in f)
                samples.append((ag, {'feed': f, 'day': day, 'route': route, 'kind': 'checked'}))

    feeds = {}
    last_cache = {}
    results = []
    for ag, p in samples:
        f = p['feed']
        feed = feeds.get(f['file']) or feeds.setdefault(f['file'], Feed(f['file']))
        if f['file'] not in last_cache:
            last_cache[f['file']] = feed.last_service(anchor, 70)
        last = last_cache[f['file']]
        ids = feed.route_ids(p['route'])
        day_i = DAY_NAMES.index(p['day'])
        rider = anchor + timedelta(days=(day_i - anchor.weekday()) % 7)
        od = old_date(f['old'], p['day'])
        nd = f['new']['dates'][p['day']]
        rider_n = feed.trips_on(ids, rider)
        old_n = feed.trips_on(ids, parse(od)) if od else None
        new_n = feed.trips_on(ids, parse(nd)) if nd else 0
        period = f['new'].get('period') or {}
        q5 = bool(period.get('start') and period['start'] > shadow['anchor'] and (parse(period['start']) - anchor).days <= 7)
        zip_age = last is None or last < window_end - timedelta(days=6)
        # Route listed date by date (calendar_dates only) and its listing ends inside the 8 weeks:
        # possibly the zip's age rather than a real end.
        route_services = {svc for rid in ids for svc in feed.trips_by_route.get(rid, {})}
        route_last = None
        for k in range(-7, 70):
            d = anchor + timedelta(days=k)
            if any(feed.runs(svc, d) for svc in route_services):
                route_last = d
        dates_only = bool(route_services) and not any(svc in feed.calendar for svc in route_services)
        route_zip_age = dates_only and route_last is not None and route_last < window_end - timedelta(days=6)

        def count(day):
            return feed.trips_on(ids, day) if last is None or day <= last else None

        def usual(day):
            """The route's count on this date, unless the date is a one-off, then the neighbouring weeks' count.
            A one-off (a game day, a holiday) differs from the same weekday a week before and a week after,
            which agree with each other, and from two weeks before and after too, so a route that runs every
            other week is not a one-off. A lasting change matches one neighbour, so it is not one either."""
            own = feed.trips_on(ids, day)
            w = {k: count(day + timedelta(days=7 * k)) for k in (-2, -1, 1, 2)}
            neighbours = [w[-1]] + ([w[1]] if w[1] is not None else [])
            if all(n != own for n in neighbours) and len(set(neighbours)) == 1 and all(w[k] != own for k in (-2, 2) if w[k] is not None):
                return neighbours[0]
            return own

        def agrees(n):
            """Does a route with n usual trips that day agree with the shadow's change?"""
            if p['kind'] == 'gained':
                return n > 0
            if p['kind'] == 'lost':
                return n == 0
            if p['kind'] == 'checked':
                return n == new_n
            return n == p['new']

        reason = []
        rider_usual = usual(rider)
        new_usual = usual(parse(nd)) if nd else 0
        if p['kind'] == 'checked':
            reason.append(f'unchanged route checked directly: rider date {ymd(rider)} has {rider_n} trips (usual {rider_usual}); OLD date {old_n}, NEW date {new_n}')
        elif p['kind'] == 'trips':
            reason.append(f'rider date {ymd(rider)} has {rider_n} trips (usual {rider_usual}); OLD date {old_n}, NEW date {new_n}')
        else:
            reason.append(f'{"runs " + str(rider_n) + " trips" if rider_n else "does not run"} on {ymd(rider)}' + (f' (the rider date is a one-off; the weeks around it have {rider_usual})' if rider_usual != rider_n else ''))
        if not ids:
            verdict = 'UNKNOWN'
            reason.append('route label not found in routes.txt')
        elif last is None or rider > last:
            verdict = 'UNKNOWN'
            if last is not None:
                reason.append(f'the zip has no service on the rider date (last service {ymd(last)})')
            else:
                end = (f['new'].get('window') or {}).get('end')
                saved = f.get('fileDate')
                expired = end is not None and saved is not None and end < saved
                reason.append(f'the zip has no service on the rider date: its last service is {end}, ' + ('before the zip was saved (feed expired)' if expired else f'after the zip was saved on {saved} (zip age)'))
        elif agrees(rider_usual if p['kind'] != 'trips' else rider_n) and (p['kind'] != 'trips' or new_n == rider_n):
            verdict = 'RIGHT'
        elif q5 and agrees(usual(parse(period['start']) + timedelta(days=day_i))):
            verdict = 'Q5'
            reason.append(f'right for the timetable starting {period["start"]}, wrong for the rider week')
        elif zip_age and f['new']['source'] in ('anchor-feed-end', 'last-weeks') and nd and parse(nd) < rider:
            verdict = 'ZIP AGE'
            reason.append('NEW read an earlier week because this zip stops listing service soon after the anchor')
        else:
            verdict = 'WRONG'
        if verdict != 'RIGHT' and p['kind'] in ('gained', 'lost'):
            near = [rider + timedelta(days=7 * k) for k in range(-4, 5)]
            near = [d for d in near if last is None or d <= last]
            running = sum(feed.trips_on(ids, d) > 0 for d in near)
            reason.append(f'runs on {running} of {len(near)} {p["day"]}s within 4 weeks of the rider date')
        if nd and new_n != new_usual:
            reason.append(f'NEW date is a one-off for the route ({new_n} trips; the weeks around it have {new_usual})')
            if verdict == 'RIGHT':
                verdict = 'WRONG'
        if q5:
            reason.append(f'NEW reads the timetable from {period["start"]} (question 5)')
        if zip_age:
            reason.append(f'zip service ends {ymd(last)}' if last else 'zip has no service after the anchor')
        if route_zip_age:
            reason.append(f'route listed date by date only to {ymd(route_last)}')
        results.append({
            'agency': ag['slug'] + ('' if f['feed'] == 'main' else f' ({f["feed"]})'), 'country': ag['country'], 'route': p['route'],
            'day': p['day'], 'kind': p['kind'], 'old_date': od, 'new_date': nd, 'rider_date': ymd(rider),
            'old_trips': old_n, 'new_trips': new_n, 'rider_trips': rider_n, 'verdict': verdict, 'q5': q5,
            'zip_age': zip_age or route_zip_age, 'reason': '; '.join(reason),
        })

    c = Counter(r['verdict'] for r in results)
    q5n = sum(r['q5'] for r in results)
    zipn = sum(r['zip_age'] for r in results)
    agencies_checked = len({r['agency'].split(' ')[0] for r in results})
    md = ['# Reference-date stage 4 checks, run date 2026-10-27', '']
    md.append(f'Checks of the shadow report\'s changed routes against the GTFS in each local zip, read directly with Python (scripts/reference-date-stage4-checks.py), not through the pipeline code. "Rider date" is that day in the week starting the anchor, {ymd(anchor)} to {ymd(anchor + timedelta(days=6))}. OLD dates are nominal: the day within 3 days of OLD\'s reference date (OLD can shift weeks internally).')
    md.append('')
    md += ['## Summary', '']
    md.append(f'- Checked {len(results)} route-days in {agencies_checked} agencies.')
    md.append(f'- RIGHT: {c["RIGHT"]}. WRONG: {c["WRONG"]}.')
    md.append(f'- Q5: {c["Q5"]} are wrong for the rider week but right for a new timetable starting within 7 days (they depend on question 5). In all, {q5n} checks sit in a feed where NEW reads such a timetable.')
    md.append(f'- ZIP AGE: {c["ZIP AGE"]} are wrong for the rider week because the zip (saved Oct 12-15) stops listing service soon after the anchor. In all, {zipn} checks are in a zip or route whose listing ends inside the 8 weeks.')
    expired = sum(r['verdict'] == 'UNKNOWN' and '(feed expired)' in r['reason'] for r in results)
    md.append(f'- UNKNOWN: {c["UNKNOWN"]}, where the zip has no service on the rider date: {expired} feeds expired before their zip was saved, and {c["UNKNOWN"] - expired} zips end between their save date and the rider date (zip age).')
    md.append('- A rider date that is itself a one-off (a game day, a holiday: its count differs from the same weekday one and two weeks either side, which agree) is judged by the neighbouring weeks; a route that runs every other week is not a one-off. NEW\'s date must not be a one-off for the route, or the check is WRONG.')
    for slug, note in notes.items():
        md.append(f'- {slug}: {note}.')
    wrong = [r for r in results if r['verdict'] == 'WRONG']
    if wrong:
        md += ['', '## WRONG cases (not explained by question 5 or the zips\' age)', '']
        for r in wrong:
            md.append(f'- {r["agency"]} {r["route"]}, {r["day"]} ({r["kind"]}): {r["reason"]}')
    if a.before:
        before = json.load(open(a.before))
        bc = Counter(r['verdict'] for r in before)
        md += ['', '## Before the tweak (previous run)', '', f'Previous run: {a.before}.', '']
        md.append(f'- Checked {len(before)} route-days. RIGHT {bc["RIGHT"]}, WRONG {bc["WRONG"]}, Q5 {bc["Q5"]}, ZIP AGE {bc["ZIP AGE"]}, UNKNOWN {bc["UNKNOWN"]}.')
        key = lambda r: (r['agency'], r['route'], r['day'], r['kind'])
        old_by = {key(r): r for r in before}
        new_by = {key(r): r for r in results}
        changes = []
        for k in sorted(set(old_by) | set(new_by)):
            o, n = old_by.get(k), new_by.get(k)
            if o and n and o['verdict'] == n['verdict'] and o['new_date'] == n['new_date']:
                continue
            was = f'{o["verdict"]} (NEW {o["new_date"]})' if o else 'not checked'
            now = f'{n["verdict"]} (NEW {n["new_date"]})' if n else 'no longer a change, not checked'
            changes.append(f'| {k[0]} | {k[1]} | {k[2]} | {k[3]} | {was} | {now} |')
        md += ['', '### Checks that changed', '']
        md += (['| Agency | Route | Day | Change | Before | After |', '|---|---|---|---|---|---|'] + changes) if changes else ['None.']
    md += ['', '## All checks', '', '| Agency | Route | Day | Change | OLD date | NEW date | Rider date | Verdict | Q5 | Zip age | Reason |', '|---|---|---|---|---|---|---|---|---|---|---|']
    for r in results:
        md.append(f'| {r["agency"]} | {r["route"]} | {r["day"]} | {r["kind"]} | {r["old_date"]} | {r["new_date"]} | {r["rider_date"]} | {r["verdict"]} | {"yes" if r["q5"] else ""} | {"yes" if r["zip_age"] else ""} | {r["reason"]} |')
    open(a.out, 'w').write('\n'.join(md) + '\n')
    json.dump(results, open(a.out.replace('.md', '.json'), 'w'), indent=1)
    print(f'{len(results)} checks: {dict(c)}; q5 {q5n}; zip age {zipn}; {a.out}')


if __name__ == '__main__':
    main()
