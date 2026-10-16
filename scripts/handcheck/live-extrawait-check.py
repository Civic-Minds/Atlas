#!/usr/bin/env python3
"""Hand-check Live "extra wait" at one stop against the raw archive and the timetable, without the analysis code.

Rebuilds the gaps at a stop the same way the method is written down (docs/operations/LIVE_ANALYSIS.md), from scratch: for each
service date and time-of-day period, take the timetable's trips at the stop in time order; keep stretches of at least 4 in a row
that were all seen at the stop (matched by trip number, vehicle position interpolated at the stop); the actual gaps are the
spacing of successive vehicles inside a stretch, the scheduled gaps the spacing of those timetable trips. A period's extra wait
is the average wait implied by the actual gaps (sum of squares over twice the sum) minus the one implied by the scheduled gaps;
periods are weighted by their scheduled span. Prints the number next to the analysis file's.

usage: live-extrawait-check.py --route 505 --stop "Dundas St East at Jarvis St" --direction 0 --out ../_live-data/out/ttc-505-segments.json --gtfs <dir> --archive <dir>
"""
import argparse, csv, datetime, json, math, os, collections
from zoneinfo import ZoneInfo
TZ = ZoneInfo('America/Toronto')
PERIODS = [('amPeak', 6, 9), ('midday', 9, 15), ('pmPeak', 15, 19), ('evening', 19, 23), ('late', 23, 26), ('overnight', 26, 30)]

def band_of(epoch):
    h = datetime.datetime.fromtimestamp(epoch, TZ).hour
    h = h + 24 if h < 6 else h
    for k, a, b in PERIODS:
        if a <= h < b: return k
    return None

def xy(lat, lon, lat0): return (lon * math.cos(math.radians(lat0)) * 111320.0, lat * 110540.0)
def along_of(poly, cum, p):
    best = (1e18, 0.0)
    for i in range(len(poly) - 1):
        ax, ay = poly[i]; bx, by = poly[i + 1]; dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2))
        d = math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)
        if d < best[0]: best = (d, cum[i] + t * math.sqrt(L2))
    return best[1], best[0]
def gtfs_sec(s):
    h, m, x = map(int, s.split(':')); return h * 3600 + m * 60 + x
def day_start(date):
    y, m, d = map(int, date.split('-')); return int(datetime.datetime(y, m, d, 12, tzinfo=TZ).timestamp()) - 12 * 3600
def avg_wait(gaps):
    s = sum(gaps); return sum(g * g for g in gaps) / (2 * s) if s > 0 else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--route', required=True); ap.add_argument('--stop', required=True); ap.add_argument('--direction', required=True)
    ap.add_argument('--out', required=True); ap.add_argument('--gtfs', required=True); ap.add_argument('--archive', required=True)
    a = ap.parse_args()
    out = json.load(open(a.out)); v3 = out['v3']; dates = v3['window']['dates']
    G = a.gtfs
    rids = {r['route_id'] for r in csv.DictReader(open(G + '/routes.txt', encoding='utf-8-sig')) if r['route_short_name'] == a.route}
    trips = {r['trip_id']: r for r in csv.DictReader(open(G + '/trips.txt', encoding='utf-8-sig')) if r['route_id'] in rids and r['direction_id'] == a.direction}
    stops = {r['stop_id']: (float(r['stop_lat']), float(r['stop_lon']), r['stop_name']) for r in csv.DictReader(open(G + '/stops.txt', encoding='utf-8-sig'))}
    stop_ids = [s for s, v in stops.items() if v[2].lower() == a.stop.lower()]
    sched_at = {}
    for r in csv.DictReader(open(G + '/stop_times.txt', encoding='utf-8-sig')):
        if r['trip_id'] in trips and r['stop_id'] in stop_ids: sched_at.setdefault(r['trip_id'], (r['stop_id'], gtfs_sec(r['departure_time'])))
    cal = list(csv.DictReader(open(G + '/calendar.txt', encoding='utf-8-sig')))
    cdates = list(csv.DictReader(open(G + '/calendar_dates.txt', encoding='utf-8-sig')))
    DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    def services(date):
        ymd = date.replace('-', ''); dow = DOW[(datetime.date.fromisoformat(date).weekday() + 1) % 7]
        on = {c['service_id'] for c in cal if c['start_date'] <= ymd <= c['end_date'] and c[dow] == '1'}
        for cd in cdates:
            if cd['date'] == ymd: (on.add if cd['exception_type'] == '1' else on.discard)(cd['service_id'])
        return on
    shp = collections.defaultdict(list); sids = {t['shape_id'] for t in trips.values()}
    for r in csv.DictReader(open(G + '/shapes.txt', encoding='utf-8-sig')):
        if r['shape_id'] in sids: shp[r['shape_id']].append((int(r['shape_pt_sequence']), float(r['shape_pt_lat']), float(r['shape_pt_lon'])))
    geo = {}
    def shape(s):
        if s not in geo:
            pts = sorted(shp[s]); lat0 = pts[0][1]; poly = [xy(p[1], p[2], lat0) for p in pts]; cum = [0.0]
            for i in range(1, len(poly)): cum.append(cum[-1] + math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]))
            geo[s] = (poly, cum, lat0)
        return geo[s]
    # passes at the stop per trip per service date (vehicle position interpolated at the stop's place on the shape)
    passes = collections.defaultdict(dict)   # date -> trip -> epoch
    tracks = collections.defaultdict(list)
    for date in dates:
        d0 = datetime.date.fromisoformat(date)
        for f in (date, (d0 + datetime.timedelta(days=1)).isoformat()):
            p = f'{a.archive}/{a.route}-{f}.jsonl'
            if not os.path.exists(p): continue
            for line in open(p):
                if not line.strip(): continue
                snap = json.loads(line)
                for v in snap['v']:
                    if v[1] in sched_at: tracks[(date, v[1])].append((v[4] if len(v) > 4 and v[4] else snap['ts'], v[2], v[3]))
    for (date, tid), tr in tracks.items():
        tr = sorted(set(tr)); poly, cum, lat0 = shape(trips[tid]['shape_id']); stop_id = sched_at[tid][0]
        sa, _ = along_of(poly, cum, xy(stops[stop_id][0], stops[stop_id][1], lat0))
        proj = []
        for t, la, lo in tr:
            al, off = along_of(poly, cum, xy(la, lo, lat0))
            if off <= 50 and (not proj or (t > proj[-1][0] and al >= proj[-1][1] - 5)): proj.append((t, al))
        for (t1, a1), (t2, a2) in zip(proj, proj[1:]):
            if a1 <= sa <= a2 and a2 > a1 and t2 - t1 <= 150:
                t = t1 + (sa - a1) / (a2 - a1) * (t2 - t1)
                base = day_start(date)
                if abs(t - (base + sched_at[tid][1])) < 6 * 3600: passes[date][tid] = t   # this service day's trip, not the neighbour's
                break
    total = weight = 0.0; nwin = 0; gaps_n = 0
    for date in dates:
        on = services(date); base = day_start(date)
        sched = sorted([(tid, base + dep) for tid, (_, dep) in sched_at.items() if trips[tid]['service_id'] in on], key=lambda x: x[1])
        by_band = collections.defaultdict(list)
        for tid, t in sched:
            b = band_of(t)
            if b is not None: by_band[b].append((tid, t))
        for band, items in by_band.items():
            seen = passes.get(date, {}); all_seen = sorted(seen[t] for t, _ in items if t in seen)
            run = []
            def flush():
                nonlocal total, weight, nwin, gaps_n, run
                if len(run) >= 4 and all(run[i][1] - run[i - 1][1] <= 1800 for i in range(1, len(run))):
                    lo, hi = min(r[2] for r in run), max(r[2] for r in run)
                    inside = [t for t in all_seen if lo <= t <= hi]
                    ag = [b - c for c, b in zip(inside, inside[1:])]; sg = [run[i][1] - run[i - 1][1] for i in range(1, len(run))]
                    if ag and sg:
                        wa, ws = avg_wait(ag), avg_wait(sg)
                        if wa is not None and ws is not None:
                            span = sum(sg); total += (wa - ws) * span; weight += span; nwin += 1; gaps_n += len(ag)
                run = []
            for tid, t in items:
                if tid not in seen: flush(); continue
                run.append((tid, t, seen[tid]))
            flush()
    mine = total / weight / 60 if weight else None
    ref = [s for s in v3['extraWait']['all'] if s['directionId'] == int(a.direction) and s['name'].lower() == a.stop.lower()]
    print(f"route {a.route} direction {a.direction} {a.stop}")
    print(f"  recomputed extra wait: {mine:.2f} min from {gaps_n} gaps in {nwin} stretches" if mine is not None else '  recomputed: no usable stretch')
    print(f"  analysis file:         {ref[0]['extraWaitMin']} min from {ref[0]['gaps']} gaps (scheduled every {ref[0]['scheduledGapMin']} min)" if ref else '  analysis file: stop not listed (service not every 15 min or better, or too few gaps)')

if __name__ == '__main__':
    main()
