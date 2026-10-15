#!/usr/bin/env python3
"""GTFS oracle: departures per direction on a route's main stretch, read straight from the feed.

It shares no code with the pipeline, so it can judge it. Use it to build or check a hand-check
table (FREQUENCY_RULES, frequency-focus-plan step 0).

usage: stretch-departures.py <slug> <route> <day> <start> <end> [options]
  slug      agency slug; the zip is found as <feeds>/<slug>.zip, <feeds>/<slug>/*.zip (newest),
            or Atlas-worktrees/_live-data/gtfs/<slug>.zip. Or pass --zip PATH.
  route     route_short_name (or route_id)
  day       Weekday | Saturday | Sunday
  start end window, "HH:MM" or hours ("2", "6"): 2 6 is the Night window. A window that ends by 06:00
            also reads after-midnight trips written as 26:00-30:00 on the previous service day.
options:
  --stop ID        measure at this stop_id instead of the stretch's dispatch end
  --date YYYY-MM-DD   service date (default: the first matching weekday on or after today inside the
                   feed's calendar, else the last one inside it); calendar_dates exceptions apply
  --zip PATH       feed zip
  --feeds DIR      folder of feeds (default: Atlas-worktrees/_feeds)
  --min-share X    a pattern is "regular" when it has at least this share of the direction's trips
                   (default 0.2); the main stretch is the stops every regular pattern serves
  --stops N        also summarize N evenly spaced main-stretch stops per direction (default 3)

Per direction it prints the patterns, the main stretch, and at the measuring stop every departure
in the window with: count, max gap, gap from window start to the first departure, and from the
last departure to the window end. The measuring stop is the first main-stretch stop, in travel
order, that more than half of the direction's trips serve (its dispatch end).
"""
import argparse, collections, csv, datetime, glob, io, os, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS_WT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))  # .../Atlas-worktrees when run from a worktree

def clock(text):
    if ':' in text:
        h, m = text.split(':')[:2]
        return int(h) * 60 + int(m)
    return int(float(text) * 60)

def fmt(t):
    return f'{t // 60}:{t % 60:02d}'

def find_zip(slug, feeds):
    cands = [os.path.join(feeds, slug + '.zip')]
    cands += sorted(glob.glob(os.path.join(feeds, slug, '*.zip')), key=os.path.getmtime, reverse=True)
    cands.append(os.path.join(ATLAS_WT, '_live-data', 'gtfs', slug + '.zip'))
    for c in cands:
        if os.path.exists(c):
            return c
    sys.exit(f'no feed zip for {slug}; tried {cands}. Use --zip PATH.')

def read(z, name):
    if name not in z.namelist():
        return []
    with z.open(name) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig')))

def gtfs_minutes(text):
    h, m, *_ = text.split(':')
    return int(h) * 60 + int(m)

DOW = {'Weekday': 2, 'Saturday': 5, 'Sunday': 6}  # python weekday(): Wednesday, Saturday, Sunday
NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

def pick_date(day, calendar, calendar_dates, requested):
    if requested:
        return datetime.date.fromisoformat(requested)
    lo = min((r['start_date'] for r in calendar), default=None)
    hi = max((r['end_date'] for r in calendar), default=None)
    dates = [r['date'] for r in calendar_dates]
    lo = min([d for d in [lo] + dates if d], default=None)
    hi = max([d for d in [hi] + dates if d], default=None)
    if not lo or not hi:
        sys.exit('feed has no calendar')
    p = lambda s: datetime.date(int(s[:4]), int(s[4:6]), int(s[6:]))
    start, end = p(lo), p(hi)
    today = datetime.date.today()
    cur = max(start, today)
    if cur > end:
        cur = end
    step = 1 if cur <= end and cur >= today else -1
    d = cur
    for _ in range(400):
        if d.weekday() == DOW[day] and start <= d <= end:
            return d
        d += datetime.timedelta(days=step)
        if d < start or d > end:
            step = -step
            d = cur + datetime.timedelta(days=step)
    sys.exit('no date found')

def active_services(date, calendar, calendar_dates):
    ymd = date.strftime('%Y%m%d')
    active = set()
    for r in calendar:
        if r['start_date'] <= ymd <= r['end_date'] and r[NAMES[date.weekday()]] == '1':
            active.add(r['service_id'])
    for r in calendar_dates:
        if r['date'] == ymd:
            (active.add if r['exception_type'] == '1' else active.discard)(r['service_id'])
    return active

def window_hits(times, start, end):
    out = set()
    for t in times:
        if start <= t <= end:
            out.add(t)
        elif start < 360 and end <= 1440 and start + 1440 <= t <= end + 1440:
            out.add(t - 1440)  # after-midnight trip written as 24:00+ on the previous service day
    return sorted(out)

def stats(deps, start, end):
    if not deps:
        return 'no departures in the window'
    gaps = [b - a for a, b in zip(deps, deps[1:])]
    return (f'n={len(deps)} first={fmt(deps[0])} last={fmt(deps[-1])} max gap={max(gaps) if gaps else 0} '
            f'| start gap={deps[0] - start} end gap={end - deps[-1]}')

def main():
    ap = argparse.ArgumentParser(add_help=True, usage='stretch-departures.py <slug> <route> <day> <start> <end> [options]', description=__doc__.split('options:')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('slug'); ap.add_argument('route'); ap.add_argument('day', choices=list(DOW)); ap.add_argument('start'); ap.add_argument('end')
    ap.add_argument('--stop'); ap.add_argument('--date'); ap.add_argument('--zip'); ap.add_argument('--feeds', default=os.path.join(ATLAS_WT, '_feeds'))
    ap.add_argument('--min-share', type=float, default=0.2); ap.add_argument('--stops', type=int, default=3)
    a = ap.parse_args()
    start, end = clock(a.start), clock(a.end)
    zpath = a.zip or find_zip(a.slug, a.feeds)
    z = zipfile.ZipFile(zpath)
    routes = read(z, 'routes.txt'); trips = read(z, 'trips.txt'); stops = {r['stop_id']: r['stop_name'] for r in read(z, 'stops.txt')}
    calendar = read(z, 'calendar.txt'); calendar_dates = read(z, 'calendar_dates.txt')
    route_ids = {r['route_id'] for r in routes if r.get('route_short_name') == a.route} or {r['route_id'] for r in routes if r['route_id'] == a.route}
    if not route_ids:
        sys.exit(f'route {a.route} not in {zpath}')
    date = pick_date(a.day, calendar, calendar_dates, a.date)
    services = active_services(date, calendar, calendar_dates)
    mine = {t['trip_id']: t for t in trips if t['route_id'] in route_ids and t['service_id'] in services}
    if not mine:
        sys.exit(f'no {a.day} trips for {a.route} on {date}')
    seqs = collections.defaultdict(list)
    with z.open('stop_times.txt') as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig')):
            if r['trip_id'] in mine:
                seqs[r['trip_id']].append((int(r['stop_sequence']), r['stop_id'], r.get('departure_time') or r.get('arrival_time') or ''))
    print(f'{a.slug} route {a.route} {a.day} {date} window {fmt(start)}-{fmt(end)}  feed {os.path.basename(zpath)}  ({len(mine)} trips)')
    by_dir = collections.defaultdict(list)
    for tid, t in mine.items():
        if seqs.get(tid):
            by_dir[t.get('direction_id', '')].append(tid)
    for direction in sorted(by_dir):
        tids = by_dir[direction]
        ordered = {tid: [(s, sid, d) for s, sid, d in sorted(seqs[tid])] for tid in tids}
        patterns = collections.defaultdict(list)
        for tid in tids:
            patterns[tuple(sid for _, sid, _ in ordered[tid])].append(tid)
        biggest = max(len(v) for v in patterns.values())
        regular = [p for p, v in patterns.items() if len(v) / len(tids) >= a.min_share]
        print(f'\n== direction {direction}: {len(tids)} trips, {len(patterns)} patterns, {len(regular)} regular (>= {a.min_share:.0%} of trips)')
        for p, v in sorted(patterns.items(), key=lambda kv: -len(kv[1])):
            head = mine[v[0]].get('trip_headsign', '')
            print(f'   {"*" if p in regular else " "} {len(v):3} trips  {len(p):3} stops  {stops.get(p[0], p[0])} -> {stops.get(p[-1], p[-1])}  [{head}]')
        # main stretch: stops every regular pattern serves, in the order of the longest regular pattern
        common = set.intersection(*[set(p) for p in regular]) if regular else set()
        longest = max(regular, key=len) if regular else ()
        stretch = [s for s in longest if s in common]
        serves = collections.Counter(sid for tid in tids for sid in {x[1] for x in ordered[tid]})
        print(f'   main stretch: {len(stretch)} stops (served by every regular pattern)')
        if not stretch and not a.stop:
            print('   no stop is shared by every regular pattern; pass --stop'); continue
        ref = a.stop or next((s for s in stretch if serves[s] * 2 > len(tids)), stretch[0])
        def deps_at(stop):
            times = [gtfs_minutes(d) for tid in tids for _, sid, d in ordered[tid] if sid == stop and d]
            return window_hits(times, start, end)
        label = 'measured at' if a.stop else 'dispatch end (first main-stretch stop most trips serve)'
        if serves[ref] == 0:
            print(f'   stop {ref} is not served by this direction'); continue
        d = deps_at(ref)
        print(f'   {label}: {stops.get(ref, ref)} ({ref})')
        print(f'   {stats(d, start, end)}')
        print('   departures: ' + ' '.join(fmt(t) for t in d))
        if a.stops > 0 and stretch:
            picks = sorted({stretch[round(i * (len(stretch) - 1) / max(a.stops - 1, 1))] for i in range(a.stops)} - {ref}, key=stretch.index)
            for s in picks:
                print(f'   also {stops.get(s, s)} ({s}): {stats(deps_at(s), start, end)}')

if __name__ == '__main__':
    main()
