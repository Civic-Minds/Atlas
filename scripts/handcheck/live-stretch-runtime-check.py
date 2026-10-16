#!/usr/bin/env python3
"""Hand-check Live run time over the main stretch against the raw archive and the timetable, without the analysis code.

Reads each direction's stretch ends (stop A, stop B) from a segment-delay output (v3.runningTime.stretch), then, from the
raw archive and the GTFS files only: groups archived positions into runs (one vehicle on one trip number, split at gaps
over 10 min), projects them onto the trip's shape (plain geometry, written here), and interpolates the moment the vehicle
was 25 m past A (its departure) and the moment it reached B (its arrival). Scheduled = timetable arrival at B minus
timetable departure at A for that trip. Rows with sched <= 0, actual <= 0 or |actual - sched| > 3600 s are dropped.

Prints N random runs side by side, then recomputes per direction, over every run it can measure in the window, n, median
scheduled and median actual (minutes) and compares them with v3.runningTime.bands.all. The analysis output holds no
per-trip stretch times, so --tol (seconds) applies to the per-direction medians. Runs 15+ min off their own timetable
(median over at least 5 stops) are skipped: the analysis reassigns or drops those (swapped trip numbers), so a small n
difference is expected and is printed as a percentage.

usage: live-stretch-runtime-check.py --route 510 --json <ttc-510-segments.json> --gtfs <dir> --archive <dir> [--n 12] [--seed 1] [--tol 30]
Exit code 1 when a direction's median scheduled or actual differs by more than --tol seconds, or nothing could be measured.
"""
import argparse, csv, datetime, json, math, os, random, statistics, sys
from zoneinfo import ZoneInfo

TZ = ZoneInfo('America/Toronto')
DEP_OFFSET_M = 25      # departure = vehicle 25 m past the stop
MAX_PERP_M = 50        # a sample further from the shape ends the leg
MAX_SPEED = 25         # m/s between samples; faster is a bad fix
MAX_BRACKET_S = 150    # the two samples around a stop must be this close in time
RUN_GAP_S = 600        # a gap this long starts a new run
SWAP_OFF_S = 900       # median offset from own timetable that marks a swapped trip number
CELL = 100.0           # grid cell for the segment index, metres

def xy(lat, lon, lat0): return (lon * math.cos(math.radians(lat0)) * 111320.0, lat * 110540.0)

def gtfs_sec(s):
    h, m, x = map(int, s.split(':')); return h * 3600 + m * 60 + x

def day_start(date):
    """Noon minus 12 h, local time: the GTFS service-day origin (right across DST changes)."""
    y, mo, d = map(int, date.split('-'))
    return int(datetime.datetime(y, mo, d, 12, tzinfo=TZ).timestamp()) - 12 * 3600

def service_date(t):
    l = datetime.datetime.fromtimestamp(t, TZ)
    return (l.date() - datetime.timedelta(days=1) if l.hour < 4 else l.date()).isoformat()

class Shape:
    def __init__(self, pts):
        self.lat0 = pts[0][0]
        self.poly = [xy(la, lo, self.lat0) for la, lo in pts]
        self.cum = [0.0]
        for i in range(1, len(self.poly)):
            self.cum.append(self.cum[-1] + math.hypot(self.poly[i][0] - self.poly[i - 1][0], self.poly[i][1] - self.poly[i - 1][1]))
        self.grid = {}
        for i in range(len(self.poly) - 1):
            (ax, ay), (bx, by) = self.poly[i], self.poly[i + 1]
            for gx in range(int(math.floor((min(ax, bx) - 60) / CELL)), int(math.floor((max(ax, bx) + 60) / CELL)) + 1):
                for gy in range(int(math.floor((min(ay, by) - 60) / CELL)), int(math.floor((max(ay, by) + 60) / CELL)) + 1):
                    self.grid.setdefault((gx, gy), []).append(i)

    def _seg(self, i, p):
        (ax, ay), (bx, by) = self.poly[i], self.poly[i + 1]; dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2))
        return math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy), self.cum[i] + t * math.sqrt(L2)

    def project(self, lat, lon, lo=None, hi=None):
        """(along, perp) of the nearest point; with lo/hi, only shape parts in that along range count. None if nothing within ~60 m."""
        p = xy(lat, lon, self.lat0)
        best = None
        for i in self.grid.get((int(math.floor(p[0] / CELL)), int(math.floor(p[1] / CELL))), ()):
            if lo is not None and (self.cum[i + 1] < lo or self.cum[i] > hi): continue
            d, al = self._seg(i, p)
            if lo is not None and not (lo <= al <= hi): continue
            if best is None or d < best[1]: best = (al, d)
        return best

    def project_full(self, lat, lon, lo=None):
        """Nearest point over the whole shape (for stops); with lo, only along >= lo."""
        p = xy(lat, lon, self.lat0); best = None
        for i in range(len(self.poly) - 1):
            if lo is not None and self.cum[i + 1] < lo: continue
            d, al = self._seg(i, p)
            if lo is not None and al < lo: continue
            if best is None or d < best[1]: best = (al, d)
        return best

def legs_of(shape, samples):
    """Project a run, searching near the previous position first; split at off-shape samples, drop impossible speeds."""
    legs = [[]]; hint = None
    for t, la, lo in samples:
        pr = shape.project(la, lo, hint - 300, hint + 2000) if hint is not None else None
        if pr is None or pr[1] > MAX_PERP_M: pr = shape.project(la, lo)
        if pr is None or pr[1] > MAX_PERP_M:
            if legs[-1]: legs.append([])
            continue
        al = pr[0]; hint = al; leg = legs[-1]
        if leg and t > leg[-1][0] and abs(al - leg[-1][1]) / (t - leg[-1][0]) > MAX_SPEED: continue
        if not leg or t > leg[-1][0]: leg.append((t, al))
    return [l for l in legs if len(l) >= 2]

def crossing(legs, target):
    """First moment the run passed `target` metres along the shape (interpolated), or None."""
    for leg in legs:
        for (t1, a1), (t2, a2) in zip(leg, leg[1:]):
            if a1 <= target <= a2 and a2 > a1 and t2 - t1 <= MAX_BRACKET_S: return t1 + (target - a1) / (a2 - a1) * (t2 - t1)
    return None

def read(path, keep=None):
    with open(path, encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            if keep is None or keep(row): yield row

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--route', required=True); ap.add_argument('--json', required=True)
    ap.add_argument('--gtfs', required=True); ap.add_argument('--archive', required=True)
    ap.add_argument('--n', type=int, default=12); ap.add_argument('--seed', type=int, default=1); ap.add_argument('--tol', type=float, default=30)
    a = ap.parse_args()
    v3 = json.load(open(a.json))['v3']
    window = list(v3['window']['dates']); wset = set(window)
    stretch = {int(d): (s['fromStopId'], s['toStopId']) for d, s in v3['runningTime']['stretch'].items()}
    bands = {int(d): b for d, b in v3['runningTime']['bands']['all'].items()}

    route_ids = {r['route_id'] for r in read(os.path.join(a.gtfs, 'routes.txt')) if r['route_short_name'] == a.route}
    trips = {r['trip_id']: r for r in read(os.path.join(a.gtfs, 'trips.txt'), lambda r: r['route_id'] in route_ids)}
    st = {}
    for r in read(os.path.join(a.gtfs, 'stop_times.txt'), lambda r: r['trip_id'] in trips):
        st.setdefault(r['trip_id'], []).append((int(r['stop_sequence']), r['stop_id'], gtfs_sec(r['arrival_time']), gtfs_sec(r['departure_time'])))
    for k in st: st[k].sort()
    sids = {t['shape_id'] for t in trips.values()}
    raw = {}
    for r in read(os.path.join(a.gtfs, 'shapes.txt'), lambda r: r['shape_id'] in sids):
        raw.setdefault(r['shape_id'], []).append((int(r['shape_pt_sequence']), float(r['shape_pt_lat']), float(r['shape_pt_lon'])))
    shapes = {k: Shape([(la, lo) for _, la, lo in sorted(v)]) for k, v in raw.items()}
    stops = {r['stop_id']: (float(r['stop_lat']), float(r['stop_lon']), r['stop_name']) for r in read(os.path.join(a.gtfs, 'stops.txt'))}

    # services active on each window date
    cal = list(read(os.path.join(a.gtfs, 'calendar.txt')))
    exc = {}
    for r in read(os.path.join(a.gtfs, 'calendar_dates.txt')): exc[(r['service_id'], r['date'])] = r['exception_type']
    def active(date):
        ymd = date.replace('-', ''); wd = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][datetime.date.fromisoformat(date).weekday()]
        out = {c['service_id'] for c in cal if c['start_date'] <= ymd <= c['end_date'] and c[wd] == '1'}
        for (sid, d), e in exc.items():
            if d == ymd: (out.add if e == '1' else out.discard)(sid)
        return out
    services = {d: active(d) for d in window}

    # stop positions along each shape: each stop projected at or after the previous one (stop-sequence order)
    stop_along = {}
    def along_for(tid):
        sh = trips[tid]['shape_id']
        key = (sh, tuple(s[1] for s in st[tid]))
        if key not in stop_along:
            out = []; last = 0.0
            for _, sid, _, _ in st[tid]:
                la, lo, _ = stops[sid]; pr = shapes[sh].project_full(la, lo, last)
                if pr is None or pr[1] > 60: out.append(None); continue
                out.append(pr); last = pr[0]
            stop_along[key] = out
        return stop_along[key]

    print(f"route {a.route}, window {window[0]}..{window[-1]} ({len(window)} days), JSON {a.json}\n")
    print("stretch geometry (along the trip's shape, metres; distance of the stop from the shape):")
    seen_geo = set()
    for d, (A, B) in sorted(stretch.items()):
        for tid, t in trips.items():
            if int(t['direction_id']) != d or tid not in st: continue
            ids = [s[1] for s in st[tid]]
            if A not in ids or B not in ids or ids.index(A) >= ids.index(B) or t['shape_id'] in seen_geo: continue
            seen_geo.add(t['shape_id']); al = along_for(tid); pa, pb = al[ids.index(A)], al[ids.index(B)]
            f = lambda p: 'not on shape' if p is None else f"{p[0]:7.0f} m ({p[1]:.0f} m off)"
            print(f"  dir {d} shape {t['shape_id']:12} A {A} {stops[A][2]!r}: {f(pa)}   B {B} {stops[B][2]!r}: {f(pb)}")
    print()

    # archive: samples per (vehicle, trip) for trips that serve A then B in this direction
    serving = {}
    for tid, t in trips.items():
        d = int(t['direction_id'])
        if d not in stretch or tid not in st: continue
        ids = [s[1] for s in st[tid]]; A, B = stretch[d]
        if A in ids and B in ids and ids.index(A) < ids.index(B): serving[tid] = d
    files = set()
    for w in window:
        for k in (-1, 0, 1): files.add((datetime.date.fromisoformat(w) + datetime.timedelta(days=k)).isoformat())
    by_run = {}
    for day in sorted(files):
        path = os.path.join(a.archive, f'{a.route}-{day}.jsonl')
        if not os.path.exists(path): continue
        for line in open(path):
            if not line.strip(): continue
            snap = json.loads(line)
            for v in snap['v']:
                if v[1] in serving: by_run.setdefault((v[0], v[1]), set()).add((v[4] if len(v) > 4 and v[4] else snap['ts'], v[2], v[3]))

    rows = []; cnt = {'runs': 0, 'off_window': 0, 'not_running_that_day': 0, 'swapped': 0, 'no_dep_A': 0, 'no_arr_B': 0, 'arr_B_only_via_dep': 0, 'filtered': 0}
    a_gaps = {0: [], 1: []}
    for (veh, tid), ss in by_run.items():
        samples = sorted(ss); runs = [[samples[0]]]
        for s in samples[1:]:
            if s[0] == runs[-1][-1][0]: continue
            if s[0] - runs[-1][-1][0] > RUN_GAP_S: runs.append([])
            runs[-1].append(s)
        d = serving[tid]; A, B = stretch[d]; t = trips[tid]; sh = shapes[t['shape_id']]; times = st[tid]
        ids = [x[1] for x in times]; al = along_for(tid)
        for run in runs:
            if len(run) < 2: continue
            legs = legs_of(sh, run)
            deps = [(i, crossing(legs, al[i][0] + DEP_OFFSET_M)) for i in range(len(ids)) if al[i] is not None]
            deps = [(i, x) for i, x in deps if x is not None]
            if not deps: continue
            date = service_date(deps[0][1])
            if date not in wset: cnt['off_window'] += 1; continue
            cnt['runs'] += 1
            if t['service_id'] not in services[date]: cnt['not_running_that_day'] += 1; continue
            base = day_start(date)
            first_dep = {}
            for i, x in deps: first_dep.setdefault(ids[i], (x, times[i][3]))
            offs = [x - (base + sd) for x, sd in first_dep.values()]
            if len(offs) >= 5 and abs(statistics.median(offs)) >= SWAP_OFF_S: cnt['swapped'] += 1; continue
            ia, ib = ids.index(A), ids.index(B)
            if al[ia] is None or al[ib] is None: cnt['no_dep_A'] += 1; continue
            ta = crossing(legs, al[ia][0] + DEP_OFFSET_M)
            if ta is None: cnt['no_dep_A'] += 1; continue
            tb = crossing(legs, al[ib][0])
            if tb is None:
                cnt['no_arr_B'] += 1
                if crossing(legs, al[ib][0] + DEP_OFFSET_M) is not None: cnt['arr_B_only_via_dep'] += 1
                continue
            sched = times[ib][2] - times[ia][3]; actual = tb - ta
            if sched <= 0 or actual <= 0 or abs(actual - sched) > 3600: cnt['filtered'] += 1; continue
            # sampling gap around A (how well the departure there is pinned down)
            for leg in legs:
                for (t1, a1), (t2, a2) in zip(leg, leg[1:]):
                    if a1 <= al[ia][0] + DEP_OFFSET_M <= a2: a_gaps[d].append(t2 - t1); break
                else: continue
                break
            rows.append({'date': date, 'dir': d, 'trip': tid, 'veh': veh, 'startHour': times[ia][3] // 3600, 'sched': sched, 'actual': actual})

    rnd = random.Random(a.seed); sample = rnd.sample(rows, min(a.n, len(rows)))
    print(f"{len(sample)} random runs (minutes; stretch = departure 25 m past A to arrival at B):")
    print(f"  {'date':10} {'dir':3} {'trip':10} {'vehicle':7} {'hour':>4} {'sched':>6} {'actual':>7} {'over':>6}")
    for r in sorted(sample, key=lambda r: (r['date'], r['dir'], r['sched'])):
        print(f"  {r['date']:10} {r['dir']:<3} {r['trip']:10} {r['veh']:7} {r['startHour']:>4} {r['sched'] / 60:>6.1f} {r['actual'] / 60:>7.1f} {(r['actual'] - r['sched']) / 60:>+6.1f}")
    print("  (the analysis output has no per-trip stretch times, so these are shown for inspection, not compared)\n")

    print("runs in window: " + ', '.join(f"{k} {v}" for k, v in cnt.items()) + f"; measured {len(rows)}")
    for d in sorted(a_gaps):
        if a_gaps[d]: print(f"dir {d}: sample gap around A median {statistics.median(a_gaps[d]):.0f} s, max {max(a_gaps[d]):.0f} s")
    print(f"\n{'dir':3} {'':10} {'n':>6} {'sched med':>10} {'actual med':>11} {'p90':>6}")
    bad = 0
    for d in sorted(stretch):
        mine = [r for r in rows if r['dir'] == d]
        j = bands.get(d)
        if j: print(f"{d:<3} {'JSON':10} {j['n']:>6} {j['scheduledMin']:>10.1f} {j['typicalMin']:>11.1f} {j['p90Min']:>6.1f}")
        if not mine: print(f"{d:<3} recomputed: nothing measured"); bad += 1; continue
        sm = statistics.median(r['sched'] for r in mine); am = statistics.median(r['actual'] for r in mine)
        acts = sorted(r['actual'] for r in mine); p90 = acts[min(len(acts) - 1, int(math.ceil(0.9 * len(acts))) - 1)]
        print(f"{d:<3} {'recomputed':10} {len(mine):>6} {sm / 60:>10.1f} {am / 60:>11.1f} {p90 / 60:>6.1f}")
        if j:
            dn = (len(mine) - j['n']) / j['n'] * 100; ds = sm - j['scheduledMin'] * 60; da = am - j['typicalMin'] * 60
            ok = abs(ds) <= a.tol and abs(da) <= a.tol
            if not ok: bad += 1
            print(f"{'':3} {'difference':10} {dn:>+5.1f}% {ds:>+9.0f}s {da:>+10.0f}s   {'within' if ok else 'OUTSIDE'} {a.tol:.0f} s")
    sys.exit(1 if bad or not rows else 0)

if __name__ == '__main__':
    main()
