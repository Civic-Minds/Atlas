"""Hour-resolution departures from an Atlas published agency file (used for MKE, whose GTFS was unreachable).

Usage: python3 atlas_hours.py <atlas agency.json> <stops.json> <airport stop ids,comma> <centre lat> <centre lon> <IATA> <out.json>
Writes {"iata", "hours": {"wk"|"sat"|"sun": {hour: [downtown_deps, all_deps]}}}. Hours can be >= 24 (after midnight).
"""
import json, math, sys, collections
J = lambda x: json.loads(x) if isinstance(x, str) else x
def hav(a, b, c, d):
    p = math.radians
    x = math.sin(p(c - a) / 2) ** 2 + math.cos(p(a)) * math.cos(p(c)) * math.sin(p(d - b) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(min(1, x)))
path, stopsf, air_ids, clat, clon, iata, out = sys.argv[1], sys.argv[2], sys.argv[3].split(','), float(sys.argv[4]), float(sys.argv[5]), sys.argv[6], sys.argv[7]
d = json.load(open(path)); st = json.load(open(stopsf))
air = set(air_ids)
for s, v in st.items():
    if any(hav(v['lat'], v['lon'], st[a]['lat'], st[a]['lon']) <= 100 for a in air_ids if a in st): air.add(s)
cent = {s for s, v in st.items() if hav(v['lat'], v['lon'], clat, clon) <= 1200} - air
DAYK = {'Weekday': 'wk', 'Saturday': 'sat', 'Sunday': 'sun'}
hours = {k: collections.defaultdict(lambda: [0, 0]) for k in DAYK.values()}
seen = set()
for f in d['features']:
    p = f['properties']
    if 'stopOrder' not in p or p.get('day') not in DAYK: continue
    so = J(p['stopOrder'])
    idx = [i for i, s in enumerate(so) if s in air]
    if not idx: continue
    i = max(idx) if all(j == k for j, k in zip(idx, range(idx[0], idx[0] + len(idx)))) else idx[0]
    if i >= len(so) - 1: continue
    direct = any(s in cent for s in so[i + 1:])
    key = (p['routeId'], p['directionId'], p['day'], p.get('headsign'), json.dumps(p['departuresByHour'], sort_keys=True))
    if key in seen: continue
    seen.add(key)
    for h, n in p['departuresByHour'].items():
        k = DAYK[p['day']]
        hours[k][int(h)][1] += n
        if direct: hours[k][int(h)][0] += n
json.dump({'iata': iata, 'hours': {k: {str(h): v for h, v in sorted(hs.items())} for k, hs in hours.items()}}, open(out, 'w'))
