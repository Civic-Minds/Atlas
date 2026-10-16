#!/usr/bin/env python3
# Headline and tier report between two scan.mts output dirs: totals, per-agency counts, lost and
# gained headlines, biggest headline moves, tier ups and downs. See README.md.
# usage: report.py <baseOutDir> <branchOutDir> [jsonOut]   (jsonOut: full lists, for follow-up checks)
#        report.py route-values <baseRvDir> <branchRvDir> [--json PATH] [--limit N] [--slugs a,b]
#   route-values compares route-values.mts outputs: per route, day and period the worst-direction value
#   (wdph), the full-window wait (wdpch), the filter's value and pass/fail at 10/15/20/30/60, plus Night
#   30/60 per route direction. Identical inputs print 0 rows. See README.md.
import json,os,collections,sys
def route_values_report(args):
    pos=[]; opts={'--json':None,'--limit':'40','--slugs':None}; it=iter(args)
    for a in it:
        if a in opts: opts[a]=next(it,None)
        else: pos.append(a)
    if len(pos)!=2: sys.exit('usage: report.py route-values <baseRvDir> <branchRvDir> [--json PATH] [--limit N] [--slugs a,b]')
    A_RV,B_RV=pos; limit=int(opts['--limit']); only=set((opts['--slugs'] or '').split(',')) - {''}
    def rv(d): return {f[:-5]:json.load(open(os.path.join(d,f)))['routes'] for f in os.listdir(d) if f.endswith('.json') and (not only or f[:-5] in only)}
    A=rv(A_RV); B=rv(B_RV); PER=['all','amPeak','midday','pmPeak','evening','late','overnight']
    rows=[]; added=[]; removed=[]; night=[]; route_days=0
    for slug in sorted(set(A)&set(B)):
        for key in sorted(set(A[slug])|set(B[slug])):
            x=A[slug].get(key); y=B[slug].get(key)
            if x is None: added.append((slug,key)); continue
            if y is None: removed.append((slug,key)); continue
            route_days+=1
            name=(y.get('short') or x.get('short') or '')
            for per in PER:
                p=x['periods'][per]; q=y['periods'][per]
                if (p['wdph'],p['wdpch'],p['value'],p['pass'])!=(q['wdph'],q['wdpch'],q['value'],q['pass']):
                    flips=[f"{n}:{'pass' if n in p['pass'] else 'fail'}->{'pass' if n in q['pass'] else 'fail'}" for n in (10,15,20,30,60) if (n in p['pass'])!=(n in q['pass'])]
                    rows.append({'slug':slug,'route':name,'key':key,'period':per,'wdph':[p['wdph'],q['wdph']],'wdpch':[p['wdpch'],q['wdpch']],'value':[p['value'],q['value']],'flips':flips})
            if x['night']!=y['night']:
                night.append({'slug':slug,'route':name,'key':key,'before':x['night'],'after':y['night']})
    print(f'ROUTE VALUES: {len(set(A)&set(B))} agencies, {route_days} route-days compared | {A_RV} vs {B_RV}')
    print(f'rows changed: {len(rows)} | night changed: {len(night)} | route-days added: {len(added)}, removed: {len(removed)}')
    if rows:
        print('\nBY AGENCY (rows):', collections.Counter(r['slug'] for r in rows).most_common(30))
        print('BY PERIOD (rows):', collections.Counter(r['period'] for r in rows).most_common())
        print('THRESHOLD FLIPS:', collections.Counter(f.split(':')[0]+' '+f.split(':')[1] for r in rows for f in r['flips']).most_common())
        print(f'\nFIRST {min(limit,len(rows))} ROWS (agency route day period | wdph | wdpch | value | flips):')
        for r in rows[:limit]: print(f"  {r['slug']:14} {r['route']:8} {r['key'].split('|')[-1]:9} {r['period']:9} wdph {r['wdph'][0]}->{r['wdph'][1]} wdpch {r['wdpch'][0]}->{r['wdpch'][1]} value {r['value'][0]}->{r['value'][1]} {' '.join(r['flips'])}")
    if night:
        print(f'\nNIGHT CHANGES (first {min(limit,len(night))}):')
        for n in night[:limit]:
            b=n['before']; a=n['after']
            print(f"  {n['slug']:14} {n['route']:8} {n['key'].split('|')[-1]:9} 30:{b['route30']}->{a['route30']} 60:{b['route60']}->{a['route60']} dirs {json.dumps(b['dirs'])} -> {json.dumps(a['dirs'])}")
    for title,lst in (('ADDED',added),('REMOVED',removed)):
        if lst: print(f'\n{title} route-days:', lst[:limit])
    if opts['--json']: json.dump({'rows':rows,'night':night,'added':added,'removed':removed}, open(opts['--json'],'w'))
if len(sys.argv) > 1 and sys.argv[1]=='route-values':
    route_values_report(sys.argv[2:]); sys.exit(0)
if len(sys.argv) < 3: sys.exit('usage: report.py <baseOutDir> <branchOutDir> [jsonOut]\n       report.py route-values <baseRvDir> <branchRvDir> [--json PATH] [--limit N] [--slugs a,b]')
A_DIR, B_DIR = sys.argv[1], sys.argv[2]; JSON_OUT = sys.argv[3] if len(sys.argv) > 3 else None
RANK={'5':0,'10':1,'15':2,'20':3,'30':4,'60':5,'infrequent':6,'span':7,None:8}
def load(d):
    out={}
    for f in os.listdir(d):
        if f.endswith('.json'): out[f[:-5]]=json.load(open(os.path.join(d, f)))
    return out
def num(v):
    try: return None if v in (None,'None') else float(v)
    except: return None
A=load(A_DIR); B=load(B_DIR)
per=collections.defaultdict(collections.Counter); moves=[]; nones=[]; gained=[]; up=[]; down=[]; sizes={}
for s in sorted(set(A)&set(B)):
    x=A[s]; y=B[s]
    if not (x.get('ok') and y.get('ok')): per[s]['not ok']+=1; continue
    for k in set(x['lines'])|set(y['lines']):
        p=x['lines'].get(k); q=y['lines'].get(k)
        if p is None or q is None: per[s]['added/removed']+=1; continue
        per[s]['lines']+=1
        ph=num(p.get('headway')); qh=num(q.get('headway'))
        if ph!=qh:
            per[s]['headway']+=1
            if qh is None and ph is not None: nones.append((s,k,ph,p.get('tier'),q.get('tier')))
            elif ph is None: gained.append((s,k,qh,q.get('tier')))
            else: moves.append((abs(qh-ph)/max(ph,1),s,k,ph,qh,p.get('tier'),q.get('tier')))
        pt=p.get('tier'); qt=q.get('tier')
        if pt!=qt:
            per[s]['tier']+=1
            rec=(s,k,ph,qh,pt,qt,str(q.get('stopTiers') or {})[:0], len(q.get('stopTiers') or {}), (q.get('stopOrder') or {}).get('n'))
            if RANK.get(qt,8)>RANK.get(pt,8): per[s]['tier down']+=1; down.append(rec)
            else: per[s]['tier up']+=1; up.append(rec)
        if q.get('stopTiers') is not None: per[s]['has stopTiers']+=1
# Origin rows (CIV-221): a slot (route, direction, day, headsign) that has 'from <origin>' rows
# must have two or more of them and no plain row beside them, or one of its rows understates
# the service. Counted on the branch after the pipeline's own clearing.
origin_slots=0; lone_origin=[]; plain_beside=[]
for s in sorted(B):
    y=B[s]
    if not y.get('ok'): continue
    slots=collections.defaultdict(lambda: {'labels':set(),'plain':0})
    for k,q in y['lines'].items():
        parts=k.split('|'); r,d,day,hs,var=parts[0],parts[1],parts[2],parts[3],parts[4]
        if var.startswith('from '): slots[(r,d,day,hs)]['labels'].add(var)
        elif var=='': slots[(r,d,day,hs)]['plain']+=1
    for key,v in slots.items():
        if not v['labels']: continue
        origin_slots+=1
        if len(v['labels'])<2: lone_origin.append((s,)+key+(sorted(v['labels'])[0],))
        if v['plain']: plain_beside.append((s,)+key)
tot=collections.Counter()
for s,c in per.items(): tot.update(c)
print('TOTAL', dict(tot), 'agencies', len(per), '| compare', A_DIR, 'vs', B_DIR)
print('\nBY AGENCY (lines, headway, tier up, tier down) for agencies with any change:')
for s,c in sorted(per.items(), key=lambda x:-(x[1]['headway']+x[1]['tier'])):
    if c['headway'] or c['tier'] or c['not ok']: print(f"  {s:24} lines {c['lines']:5} headway {c['headway']:4} tier up {c['tier up']:3} down {c['tier down']:3} {'NOT OK' if c['not ok'] else ''}")
print('\nORIGIN ROWS: slots', origin_slots, '| single-origin rows', len(lone_origin), '| slots with a plain row beside origin rows', len(plain_beside))
for n in lone_origin[:20]: print('   lone', n)
for n in plain_beside[:20]: print('   plain beside', n)
print('\nHEADLINE None on branch but not on base:', len(nones))
cnt=collections.Counter(n[0] for n in nones); print('  by agency:', dict(cnt.most_common(25)))
for n in nones[:30]: print('  ',n)
print('\nHEADLINE gained (None on base):', len(gained))
for n in gained[:20]: print('  ',n)
print('\n15 BIGGEST HEADLINE MOVES (relative):')
for m in sorted(moves, reverse=True)[:15]: print('  ',m[1],m[2],'base',m[3],'->',m[4],'tier',m[5],'->',m[6])
print('\n15 BIGGEST ABSOLUTE MOVES:')
for m in sorted(moves, key=lambda m:-abs(m[4]-m[3]))[:15]: print('  ',m[1],m[2],'base',m[3],'->',m[4],'tier',m[5],'->',m[6])
def show(lst,title):
    print(f'\n{title}: {len(lst)}')
    print('  transitions:', collections.Counter(f'{r[4]}->{r[5]}' for r in lst).most_common(12))
    print('  by agency:', collections.Counter(r[0] for r in lst).most_common(30))
    for r in lst[:0]: print(r)
show(up,'TIER UP'); show(down,'TIER DOWN')
if JSON_OUT: json.dump({'up':up,'down':down,'nones':nones,'moves':moves,'gained':gained}, open(JSON_OUT,'w'))
