#!/usr/bin/env python3
"""Hand-check Live "service delivered" for one route and service date against the raw archive and the timetable.

Counts the timetable's trips for that date (calendar and exceptions, trips of 10 stops or fewer and under 12 minutes left out like
the analysis does) and how many have at least one archived position under their trip number between 30 minutes before the first
departure and 60 minutes after the last arrival. Trips the analysis calls "unknown" (the feed was down, or other cars covered
the slot) are expected to show here as not seen, so this count of not seen is an upper bound for the analysis's.

usage: live-delivered-check.py --route 505 --date 2026-10-10 --out <analysis.json> --gtfs <dir> --archive <dir>
"""
import argparse, csv, datetime, json, os
from zoneinfo import ZoneInfo
TZ = ZoneInfo('America/Toronto')
def gsec(s):
    h, m, x = map(int, s.split(':')); return h * 3600 + m * 60 + x
def main():
    ap = argparse.ArgumentParser()
    for k in ('route', 'date', 'out', 'gtfs', 'archive'): ap.add_argument('--' + k, required=True)
    a = ap.parse_args(); G = a.gtfs
    rids = {r['route_id'] for r in csv.DictReader(open(G + '/routes.txt', encoding='utf-8-sig')) if r['route_short_name'] == a.route}
    trips = {r['trip_id']: r for r in csv.DictReader(open(G + '/trips.txt', encoding='utf-8-sig')) if r['route_id'] in rids}
    cal = list(csv.DictReader(open(G + '/calendar.txt', encoding='utf-8-sig'))); cd = list(csv.DictReader(open(G + '/calendar_dates.txt', encoding='utf-8-sig')))
    DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    ymd = a.date.replace('-', ''); dow = DOW[(datetime.date.fromisoformat(a.date).weekday() + 1) % 7]
    on = {c['service_id'] for c in cal if c['start_date'] <= ymd <= c['end_date'] and c[dow] == '1'}
    for c in cd:
        if c['date'] == ymd: (on.add if c['exception_type'] == '1' else on.discard)(c['service_id'])
    st = {}
    for r in csv.DictReader(open(G + '/stop_times.txt', encoding='utf-8-sig')):
        if r['trip_id'] in trips and trips[r['trip_id']]['service_id'] in on: st.setdefault(r['trip_id'], []).append((int(r['stop_sequence']), gsec(r['arrival_time']), gsec(r['departure_time'])))
    y, m, d = map(int, a.date.split('-')); base = int(datetime.datetime(y, m, d, 12, tzinfo=TZ).timestamp()) - 12 * 3600
    win = {}
    for t, rows in st.items():
        rows.sort()
        if len(rows) <= 10 or rows[-1][1] - rows[0][2] < 720: continue
        win[t] = (base + rows[0][2] - 1800, base + rows[-1][1] + 3600, trips[t]['direction_id'])
    seen = set()
    d0 = datetime.date.fromisoformat(a.date)
    for f in (a.date, (d0 + datetime.timedelta(days=1)).isoformat()):
        p = f'{a.archive}/{a.route}-{f}.jsonl'
        if not os.path.exists(p): continue
        for line in open(p):
            if not line.strip(): continue
            snap = json.loads(line)
            for v in snap['v']:
                w = win.get(v[1]); ts = (v[4] if len(v) > 4 and v[4] else snap['ts'])
                if w and w[0] <= ts <= w[1]: seen.add(v[1])
    mine_seen = len(seen); mine_missing = len(win) - mine_seen
    ref = [x for x in json.load(open(a.out))['v3']['serviceDelivered']['byDay'] if x['date'] == a.date]
    print(f"route {a.route} {a.date}: timetable trips counted {len(win)}; seen under their number {mine_seen}; not seen (includes any the analysis calls unknown) {mine_missing}")
    if ref:
        r = ref[0]; print(f"analysis: seen {r['seen']}, not seen {r['notSeen']}, unknown {r['unknown']} (healthy day: {r['healthy']}); my not-seen {mine_missing} vs its not-seen+unknown {r['notSeen'] + r['unknown']}")
if __name__ == '__main__':
    main()
