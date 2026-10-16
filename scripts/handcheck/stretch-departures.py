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
  --min-share X    use the old share rule instead of the spec: a pattern is "regular" when it has at least
                   this share of the direction's trips (for comparison only; the spec's rule is the default)
  --stops N        also summarize N evenly spaced main-stretch stops per direction (default 3)
  --at dispatch|mid  where to measure a stretch (default dispatch). mid is the step 3 spec's middle stop (D2): take the
                   stretch's stops in travel order, keep those served by more than half of the trips that serve any
                   stop of the stretch, and measure at index floor(n / 2) of that list.
  --tails          also measure each tail: a regular pattern's run of at least 5 contiguous stops and 1 km off the main
                   stretch, split wherever the set of regular patterns serving it changes (rule 3), at the tail's
                   reference stop (same --at rule, over the tail's stops). On by default with --at mid.
  --json           print the result as JSON (for scripts) instead of text

Patterns and the main stretch follow FREQUENCY_RULES rules 1-3, ported here from the rules: a pattern
is regular when it runs steadily through a daytime period at its own middle stop (steady gaps, steady
edges, service on both sides of the period's midpoint), never a burst (under 3 trips, or all within
90 minutes, or one rush-hour period with under 4) nor a short turn under 20% of the trips on a longer
regular pattern; with none steady by day, any period counts; with none at all, the busiest pattern.
The main stretch is the stops every regular pattern serves; when they share none, the regular pattern
with the most stop visits (trips x stops). Each trip counts its first visit of each stop.

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

# The spec's stretch selector (FREQUENCY_RULES rules 1-3), ported from the rules, not imported.
PERIODS = [('amPeak', 360, 540), ('midday', 540, 900), ('pmPeak', 900, 1140), ('evening', 1140, 1380), ('late', 1380, 1560), ('overnight', 1560, 1800)]
DAYTIME = ('amPeak', 'midday', 'pmPeak', 'evening')
ALL_PERIODS = tuple(k for k, _, _ in PERIODS)
MIN_UNSUSTAINED_EXCESS_MINUTES = 15   # pipeline/headway-utils.ts (FREQUENCY_RULES table B)
MIN_UNSUSTAINED_RATIO = 1.7
BOUNDARY_DOMINANT_RATIO = 8
MIN_SCHEDULE_DEPARTURES = 3           # rule 1: fewer trips, or all within BURST_MAX_SPAN_MINUTES, is a burst
BURST_MAX_SPAN_MINUTES = 90
MIN_PEAK_BLOCK_DEPARTURES = 4         # a pattern running only in one rush-hour period needs this many there
SHORT_TURN_MIN_SHARE = 0.2            # rule 1: a short turn under this share on a longer regular pattern is a variant

def js_round(x):
    return math.floor(x + 0.5)

def median_sorted(g):
    m = len(g) // 2
    return (g[m - 1] + g[m]) / 2 if len(g) % 2 == 0 else g[m]

def period_steady(times):
    """Per period: the steady test (gap and boundary checks on the plain median gap), None without 3 departures."""
    out = {}
    for key, start, end in PERIODS:
        dt = list(times) + ([t + 1440 for t in times if t < 1440] if end > 1440 else [])
        w = sorted({t for t in dt if start <= t <= end})
        if len(w) < 3:
            continue
        gaps = [b - a for a, b in zip(w, w[1:])]
        value = js_round(median_sorted(sorted(gaps)))
        mx = max(gaps)
        steady_gaps = not (mx - value >= MIN_UNSUSTAINED_EXCESS_MINUTES and mx / value >= MIN_UNSUSTAINED_RATIO) if value > 0 else True
        edges = value > 0 and (w[0] - start) / value <= BOUNDARY_DOMINANT_RATIO and (end - w[-1]) / value <= BOUNDARY_DOMINANT_RATIO
        # D8: steady, and service on both sides of the period's midpoint
        mid = (start + end) / 2
        out[key] = steady_gaps and edges and w[0] < mid and w[-1] > mid
    return out

def spec_selector(tids, ordered, coords):
    """Rules 1-3: regular patterns, main stretch, tails. ordered[tid] = first visit of each stop, in order."""
    patterns = {}
    for tid in tids:
        patterns.setdefault(tuple(sid for _, sid, _ in ordered[tid]), []).append(tid)
    def starts(p):
        return [gtfs_minutes(ordered[t][0][2]) for t in patterns[p] if ordered[t][0][2]]
    def eligible(p):
        st = starts(p)
        if len(patterns[p]) < MIN_SCHEDULE_DEPARTURES or not st or max(st) - min(st) <= BURST_MAX_SPAN_MINUTES:
            return False
        one_peak = any(all(a <= t < b for t in st) for a, b in ((360, 540), (900, 1140)))
        return not one_peak or len(patterns[p]) >= MIN_PEAK_BLOCK_DEPARTURES
    def steady_in(p, periods):
        stop = p[len(p) // 2]
        times = [gtfs_minutes(d) for t in patterns[p] for _, sid, d in ordered[t] if sid == stop and d]
        flags = period_steady(times)
        return any(flags.get(k) for k in periods)
    ok = [p for p in patterns if eligible(p)]
    regular = [p for p in ok if steady_in(p, DAYTIME)] or [p for p in ok if steady_in(p, ALL_PERIODS)]
    def lies_on(p, other):
        on = set(other); run = []; runs = []
        for s_ in list(p) + [None]:
            if s_ is not None and s_ not in on:
                run.append(s_); continue
            if run: runs.append(run)
            run = []
        def run_km(r):
            if not all(x in coords for x in r): return 0
            return sum(km_between(coords[x], coords[y]) for x, y in zip(r, r[1:]))
        return all(len(r) < SHARED_STRETCH_MIN_STOPS or run_km(r) < SHARED_STRETCH_MIN_KM for r in runs)
    def minor_turn(p):
        return len(patterns[p]) < SHORT_TURN_MIN_SHARE * len(tids) and any(o is not p and len(o) > len(p) and lies_on(p, o) for o in regular)
    if any(not minor_turn(p) for p in regular):
        regular = [p for p in regular if not minor_turn(p)]
    note = ''
    if not regular:
        regular = [max(patterns, key=lambda p: len(patterns[p]))]; note = 'no pattern runs steadily: the busiest pattern alone is regular'
    longest = max(regular, key=len)
    stretch = [s_ for s_ in longest if all(s_ in p for p in regular)]
    disconnected = not stretch
    if disconnected:  # rule 2: regular patterns share no stop, the one with the most stop visits is the main stretch
        stretch = list(max(regular, key=lambda p: len(patterns[p]) * len(p)))
        note = 'regular patterns share no stop: the regular pattern with the most stop visits'
    common = set(stretch)
    # rule 3: each regular pattern's runs off the main stretch, split wherever the set of regular patterns serving them changes
    def serving(stop):
        return tuple(i for i, p in enumerate(regular) if stop in p)
    tails, seen = [], set()
    for p in regular:
        run, run_set = [], None
        def close(run):
            whole = disconnected and len(run) == len(p)
            if whole or len(run) >= SHARED_STRETCH_MIN_STOPS:
                if all(x in coords for x in run):
                    length = sum(km_between(coords[x], coords[y]) for x, y in zip(run, run[1:]))
                    k = tuple(sorted(run))
                    if (whole or length >= SHARED_STRETCH_MIN_KM) and k not in seen:
                        seen.add(k); tails.append({'stops': list(run), 'km': length})
        for stop in p:
            if stop in common:
                close(run); run, run_set = [], None; continue
            st = serving(stop)
            if run_set is not None and st != run_set:
                close(run); run = []
            run.append(stop); run_set = st
        close(run)
    return patterns, regular, stretch, tails, disconnected, note

def main():
    ap = argparse.ArgumentParser(add_help=True, usage='stretch-departures.py <slug> <route> <day> <start> <end> [options]', description=__doc__.split('options:')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('slug'); ap.add_argument('route'); ap.add_argument('day', choices=list(DOW)); ap.add_argument('start'); ap.add_argument('end')
    ap.add_argument('--stop'); ap.add_argument('--date'); ap.add_argument('--zip'); ap.add_argument('--feeds')
    ap.add_argument('--min-share', type=float, default=None); ap.add_argument('--stops', type=int, default=3)
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
        ordered = {}
        for tid in tids:  # each trip's first visit of each stop, as the pipeline's trips carry them
            seen_, visits = set(), []
            for s, sid, d in sorted(seqs[tid]):
                if sid not in seen_:
                    seen_.add(sid); visits.append((s, sid, d))
            ordered[tid] = visits
        trip_stops = [{x[1] for x in ordered[tid]} for tid in tids]
        serves = collections.Counter(sid for st in trip_stops for sid in st)
        fallback = False
        if a.min_share is not None:  # the old share rule, for comparison only
            patterns = collections.defaultdict(list)
            for tid in tids:
                patterns[tuple(sid for _, sid, _ in ordered[tid])].append(tid)
            regular = [p for p, v in patterns.items() if len(v) / len(tids) >= a.min_share] or [max(patterns, key=lambda p: len(patterns[p]))]
            common = set.intersection(*[set(p) for p in regular])
            stretch = [s_ for s_ in max(regular, key=len) if s_ in common]
            if not stretch:
                stretch = [s_ for s_ in max(patterns, key=len) if serves[s_] * 2 > len(tids)]
                fallback = bool(stretch)
            tails = find_tails(patterns, regular, set(stretch), coords)
            rule, note = f'>= {a.min_share:.0%} of trips (old share rule)', 'FALLBACK: stops served by more than half of the trips' if fallback else ''
        else:
            patterns, regular, stretch, tails, fallback, note = spec_selector(tids, ordered, coords)
            rule = 'steady through a period at their middle stop'
        say(f'\n== direction {direction}: {len(tids)} trips, {len(patterns)} patterns, {len(regular)} regular ({rule})')
        for p, v in sorted(patterns.items(), key=lambda kv: -len(kv[1])):
            head = mine[v[0]].get('trip_headsign', '')
            say(f'   {"*" if p in regular else " "} {len(v):3} trips  {len(p):3} stops  {stops.get(p[0], p[0])} -> {stops.get(p[-1], p[-1])}  [{head}]')
        say(f'   main stretch: {len(stretch)} stops (' + (note or 'served by every regular pattern') + ')')
        dres = {'direction': direction, 'trips': len(tids), 'patterns': len(patterns), 'regular': len(regular), 'stretch_stops': len(stretch), 'fallback': bool(fallback), 'main': None, 'also': [], 'tails': []}
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
            for t in tails:
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
