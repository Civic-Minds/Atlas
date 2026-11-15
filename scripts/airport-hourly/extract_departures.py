"""Feed stage of the airport story data (CIV-1550); scripts/build-airport-hourly.ts reads its output.

Usage: python3 extract_departures.py <study folder with curated.json, stops/, gtfs/<slug>/feed.zip> <out folder> [IATA ...]
Writes <out>/per/<IATA>.json: every departure from the airport's stops (within 100 m of the curated terminal
stops) on Tue 2026-11-17, Sat 2026-11-21 and Sun 2026-11-22 as [minute, feed, route, headsign, downtown, downtown_with_one_change].
Downtown = the same vehicle (following a loop or a block continuation once) later drops off within the
airport's radius (1.2 km default, centres.py) of the downtown point. One change = 300 m walk, within 60 min.
"""
import csv, io, json, math, sys, zipfile, os, datetime, collections, glob, re, time
B1 = sys.argv[1]   # old airports folder (feeds, curated)
OUT = sys.argv[2]  # output folder
only = sys.argv[3:]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from centres import C, R as RADS

cur = json.load(open(B1 + '/curated.json'))
DATES = {'wk': datetime.date(2026, 11, 17), 'sat': datetime.date(2026, 11, 21), 'sun': datetime.date(2026, 11, 22)}
AIR_RAD = 100
XFER_WALK = 300


def hav(a, b, c, d):
    p = math.radians
    x = math.sin(p(c - a) / 2) ** 2 + math.cos(p(a)) * math.cos(p(c)) * math.sin(p(d - b) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(min(1, x)))


def opencsv(z, name):
    names = {os.path.basename(n): n for n in z.namelist()}
    if name not in names:
        return None, None
    f = io.TextIOWrapper(z.open(names[name]), encoding='utf-8-sig', errors='replace')
    r = csv.reader(f)
    try:
        hdr = [h.strip() for h in next(r)]
    except StopIteration:
        return None, None
    return hdr, r


def rd(z, name):
    hdr, r = opencsv(z, name)
    if hdr is None:
        return
    for row in r:
        if not row: continue
        yield dict(zip(hdr, row))


def tmin(t):
    t = (t or '').strip()
    if not t:
        return None
    try:
        h, m, *s = t.split(':')
        return int(h) * 60 + int(m)
    except Exception:
        return None


def services(z):
    cal = {}; ex = collections.defaultdict(dict)
    for r in rd(z, 'calendar.txt'):
        cal[r['service_id']] = r
    for r in rd(z, 'calendar_dates.txt'):
        ex[r['service_id']][r['date'].strip()] = r['exception_type'].strip()
    return cal, ex


WD = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']


def active(cal, ex, d):
    ds = d.strftime('%Y%m%d'); wd = WD[d.weekday()]
    s = set()
    for sid, r in cal.items():
        if r['start_date'].strip() <= ds <= r['end_date'].strip() and r.get(wd, '0').strip() == '1':
            s.add(sid)
    for sid, e in ex.items():
        if ds in e:
            if e[ds] == '1': s.add(sid)
            else: s.discard(sid)
    return s


def pickdate(cal, ex, d):
    for k in [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8]:
        dd = d + datetime.timedelta(weeks=k)
        if active(cal, ex, dd):
            return dd
    return d


KEY = re.compile(r'downtown|centre\b|center\b|central|city hall|union|station|terminal|transit|exchange|university|univ\b|college|campus|hospital|medical|amtrak|greyhound|mall|airport|plaza|square|stadium|ferry|park.?n.?ride|park & ride|uptown', re.I)


def israil(rt):
    rt = int(rt or 3)
    return rt in (0, 1, 2, 12) or 100 <= rt < 200 or 400 <= rt < 500 or 900 <= rt < 1000


def process_airport(iata, entries):
    centres = C.get(iata, [])
    crad = RADS.get(iata, 1.2) * 1000
    # per day: list of (time, feed, route, headsign, direct, viaxfer)
    deps = {k: [] for k in DATES}
    reach = {}  # (feed, route, headsign) -> info
    reached_stops = set()
    notes = []
    datesused = {}
    centre_check = []
    for e in entries:
        s = e['slug']
        ast = json.load(open(f"{B1}/stops/{s}-stops.json"))
        pts = [(ast[h[1]]['lat'], ast[h[1]]['lon']) for h in e['stops'] if h[1] in ast]
        feeds = sorted(glob.glob(f"{B1}/gtfs/{s}/feed.zip") + glob.glob(f"{B1}/gtfs/{s}__sup*/feed.zip"))
        if not feeds:
            notes.append(f'{s}: no feed'); continue
        for fz in feeds:
            fid = os.path.basename(os.path.dirname(fz))
            try:
                z = zipfile.ZipFile(fz)
            except Exception:
                notes.append(f'{fid}: bad zip'); continue
            stops = {}; air = set(); cent = set(); parent = {}
            for r in rd(z, 'stops.txt'):
                try: la, lo = float(r['stop_lat']), float(r['stop_lon'])
                except Exception: continue
                sid = r['stop_id']
                stops[sid] = (la, lo, r.get('stop_name', ''))
                if r.get('parent_station'): parent[sid] = r['parent_station']
                if any(hav(la, lo, a, b) <= AIR_RAD for a, b in pts): air.add(sid)
                if any(hav(la, lo, a, b) <= crad for _, a, b in centres): cent.add(sid)
            if not air:
                continue
            # centre sanity: nearest stop to each centre
            for lab, a, b in centres:
                best = min(((hav(a, b, v[0], v[1]), v[2]) for v in stops.values()), default=(1e9, ''))
                centre_check.append((fid, lab, round(best[0]), best[1]))
            cent -= air
            routes = {r['route_id']: r for r in rd(z, 'routes.txt')}
            cal, ex = services(z)
            act = {}
            for k, d in DATES.items():
                dd = pickdate(cal, ex, d); act[k] = active(cal, ex, dd)
                datesused[f'{fid}:{k}'] = str(dd)
            allact = set().union(*act.values())
            trips = {}
            for r in rd(z, 'trips.txt'):
                if r['service_id'] in allact:
                    trips[r['trip_id']] = r
            freq = collections.defaultdict(list)
            for r in rd(z, 'frequencies.txt'):
                freq[r['trip_id']].append((tmin(r['start_time']), tmin(r['end_time']), int(float(r['headway_secs']))))
            # pass 1: full sequences for all active trips, compact
            hdr, rr = opencsv(z, 'stop_times.txt')
            ix = {h: i for i, h in enumerate(hdr)}
            it, isq, ist, ia, idp = ix['trip_id'], ix['stop_sequence'], ix['stop_id'], ix.get('arrival_time'), ix.get('departure_time')
            ipu, ido = ix.get('pickup_type'), ix.get('drop_off_type')
            airtrips = set(); centmax = {}
            seqs = collections.defaultdict(list)
            for row in rr:
                if len(row) <= max(it, isq, ist): continue
                t = row[it]
                if t not in trips: continue
                sid = row[ist]
                sq = int(float(row[isq]))
                dep = tmin(row[idp]) if idp is not None else None
                arr = tmin(row[ia]) if ia is not None else None
                if dep is None: dep = arr
                if arr is None: arr = dep
                pu = row[ipu].strip() if ipu is not None and ipu < len(row) else ''
                do = row[ido].strip() if ido is not None and ido < len(row) else ''
                seqs[t].append((sq, sid, arr, dep, pu, do))
            del rr
            # interpolate missing times
            for t, sq in seqs.items():
                sq.sort()
                if any(x[2] is None for x in sq):
                    last = None; out = []
                    for x in sq:
                        if x[2] is None and last is not None:
                            x = (x[0], x[1], last, last, x[4], x[5])
                        elif x[2] is not None:
                            last = x[3]
                        out.append(x)
                    seqs[t] = out
            # trips reaching centre: index of last centre stop with drop allowed
            for t, sq in seqs.items():
                m = -1
                for i, x in enumerate(sq):
                    if x[1] in cent and x[5] != '1': m = i
                centmax[t] = m
                if any(x[1] in air for x in sq): airtrips.add(t)

            def offsets(t, base):
                if t not in freq: return [0]
                t0 = seqs[t][0][3] or 0
                o = []
                for a, b, h in freq[t]:
                    x = a * 60
                    while x < b * 60:
                        o.append(x // 60 - t0); x += h
                return o
            # airport trip legs
            legs = []  # (t, board_idx, end_idx, seq)
            downstream_stops = set()
            blocks = collections.defaultdict(list)
            for t2, tr2 in trips.items():
                b = (tr2.get('block_id') or '').strip()
                if b and t2 in seqs and seqs[t2] and seqs[t2][0][3] is not None:
                    blocks[(tr2['service_id'], b)].append((seqs[t2][0][3], t2))
            for t in airtrips:
                sq0 = seqs[t]
                bis = []
                i = 0
                while i < len(sq0):
                    x = sq0[i]
                    if x[1] in air and x[4] != '1' and i < len(sq0) - 1 and any(y[1] not in air for y in sq0[i + 1:]):
                        bi = i
                        while bi + 1 < len(sq0) and sq0[bi + 1][1] in air and sq0[bi + 1][4] != '1':
                            bi += 1
                        bis.append(bi)
                        j = bi + 1
                        while j < len(sq0) and sq0[j][1] not in air: j += 1
                        i = j
                    else:
                        i += 1
                for bi in bis:
                    sq = sq0
                    if sq[bi][3] is None: continue
                    ext = 0
                    while ext < 1 and sq[-1][1] not in air and sq[-1][1] in stops and sq[bi][1] in stops and hav(*stops[sq[bi][1]][:2], *stops[sq[-1][1]][:2]) <= 5000:
                        tr = trips[t]; b = (tr.get('block_id') or '').strip(); endt = sq[-1][2]
                        if not b or endt is None: break
                        lst = stops[sq[-1][1]]; nxt = None
                        for st0, t2 in sorted(blocks.get((tr['service_id'], b), [])):
                            if t2 != t and endt <= st0 <= endt + 20 and seqs[t2][0][1] in stops and hav(lst[0], lst[1], *stops[seqs[t2][0][1]][:2]) <= 300:
                                nxt = t2; break
                        if nxt is None: break
                        sq = sq + seqs[nxt][1:]; ext += 1
                        if any(y[1] in air for y in seqs[nxt]): break
                    ei = len(sq) - 1
                    left = False
                    for j in range(bi + 1, len(sq)):
                        if sq[j][1] not in air: left = True
                        elif left: ei = j - 1; break
                    legs.append((t, bi, ei, sq))
                    for j in range(bi + 1, ei + 1):
                        if sq[j][5] != '1': downstream_stops.add(sq[j][1])
            # nearby transfer stops
            near = collections.defaultdict(set)
            grid = collections.defaultdict(list)
            for sid, (la, lo, _) in stops.items():
                grid[(int(la * 500), int(lo * 350))].append(sid)
            for sid in downstream_stops:
                if sid not in stops: continue
                la, lo, _ = stops[sid]
                gx, gy = int(la * 500), int(lo * 350)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        for o in grid.get((gx + dx, gy + dy), []):
                            if hav(la, lo, stops[o][0], stops[o][1]) <= XFER_WALK: near[sid].add(o)
            cand = set().union(*near.values()) if near else set()
            # index of departures at candidate stops on trips that later reach centre
            idx = collections.defaultdict(list)  # stop -> [(dep, service)]
            for t, sq in seqs.items():
                m = centmax[t]
                if m <= 0: continue
                sv = trips[t]['service_id']
                for i in range(m):
                    x = sq[i]
                    if x[1] in cand and x[4] != '1' and x[3] is not None:
                        for o in offsets(t, x[3]):
                            idx[x[1]].append((x[3] + o, sv))
            for v in idx.values(): v.sort()
            import bisect
            for t, bi, ei, sq in legs:
                tr = trips[t]; ro = routes.get(tr['route_id'], {})
                rname = (ro.get('route_short_name') or ro.get('route_long_name') or tr['route_id']).strip()
                hs = (tr.get('trip_headsign') or '').strip() or stops.get(sq[ei][1], (0, 0, ''))[2]
                sv = tr['service_id']
                direct = any(sq[j][1] in cent and sq[j][5] != '1' for j in range(bi + 1, ei + 1))
                a0 = stops.get(sq[bi][1])
                # reach info
                key = (fid, rname, hs)
                R_ = reach.setdefault(key, {'feed': fid, 'route': rname, 'headsign': hs, 'mode': 'rail' if israil(ro.get('route_type')) else 'bus',
                                            'terminus': collections.Counter(), 'farkm': 0, 'farstop': '', 'stops': set(), 'places': {}, 'direct_trips': 0, 'trips': 0, 'board': set()})
                R_['trips'] += 1; R_['direct_trips'] += direct
                R_['terminus'][stops.get(sq[ei][1], (0, 0, sq[ei][1]))[2]] += 1
                R_['board'].add(stops.get(sq[bi][1], (0, 0, ''))[2])
                for j in range(bi + 1, ei + 1):
                    x = sq[j]
                    if x[5] == '1' or x[1] not in stops: continue
                    st = stops[x[1]]
                    d = hav(a0[0], a0[1], st[0], st[1]) / 1000 if a0 else 0
                    if d > 800: continue  # bad coordinates
                    nm = st[2].strip()
                    R_['stops'].add((fid, nm.lower(), round(st[0], 3), round(st[1], 3)))
                    reached_stops.add((fid, nm.lower(), round(st[0], 3), round(st[1], 3)))
                    if d > R_['farkm']: R_['farkm'] = d; R_['farstop'] = nm
                    if KEY.search(nm) and x[1] not in air:
                        R_['places'][nm] = max(R_['places'].get(nm, 0), d)
                # transfer (checked per day and per frequency offset)
                def xfer(off, kk):
                    for j in range(bi + 1, ei + 1):
                        x = sq[j]
                        if x[5] == '1' or x[2] is None: continue
                        arr = x[2] + off
                        for o2 in near.get(x[1], ()):
                            L = idx.get(o2)
                            if not L: continue
                            mn = arr + (0 if o2 == x[1] else 3)
                            k0 = bisect.bisect_left(L, (mn, ''))
                            for dep, s2 in L[k0:]:
                                if dep > arr + 60: break
                                if s2 in act[kk]: return True
                    return False
                for o in offsets(t, sq[bi][3]):
                    for kk in DATES:
                        if sv in act[kk]:
                            via = direct or xfer(o, kk)
                            deps[kk].append((sq[bi][3] + o, fid, rname, hs, direct, via))
            del seqs, idx
    return deps, reach, reached_stops, notes, datesused, centre_check


def fmt(m):
    return None if m is None else f'{m // 60:02d}:{m % 60:02d}'


def daystats(times):
    times = sorted(set(times))
    if not times: return {'n': 0, 'first': None, 'last': None, 'gap': 17 * 60, 'gapat': '06:00-23:00 (none)'}
    w = [t for t in times if 360 <= t <= 1380]
    pts = [360] + w + [1380]
    g, at = 0, ''
    for a, b in zip(pts, pts[1:]):
        if b - a > g: g, at = b - a, f'{fmt(a)}-{fmt(b)}'
    return {'n': len(times), 'first': fmt(times[0]), 'last': fmt(times[-1]), 'gap': g, 'gapat': at}


def landable(deps, pred):
    wk = []
    for d in range(7):
        k = 'wk' if d < 5 else ('sat' if d == 5 else 'sun')
        for r in deps[k]:
            if pred(r): wk.append((d * 1440 + r[0]) % 10080)
    wk = sorted(set(wk))
    import bisect
    n = 0
    for h in range(168):
        s = h * 60
        i = bisect.bisect_left(wk, s)
        if i < len(wk) and wk[i] <= s + 60: n += 1
        elif i == len(wk) and wk and wk[0] + 10080 <= s + 60: n += 1
    return n


def main():
    byair = collections.OrderedDict()
    for e in cur:
        byair.setdefault(e['iata'], []).append(e)
    os.makedirs(OUT + '/per', exist_ok=True)
    for iata, ents in sorted(byair.items()):
        if only and iata not in only: continue
        fn = f'{OUT}/per/{iata}.json'
        if os.path.exists(fn) and not only: continue
        t0 = time.time()
        try:
            deps, reach, rs, notes, du, cc = process_airport(iata, ents)
        except Exception as ex:
            json.dump({'iata': iata, 'err': repr(ex)}, open(fn, 'w')); print(iata, 'ERR', ex, flush=True); continue
        out = {'iata': iata, 'airport': ents[0].get('airport'), 'city': ents[0].get('city'), 'agencies': sorted(set(e['slug'] for e in ents)),
               'centres': C.get(iata), 'notes': notes, 'dates': du, 'centre_check': cc,
               'deps': {k: sorted(set(v)) for k, v in deps.items()},
               'reach': [dict(v, terminus=v['terminus'].most_common(1)[0][0] if v['terminus'] else '', nstops=len(v['stops']), stops=None,
                              board=sorted(v['board']), places=sorted(v['places'].items(), key=lambda x: -x[1])) for v in reach.values()],
               'nstops_total': len(rs)}
        json.dump(out, open(fn, 'w'))
        print(iata, round(time.time() - t0, 1), 's', flush=True)


main()
