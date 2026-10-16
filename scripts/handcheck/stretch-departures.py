#!/usr/bin/env python3
"""GTFS oracle: departures per direction on a route's main stretch, read straight from the feed.

It shares no code with the pipeline, so it can judge it. Use it to build or check a hand-check
table (FREQUENCY_RULES, frequency-focus-plan step 0).

usage: stretch-departures.py <slug> <route> <day> <start> <end> [options]
  slug      agency slug. The zip is the exact one the reprocess reads: the R2 archive zip
            (gtfs/archive/<slug>/<date>-<hash>.zip), chosen by the pipeline's own selection code and
            downloaded read-only into Atlas-worktrees/_feeds/archive-cache/. The zip used is printed.
            Pass --zip PATH to use a file, or --feeds DIR to look in a folder of feeds instead
            (<feeds>/<slug>.zip, <feeds>/<slug>/*.zip newest, _live-data/gtfs/<slug>.zip).
  route     route_short_name (or route_id)
  day       Weekday | Saturday | Sunday
  start end window, "HH:MM" or hours ("2", "6"): 2 6 is the Night window. A window that ends by 06:00
            also reads after-midnight trips written as 26:00-30:00 on the previous service day.
options:
  --stop ID        measure at this stop_id instead of the stretch's dispatch end
  --date YYYY-MM-DD   service date (default: the first matching weekday on or after today inside the
                   feed's calendar, else the last one inside it); calendar_dates exceptions apply
  --zip PATH       feed zip (overrides the archive lookup)
  --feeds DIR      look for <slug>.zip in this folder of feeds instead of the R2 archive
  --min-share X    a pattern is "regular" when it has at least this share of the direction's trips
                   (default 0.2); the main stretch is the stops every regular pattern serves
  --stops N        also summarize N evenly spaced main-stretch stops per direction (default 3)
  --at dispatch|mid  where to measure a stretch (default dispatch). mid is the step 3 spec's middle stop (D2): take the
                   stretch's stops in travel order, keep those served by more than half of the trips that serve any
                   stop of the stretch, and measure at index floor(n / 2) of that list.
  --tails          also measure each tail: a regular pattern's run of at least 5 contiguous stops and 1 km off the main
                   stretch (runs sharing their middle stop, or overlapping in half their stops, are one tail), at the
                   tail's reference stop (same --at rule, over the tail's stops). On by default with --at mid.
  --json           print the result as JSON (for scripts) instead of text

Per direction it prints the patterns, the main stretch, and at the measuring stop every departure
in the window with: count, max gap, gap from window start to the first departure, and from the
last departure to the window end. The measuring stop is the first main-stretch stop, in travel
order, that more than half of the direction's trips serve (its dispatch end).
"""
import argparse, collections, csv, datetime, glob, io, json, math, os, subprocess, sys, zipfile

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

def archive_zip(slug):
    """The zip the reprocess reads for this slug (scripts/handcheck/resolve-archive-zip.ts)."""
    repo = os.path.abspath(os.path.join(HERE, '..', '..'))
    try:
        out = subprocess.run(['npx', 'tsx', 'scripts/handcheck/resolve-archive-zip.ts', slug], cwd=repo, capture_output=True, text=True, check=True)
        info = json.loads(out.stdout.strip().splitlines()[-1])
    except subprocess.CalledProcessError as e:
        sys.exit(f'could not resolve the archive zip for {slug}: {(e.stderr or e.stdout).strip()[-400:]}\nUse --zip PATH or --feeds DIR.')
    except (ValueError, IndexError):
        sys.exit(f'could not read the archive zip answer for {slug}: {out.stdout[-300:]}')
    sys.stderr.write(f"zip: {info['zip']}  ({info.get('key') or info['source']}; {info['reason']})\n")
    return info['zip']

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

SHARED_STRETCH_MIN_STOPS = 5   # the pipeline's tail thresholds (pipeline/sharedStretch.ts)
SHARED_STRETCH_MIN_KM = 1.0

def km_between(a, b):
    p = math.pi / 180
    x = (b[1] - a[1]) * p * math.cos((a[0] + b[0]) / 2 * p)
    y = (b[0] - a[0]) * p
    return 6371 * math.hypot(x, y)

def majority_middle(stretch, trip_stops):
    """The spec's reference stop: stops served by more than half of the trips that serve the stretch, then index n // 2."""
    ids = set(stretch)
    serving = [s for s in trip_stops if ids & s]
    maj = [st for st in stretch if sum(1 for s in serving if st in s) * 2 > len(serving)]
    pool = maj or list(stretch)
    return pool[len(pool) // 2] if pool else None

def find_tails(patterns, regular, common, coords):
    """Tails of the regular patterns: runs of >= 5 contiguous off-stretch stops, >= 1 km; overlapping runs merge."""
    runs = []
    for p in regular:
        run = []
        for s in list(p) + [None]:
            if s is not None and s not in common:
                run.append(s); continue
            if len(run) >= SHARED_STRETCH_MIN_STOPS and all(x in coords for x in run):
                length = sum(km_between(coords[x], coords[y]) for x, y in zip(run, run[1:]))
                if length >= SHARED_STRETCH_MIN_KM:
                    runs.append((list(run), length))
            run = []
    merged = []
    for stops_, length in sorted(runs, key=lambda r: -len(r[0])):
        for m in merged:
            overlap = len(set(stops_) & set(m['stops']))
            if overlap * 2 >= len(stops_) or stops_[len(stops_) // 2] in m['stops']:
                m['stops'] += [x for x in stops_ if x not in m['stops']]
                break
        else:
            merged.append({'stops': list(stops_), 'km': length})
    return merged

def main():
    ap = argparse.ArgumentParser(add_help=True, usage='stretch-departures.py <slug> <route> <day> <start> <end> [options]', description=__doc__.split('options:')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('slug'); ap.add_argument('route'); ap.add_argument('day', choices=list(DOW)); ap.add_argument('start'); ap.add_argument('end')
    ap.add_argument('--stop'); ap.add_argument('--date'); ap.add_argument('--zip'); ap.add_argument('--feeds')
    ap.add_argument('--min-share', type=float, default=0.2); ap.add_argument('--stops', type=int, default=3)
    ap.add_argument('--at', choices=['dispatch', 'mid'], default='dispatch'); ap.add_argument('--tails', action='store_true'); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    start, end = clock(a.start), clock(a.end)
    zpath = a.zip or (find_zip(a.slug, a.feeds) if a.feeds else archive_zip(a.slug))
    z = zipfile.ZipFile(zpath)
    stops_rows = read(z, 'stops.txt')
    routes = read(z, 'routes.txt'); trips = read(z, 'trips.txt'); stops = {r['stop_id']: r['stop_name'] for r in stops_rows}
    coords = {r['stop_id']: (float(r['stop_lat']), float(r['stop_lon'])) for r in stops_rows if r.get('stop_lat') and r.get('stop_lon')}
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
    result = {'slug': a.slug, 'route': a.route, 'day': a.day, 'date': str(date), 'window': [start, end], 'feed': os.path.basename(zpath), 'at': a.at, 'trips': len(mine), 'directions': []}
    say = (lambda *x: None) if a.json else print
    say(f'{a.slug} route {a.route} {a.day} {date} window {fmt(start)}-{fmt(end)}  feed {os.path.basename(zpath)}  ({len(mine)} trips)  measured at: {a.at}')
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
        regular = [p for p, v in patterns.items() if len(v) / len(tids) >= a.min_share]
        if not regular:  # the spec's fallback: the most common pattern alone is regular
            regular = [max(patterns, key=lambda p: len(patterns[p]))]
        say(f'\n== direction {direction}: {len(tids)} trips, {len(patterns)} patterns, {len(regular)} regular (>= {a.min_share:.0%} of trips)')
        for p, v in sorted(patterns.items(), key=lambda kv: -len(kv[1])):
            head = mine[v[0]].get('trip_headsign', '')
            say(f'   {"*" if p in regular else " "} {len(v):3} trips  {len(p):3} stops  {stops.get(p[0], p[0])} -> {stops.get(p[-1], p[-1])}  [{head}]')
        # main stretch: stops every regular pattern serves, in the order of the longest regular pattern
        common = set.intersection(*[set(p) for p in regular]) if regular else set()
        longest = max(regular, key=len) if regular else ()
        stretch = [s for s in longest if s in common]
        trip_stops = [{x[1] for x in ordered[tid]} for tid in tids]
        serves = collections.Counter(sid for st in trip_stops for sid in st)
        fallback = False
        if not stretch:  # the spec's fallback: stops served by more than half of the direction's trips, in the longest pattern's order
            stretch = [s_ for s_ in max(patterns, key=len) if serves[s_] * 2 > len(tids)]
            common = set(stretch); fallback = bool(stretch)
        say(f'   main stretch: {len(stretch)} stops (' + ('FALLBACK: regular patterns share no stop, so the stops served by more than half of the trips' if fallback else 'served by every regular pattern') + ')')
        dres = {'direction': direction, 'trips': len(tids), 'patterns': len(patterns), 'regular': len(regular), 'stretch_stops': len(stretch), 'fallback': False, 'main': None, 'also': [], 'tails': []}
        dres['fallback'] = fallback
        result['directions'].append(dres)
        if not stretch and not a.stop:
            say('   no stop is shared by every regular pattern; pass --stop'); continue
        def deps_at(stop, only=None):
            times = [gtfs_minutes(d) for tid in (only if only is not None else tids) for _, sid, d in ordered[tid] if sid == stop and d]
            return window_hits(times, start, end)
        def summary(stop, only=None):
            d_ = deps_at(stop, only); gaps = [y - x for x, y in zip(d_, d_[1:])]
            return {'stop': stop, 'name': stops.get(stop, stop), 'n': len(d_), 'first': d_[0] if d_ else None, 'last': d_[-1] if d_ else None,
                    'max_gap': max(gaps) if gaps else None, 'median_gap': (sorted(gaps)[len(gaps) // 2] if gaps else None),
                    'start_gap': d_[0] - start if d_ else None, 'end_gap': end - d_[-1] if d_ else None, 'departures': d_}
        if a.stop:
            ref, label = a.stop, 'measured at'
        elif a.at == 'mid':
            ref, label = majority_middle(stretch, trip_stops), 'middle stop (served by more than half of the trips, index n // 2)'
        else:
            ref, label = next((s for s in stretch if serves[s] * 2 > len(tids)), stretch[0]), 'dispatch end (first main-stretch stop most trips serve)'
        if serves[ref] == 0:
            say(f'   stop {ref} is not served by this direction'); continue
        d = deps_at(ref)
        dres['main'] = summary(ref)
        say(f'   {label}: {stops.get(ref, ref)} ({ref})')
        say(f'   {stats(d, start, end)}')
        say('   departures: ' + ' '.join(fmt(t) for t in d))
        if a.stops > 0 and stretch:
            picks = sorted({stretch[round(i * (len(stretch) - 1) / max(a.stops - 1, 1))] for i in range(a.stops)} - {ref}, key=stretch.index)
            for st in picks:
                dres['also'].append(summary(st))
                say(f'   also {stops.get(st, st)} ({st}): {stats(deps_at(st), start, end)}')
        if a.tails or a.at == 'mid':
            for t in find_tails(patterns, regular, common, coords):
                serving = [tid for tid in tids if set(t['stops']) & {x[1] for x in ordered[tid]}]
                tref = majority_middle(t['stops'], [{x[1] for x in ordered[tid]} for tid in serving]) if a.at == 'mid' else t['stops'][len(t['stops']) // 2]
                only = [tid for tid in tids if tref in {x[1] for x in ordered[tid]}]
                ts = summary(tref, only); ts.update({'stops': len(t['stops']), 'km': round(t['km'], 2), 'trips': len(only)})
                dres['tails'].append(ts)
                say(f'   tail {stops.get(tref, tref)} ({tref}) {len(t["stops"])} stops {t["km"]:.1f} km {len(only)} trips: {stats(deps_at(tref, only), start, end)}')
    if a.json:
        print(json.dumps(result))

if __name__ == '__main__':
    main()
