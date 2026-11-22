import csv, io, sys, zipfile, os
src, out = sys.argv[1], sys.argv[2]
ROUTES = {'2', '19'}
WEEK = {'20261116', '20261117', '20261118', '20261119', '20261120', '20261121'}
z = zipfile.ZipFile(src)
def read(n): return list(csv.DictReader(io.TextIOWrapper(z.open(n), encoding='utf-8-sig')))
def write(n, rows, fields):
    with open(os.path.join(out, n), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator='\n'); w.writeheader(); w.writerows(rows)
os.makedirs(out, exist_ok=True)
routes = [r for r in read('routes.txt') if r['route_id'] in ROUTES]
cal = [c for c in read('calendar_dates.txt') if c['date'] in WEEK]
services = {c['service_id'] for c in cal}
trips = [t for t in read('trips.txt') if t['route_id'] in ROUTES and t['service_id'] in services]
tids = {t['trip_id'] for t in trips}
st = [s for s in read('stop_times.txt') if s['trip_id'] in tids]
# Size (CIV-2039 review): keep each trip's timepoints (first and last stops included), short trip ids, and drop columns the test doesn't need.
last = {}
for s in st: last[s['trip_id']] = max(last.get(s['trip_id'], 0), int(s['stop_sequence']))
full = {t['trip_id'] for t in trips if t['route_id'] == '2'}  # route 2 keeps every stop: its directions are inferred from stop order
st = [s for s in st if s['trip_id'] in full or s['timepoint'] == '1' or s['stop_sequence'] == '1' or int(s['stop_sequence']) == last[s['trip_id']]]
short = {t: f't{i}' for i, t in enumerate(sorted(tids))}
for t in trips: t['trip_id'] = short[t['trip_id']]
st = [{'trip_id': short[s['trip_id']], 'arrival_time': s['arrival_time'], 'departure_time': s['departure_time'], 'stop_id': s['stop_id'], 'stop_sequence': s['stop_sequence']} for s in st]
sids = {s['stop_id'] for s in st}
stops = [s for s in read('stops.txt') if s['stop_id'] in sids]
shp = {t['shape_id'] for t in trips}
shapes_all = [s for s in read('shapes.txt') if s['shape_id'] in shp]
# Thin each shape to every 4th point (first and last kept): the test reads headways, not geometry.
shapes, by = [], {}
for s in shapes_all: by.setdefault(s['shape_id'], []).append(s)
for pts in by.values():
    pts.sort(key=lambda s: int(s['shape_pt_sequence']))
    shapes += [p for i, p in enumerate(pts) if i % 4 == 0 or i == len(pts) - 1]
cal = [c for c in cal if c['service_id'] in {t['service_id'] for t in trips}]
for n, rows in [('agency.txt', read('agency.txt')), ('routes.txt', routes), ('calendar_dates.txt', cal), ('trips.txt', trips), ('stop_times.txt', st), ('stops.txt', stops), ('shapes.txt', shapes)]:
    write(n, rows, list(rows[0].keys()))
    print(n, len(rows))
