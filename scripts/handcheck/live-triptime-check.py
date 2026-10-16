#!/usr/bin/env python3
"""Hand-check Live end-to-end trip times against the raw archive and the timetable, without the analysis code.

Takes random trips from a segment-delay run (the --runtimes-out file of scripts/live-segment-delay.ts) and recomputes each:
project the archived positions of that trip number onto its GTFS shape (plain geometry, written here), interpolate the moment
the vehicle was 25 m past the first stop (its departure) and the moment it reached the last stop, and subtract. The timetable
side is the first stop's departure and the last stop's arrival for that trip. Prints both numbers side by side.

usage: live-triptime-check.py --route 505 --runtimes <runtimes.json> --gtfs <dir> --archive <dir> [--n 10] [--seed 1] [--tol 30]
Exit code 1 when any checked trip differs by more than --tol seconds (default 30). Trips the analysis moved to another trip
number (swap reassignment) cannot be found under their own number and are skipped, with the count printed.
"""
import argparse, csv, datetime, json, math, os, random, sys
from zoneinfo import ZoneInfo

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

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--route', required=True); ap.add_argument('--runtimes', required=True)
    ap.add_argument('--gtfs', required=True); ap.add_argument('--archive', required=True)
    ap.add_argument('--n', type=int, default=10); ap.add_argument('--seed', type=int, default=1); ap.add_argument('--tol', type=float, default=30)
    a = ap.parse_args()
    rows = json.load(open(a.runtimes)); rnd = random.Random(a.seed); rnd.shuffle(rows)
    cand = rows[: a.n * 6]
    ids = {r['tripId'] for r in cand}
    trips = {}
    for row in csv.DictReader(open(os.path.join(a.gtfs, 'trips.txt'), encoding='utf-8-sig')):
        if row['trip_id'] in ids: trips[row['trip_id']] = row
    st = {}
    for row in csv.DictReader(open(os.path.join(a.gtfs, 'stop_times.txt'), encoding='utf-8-sig')):
        if row['trip_id'] in ids: st.setdefault(row['trip_id'], []).append((int(row['stop_sequence']), row['stop_id'], row['arrival_time'], row['departure_time']))
    shapes = {}; sid = {t['shape_id'] for t in trips.values()}
    for row in csv.DictReader(open(os.path.join(a.gtfs, 'shapes.txt'), encoding='utf-8-sig')):
        if row['shape_id'] in sid: shapes.setdefault(row['shape_id'], []).append((int(row['shape_pt_sequence']), float(row['shape_pt_lat']), float(row['shape_pt_lon'])))
    stops = {row['stop_id']: (float(row['stop_lat']), float(row['stop_lon']), row['stop_name']) for row in csv.DictReader(open(os.path.join(a.gtfs, 'stops.txt'), encoding='utf-8-sig'))}
    by_trip = {}
    wanted = {r['date'] for r in cand}
    for f in sorted(os.listdir(a.archive)):
        if not f.startswith(f'{a.route}-') or not f.endswith('.jsonl'): continue
        day = f[len(a.route) + 1:-6]
        d0 = datetime.date.fromisoformat(day)
        if not any(abs((datetime.date.fromisoformat(w) - d0).days) <= 1 for w in wanted): continue
        for line in open(os.path.join(a.archive, f)):
            if not line.strip(): continue
            snap = json.loads(line)
            for v in snap['v']:
                if v[1] in ids: by_trip.setdefault(v[1], set()).add((v[4] if len(v) > 4 and v[4] else snap['ts'], v[2], v[3]))
    print(f"route {a.route}: recomputing up to {a.n} trips, tolerance {a.tol:.0f} s\n")
    print(f"{'date':10} {'dir':3} {'trip':10} {'sched':>8} {'recomputed':>11} {'analysis':>9} {'diff':>6}   (minutes, last-stop arrival minus first-stop departure)")
    shown = skipped = bad = 0; worst = 0
    for r in cand:
        if shown == a.n: break
        tid = r['tripId']; trip = trips.get(tid); rows_ = sorted(st.get(tid, []))
        y, mo, dd = map(int, r['date'].split('-'))
        base = int(datetime.datetime(y, mo, dd, 12, tzinfo=ZoneInfo('America/Toronto')).timestamp()) - 12 * 3600
        lo_t = base + gtfs_sec(rows_[0][3]) - 3600 if rows_ else 0
        hi_t = base + gtfs_sec(rows_[-1][2]) + 7200 if rows_ else 0
        # trip numbers repeat every day: keep only this service day's samples
        samples = sorted(s_ for s_ in by_trip.get(tid, []) if lo_t <= s_[0] <= hi_t)
        if not trip or len(rows_) < 2 or not samples: skipped += 1; continue
        pts = sorted(shapes[trip['shape_id']]); lat0 = pts[0][1]
        poly = [xy(p[1], p[2], lat0) for p in pts]; cum = [0.0]
        for i in range(1, len(poly)): cum.append(cum[-1] + math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]))
        # legs: a sample more than 50 m off the shape ends the leg (a diversion or bad fix); samples implying over 25 m/s are dropped
        legs = [[]]
        for t, la, lo in samples:
            al, off = along_of(poly, cum, xy(la, lo, lat0))
            if off > 50:
                if legs[-1]: legs.append([])
                continue
            if legs[-1] and t > legs[-1][-1][0] and abs(al - legs[-1][-1][1]) / (t - legs[-1][-1][0]) > 25: continue
            if not legs[-1] or t > legs[-1][-1][0]: legs[-1].append((t, al))
        def at(target):
            for leg in legs:
                for (t1, a1), (t2, a2) in zip(leg, leg[1:]):
                    if a1 <= target <= a2 and a2 > a1 and t2 - t1 <= 150: return t1 + (target - a1) / (a2 - a1) * (t2 - t1)
            return None
        first, last = rows_[0], rows_[-1]
        a_first, _ = along_of(poly, cum, xy(stops[first[1]][0], stops[first[1]][1], lat0))
        a_last, _ = along_of(poly, cum, xy(stops[last[1]][0], stops[last[1]][1], lat0))
        t0, t1 = at(a_first + 25), at(a_last)
        if t0 is None or t1 is None: skipped += 1; continue
        sched = gtfs_sec(last[2]) - gtfs_sec(first[3]); mine = t1 - t0
        diff = abs(mine - r['actualSec']); worst = max(worst, diff)
        if diff > a.tol: bad += 1
        shown += 1
        print(f"{r['date']:10} {r['directionId']:<3} {tid:10} {sched / 60:>8.1f} {mine / 60:>11.1f} {r['actualSec'] / 60:>9.1f} {diff:>5.0f}s")
    print(f"\nlargest difference {worst:.0f} s; {bad} of {shown} outside tolerance ({skipped} candidates skipped: moved to another trip number or not found under their own)")
    sys.exit(1 if bad or shown == 0 else 0)

if __name__ == '__main__':
    main()
