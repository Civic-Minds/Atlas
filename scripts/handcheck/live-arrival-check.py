#!/usr/bin/env python3
"""Hand-check Live stop delays against the raw archive and the timetable, without the analysis code.

Takes random stop passages from a segment-delay run (the --obs-out file of scripts/live-segment-delay.ts) and recomputes
each one from scratch: project the archived positions of that trip onto its GTFS shape (plain geometry, written here),
interpolate the time the car reached the stop between the two positions around it, and subtract the timetable's
departure for that trip at that stop. Prints both numbers side by side.

usage: live-arrival-check.py --route 504 --obs <obs.json> --gtfs <dir> --archive <dir> [--n 10] [--seed 1] [--tol 30]
Exit code 1 when any checked arrival differs by more than --tol seconds (default 30).
"""
import argparse, csv, datetime, json, math, os, random, sys
from zoneinfo import ZoneInfo

TZ = ZoneInfo('America/Toronto')

def day_start(date):
    """GTFS 'noon minus 12h' for a local service date (epoch seconds)."""
    y, m, d = map(int, date.split('-'))
    noon = datetime.datetime(y, m, d, 12, tzinfo=TZ)
    return int(noon.timestamp()) - 12 * 3600

def xy(lat, lon, lat0):
    return (lon * math.cos(math.radians(lat0)) * 111320.0, lat * 110540.0)

def along_of(poly_xy, cum, p):
    """Distance along the polyline of the point on it nearest to p, and how far p is from the polyline."""
    best = (1e18, 0.0)
    for i in range(len(poly_xy) - 1):
        ax, ay = poly_xy[i]; bx, by = poly_xy[i + 1]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2))
        px, py = ax + t * dx, ay + t * dy
        d = math.hypot(p[0] - px, p[1] - py)
        if d < best[0]: best = (d, cum[i] + t * math.sqrt(L2))
    return best[1], best[0]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--route', required=True); ap.add_argument('--obs', required=True)
    ap.add_argument('--gtfs', required=True); ap.add_argument('--archive', required=True)
    ap.add_argument('--n', type=int, default=10); ap.add_argument('--seed', type=int, default=1); ap.add_argument('--tol', type=float, default=30)
    a = ap.parse_args()
    runs = json.load(open(a.obs))
    rnd = random.Random(a.seed)
    picks = []; seen = set()
    cands = [(r, s) for r in runs for i, s in enumerate(r['stops']) if 0 < i < len(r['stops']) - 1]
    rnd.shuffle(cands)
    for r, s in cands:  # spread over dates and directions
        k = (r['date'], r['directionId'])
        if k in seen and len(seen) < 14: continue
        seen.add(k); picks.append((r, s))
        if len(picks) == a.n: break
    trip_ids = {r['tripId'] for r, _ in picks}
    trips = {}
    with open(os.path.join(a.gtfs, 'trips.txt'), encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            if row['trip_id'] in trip_ids: trips[row['trip_id']] = row
    sched = {}
    with open(os.path.join(a.gtfs, 'stop_times.txt'), encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            if row['trip_id'] in trip_ids: sched.setdefault((row['trip_id'], row['stop_id']), row['departure_time'])
    shape_ids = {t['shape_id'] for t in trips.values()}
    shapes = {}
    with open(os.path.join(a.gtfs, 'shapes.txt'), encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            if row['shape_id'] in shape_ids: shapes.setdefault(row['shape_id'], []).append((int(row['shape_pt_sequence']), float(row['shape_pt_lat']), float(row['shape_pt_lon'])))
    stops = {}
    with open(os.path.join(a.gtfs, 'stops.txt'), encoding='utf-8-sig') as f:
        for row in csv.DictReader(f): stops[row['stop_id']] = (float(row['stop_lat']), float(row['stop_lon']), row['stop_name'])
    def archive_samples(t):
        out = []
        days = {datetime.datetime.fromtimestamp(t + d, datetime.timezone.utc).strftime('%Y-%m-%d') for d in (-1200, 0, 1200)}
        for d in sorted(days):
            p = os.path.join(a.archive, f'{a.route}-{d}.jsonl')
            if not os.path.exists(p): continue
            for line in open(p):
                if line.strip():
                    snap = json.loads(line)
                    for v in snap['v']: out.append((snap['ts'], v))
        return out
    print(f"route {a.route}: {len(picks)} arrivals, tolerance {a.tol:.0f} s\n")
    print(f"{'date':10} {'dir':3} {'stop':34} {'trip':9} {'sched':>8} {'bracket':>8} {'recomputed':>11} {'analysis':>9} {'diff':>6}")
    worst = 0; bad = 0
    for r, s in picks:
        trip = trips.get(r['tripId'])
        pts = sorted(shapes.get(trip['shape_id'], [])) if trip else []
        dep = sched.get((r['tripId'], s['stopId']))
        if not trip or not pts or dep is None or s['stopId'] not in stops:
            print(f"{r['date']:10} {r['directionId']:<3} {s['stopId']:34} {r['tripId']:9} (missing trip, shape or timetable row)"); bad += 1; continue
        lat0 = pts[0][1]
        poly = [xy(p[1], p[2], lat0) for p in pts]
        cum = [0.0]
        for i in range(1, len(poly)): cum.append(cum[-1] + math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]))
        stop_along, _ = along_of(poly, cum, xy(stops[s['stopId']][0], stops[s['stopId']][1], lat0))
        samples = []
        for ts, v in archive_samples(s['t']):
            if v[1] == r['tripId'] and abs(ts - s['t']) < 1500: samples.append((v[4] if len(v) > 4 and v[4] else ts, v[2], v[3]))
        samples.sort()
        proj = []
        for t_, lat, lon in samples:
            al, off = along_of(poly, cum, xy(lat, lon, lat0))
            if off <= 150 and (not proj or t_ > proj[-1][0]): proj.append((t_, al))
        hit = None
        for (t1, a1), (t2, a2) in zip(proj, proj[1:]):
            if a1 <= stop_along <= a2 and a2 > a1 and t2 - t1 <= 180 and t1 - 600 < s['t'] < t2 + 600:
                hit = (t1 + (stop_along - a1) / (a2 - a1) * (t2 - t1), t2 - t1); break
        if not hit:
            print(f"{r['date']:10} {r['directionId']:<3} {stops[s['stopId']][2][:34]:34} {r['tripId']:9} (no pair of archived positions brackets this stop)"); bad += 1; continue
        h, m_, sec = map(int, dep.split(':'))
        scheduled = day_start(r['date']) + h * 3600 + m_ * 60 + sec
        mine = hit[0] - scheduled
        diff = abs(mine - s['delaySec']); worst = max(worst, diff)
        if diff > a.tol: bad += 1
        print(f"{r['date']:10} {r['directionId']:<3} {stops[s['stopId']][2][:34]:34} {r['tripId']:9} {dep:>8} {hit[1]:>7.0f}s {mine / 60:>10.1f}m {s['delaySec'] / 60:>8.1f}m {diff:>5.0f}s")
    print(f"\nlargest difference {worst:.0f} s; {bad} of {len(picks)} outside tolerance or not checkable")
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
