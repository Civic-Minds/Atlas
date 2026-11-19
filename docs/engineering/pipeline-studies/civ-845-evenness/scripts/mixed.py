# sections (same sharer set, pooled stops only) that still mix a published pooled value with a refused stop, per scenario
import json,sys,collections
for st,od in [('base12','out'),('wide','out'),('base12','out14'),('wide','out14')]:
    R=json.load(open(f'{od}/{st}.json'))
    for v,S in R.items():
        secs=collections.defaultdict(lambda:[0,0])
        for k,r in S.items():
            if not r['secId']: continue
            if r['refused'] or r['mrFlag']: secs[r['secId']][1]+=1
            elif r['passed']: secs[r['secId']][0]+=1
        mixed=[s for s,(p,q) in secs.items() if p and q]
        small=[s for s,(p,q) in secs.items() if p and q and min(p,q)<=2]
        print(f'{st:7s}{od:6s}{v:11s} sections {len(secs):4d} mixed(pass+refused) {len(mixed):3d}  of which minority<=2 stops {len(small):3d}')
