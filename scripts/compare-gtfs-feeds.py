#!/usr/bin/env python3
"""Compare two GTFS zips, read-only: end dates, agencies, routes and stops (CIV-3069).

Usage: python3 -I scripts/compare-gtfs-feeds.py <old.zip> <new.zip> [old-label] [new-label]
Prints a markdown report. Stops match by stop_id, or failing that by name within 100 m.
"""
import csv, io, math, sys, zipfile


def read(z, name):
    try:
        raw = z.read(name)
    except KeyError:
        return []
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig', errors='replace'))))


def load(path):
    z = zipfile.ZipFile(path)
    f = {n: read(z, n + '.txt') for n in ('agency', 'feed_info', 'calendar', 'calendar_dates', 'routes', 'stops', 'trips')}
    cal = [r.get('end_date', '') for r in f['calendar'] if r.get('end_date')]
    added = [r.get('date', '') for r in f['calendar_dates'] if r.get('exception_type') == '1']
    starts = [r.get('start_date', '') for r in f['calendar'] if r.get('start_date')]
    f['end'] = max(cal + added) if cal + added else None
    f['start'] = min(starts + added) if starts + added else None
    f['feed_end'] = next((r.get('feed_end_date') for r in f['feed_info'] if r.get('feed_end_date')), None)
    trips = {}
    for t in f['trips']:
        trips[t.get('route_id')] = trips.get(t.get('route_id'), 0) + 1
    f['trips_by_route'] = trips
    return f


def route_key(r):
    return (r.get('route_short_name') or '').strip() or (r.get('route_long_name') or '').strip()


def dist_m(a, b):
    try:
        la1, lo1, la2, lo2 = (float(a['stop_lat']), float(a['stop_lon']), float(b['stop_lat']), float(b['stop_lon']))
    except (KeyError, ValueError):
        return math.inf
    x = math.radians(lo2 - lo1) * math.cos(math.radians((la1 + la2) / 2))
    return 6371000 * math.hypot(x, math.radians(la2 - la1))


def main():
    old_p, new_p = sys.argv[1], sys.argv[2]
    old_l = sys.argv[3] if len(sys.argv) > 3 else 'old'
    new_l = sys.argv[4] if len(sys.argv) > 4 else 'new'
    o, n = load(old_p), load(new_p)
    out = [f'### {old_l} vs {new_l}', '']
    for label, f in ((old_l, o), (new_l, n)):
        out.append(f"- **{label}:** agencies {', '.join(a.get('agency_name', '?') for a in f['agency']) or 'none'}; "
                   f"service {f['start']}–{f['end']}; feed_end_date {f['feed_end'] or 'none'}; "
                   f"{len(f['routes'])} routes, {len(f['stops'])} stops, {len(f['trips'])} trips")
    out.append('')
    out.append('| Route | ' + old_l + ' trips | ' + new_l + ' trips | Long name (' + new_l + ') |')
    out.append('|---|---|---|---|')
    ok = {route_key(r): r for r in o['routes']}
    nk = {route_key(r): r for r in n['routes']}
    for k in sorted(set(ok) | set(nk)):
        a, b = ok.get(k), nk.get(k)
        ta = o['trips_by_route'].get(a.get('route_id'), 0) if a else '—'
        tb = n['trips_by_route'].get(b.get('route_id'), 0) if b else '—'
        out.append(f"| {k} | {ta} | {tb} | {(b or a).get('route_long_name', '')} |")
    out.append('')
    by_id = {s.get('stop_id'): s for s in n['stops']}
    same_id = by_name = 0
    missing = []
    for s in o['stops']:
        if s.get('stop_id') in by_id:
            same_id += 1
            continue
        name = (s.get('stop_name') or '').strip().lower()
        if any((t.get('stop_name') or '').strip().lower() == name and dist_m(s, t) <= 100 for t in n['stops']):
            by_name += 1
        else:
            near = min((dist_m(s, t) for t in n['stops']), default=math.inf)
            missing.append(f"{s.get('stop_name')} (nearest {new_l} stop {near:.0f} m)")
    out.append(f"- Stops: {len(o['stops'])} in {old_l}; {same_id} match by stop_id, {by_name} by name within 100 m, "
               f"{len(missing)} unmatched. {new_l} has {len(n['stops'])}.")
    for m in missing[:25]:
        out.append(f'  - unmatched: {m}')
    print('\n'.join(out))


if __name__ == '__main__':
    main()
