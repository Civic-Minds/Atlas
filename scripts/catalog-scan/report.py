#!/usr/bin/env python3
# Headline and tier report between two scan.mts output dirs: totals, per-agency counts, lost and
# gained headlines, biggest headline moves, tier ups and downs. See README.md.
# usage: report.py <baseOutDir> <branchOutDir> [jsonOut]   (jsonOut: full lists, for follow-up checks)
import json,os,collections,sys
if len(sys.argv) < 3: sys.exit('usage: report.py <baseOutDir> <branchOutDir> [jsonOut]')
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
