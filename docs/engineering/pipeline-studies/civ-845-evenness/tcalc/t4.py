import json,collections as C
exec(open('../t3.py').read().split("out=C.Counter()")[0])
tab=C.Counter()
for x in miss:
    s=x['slug']; st=str(x['stop'])
    for p0 in ('pbase','pcand'): pass
    B={};Cn={}
    for w,D in(('pbase',B),('pcand',Cn)):
        for f in load(w,s):
            p=f['properties']
            if p.get('routeId')==x['routeId'] and p.get('day')==x['day'] and str(p.get('directionId'))==str(x['dir']):
                D[(p.get('headsign') or '')]=(st in p['stopOrder'], p['stopPeriodHeadways'].get(st,None), p['stopHeadways'].get(st,None))
    diff=[h for h in set(B)|set(Cn) if B.get(h)!=Cn.get(h)]
    fl=[f for f in flips if f['slug']==s and str(f['routeId'])==str(x['routeId']) and f['day']==x['day'] and str(f['stop'])==st and str(f['dir'])==str(x['dir'])]
    for h in diff:
        flh=[f for f in fl if (f['headsign'] or '')==h]
        print(s,x['route'],x['day'],st,'|',h[:22],'| base',B.get(h),'cand',Cn.get(h),'| flips at this headsign:',C.Counter((f['site'],f.get('pk'),f['oldOutcome']+'>'+f['newOutcome']) for f in flh).most_common(3),'| any-headsign flips',len(fl))
