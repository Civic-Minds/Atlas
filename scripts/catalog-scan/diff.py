#!/usr/bin/env python3
# Line-by-line diff between two scan.mts output dirs: every changed property per line, plus
# stops, corridors and trips hashes. Writes <fixOutDir>.diff.json. See README.md.
# usage: diff.py <baseOutDir> <fixOutDir> [slug ...]
import json, os, sys
B, F = sys.argv[1:3]; only = sys.argv[3:]
slugs = sorted(set(f[:-5] for f in os.listdir(F) if f.endswith('.json')))
if only: slugs = [s for s in slugs if s in only]
IGN = set()
tot = dict(agencies=0, same=0, changed=0, missingBase=0, err=0, lines_changed=0, lines_added=0, lines_removed=0)
details = {}
for s in slugs:
    fp = f'{F}/{s}.json'; bp = f'{B}/{s}.json'
    f = json.load(open(fp))
    if not os.path.exists(bp): tot['missingBase'] += 1; continue
    b = json.load(open(bp)); tot['agencies'] += 1
    if not f.get('ok') or not b.get('ok'):
        tot['err'] += 1; details[s] = {'error': {'base': b.get('error'), 'fix': f.get('error')}}; continue
    bl, fl = b['lines'], f['lines']
    added = sorted(set(fl) - set(bl)); removed = sorted(set(bl) - set(fl)); changed = {}
    for k in set(fl) & set(bl):
        if fl[k] != bl[k]:
            dk = {p: (bl[k].get(p), fl[k].get(p)) for p in set(fl[k]) | set(bl[k]) if fl[k].get(p) != bl[k].get(p)}
            changed[k] = dk
    other = {}
    for key in ('stops', 'corridors', 'stopsJson', 'tripsJson'):
        if f.get(key) != b.get(key): other[key] = (b.get(key), f.get(key))
    if added or removed or changed or other:
        tot['changed'] += 1; tot['lines_changed'] += len(changed); tot['lines_added'] += len(added); tot['lines_removed'] += len(removed)
        details[s] = {'added': added, 'removed': removed, 'changed': changed, 'other': other, 'trace': f.get('trace', [])}
    else: tot['same'] += 1
print(json.dumps(tot))
json.dump(details, open(f'{F}.diff.json', 'w'), indent=1)
for s, d in details.items():
    if 'error' in d: print(f'{s}: ERROR {d["error"]}'); continue
    print(f'{s}: +{len(d["added"])} -{len(d["removed"])} ~{len(d["changed"])} other={list(d["other"])} trace={len(d["trace"])}')
