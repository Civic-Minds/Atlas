import json,glob,collections as C
cells=json.load(open('cells_cls.json'))
miss=[x for x in cells if x['kind']=='stop missing on one side']
flips=[]
for s in set(x['slug'] for x in miss):
    for f in json.load(open(f'analysis-{s}.json'))['flips']: f['slug']=s; flips.append(f)
feat={}
def load(w,s):
    k=(w,s)
    if k not in feat: feat[k]=json.load(open(f'stops-{w}/{s}/{s}.json'))['features']
    return feat[k]
out=C.Counter()
for x in miss:
    s=x['slug']
    res={}
    for w in('pbase','pcand'):
        for f in load(w,s):
            p=f['properties']
            if p.get('routeId')==x['routeId'] and p.get('day')==x['day'] and str(p['directionId'])==str(x['dir']):
                st=str(x['stop'])
                res.setdefault(w,[]).append(dict(hw=p['stopPeriodHeadways'].get(st,'ABSENT'),cov=p['stopPeriodCoverageHeadways'].get(st,'ABSENT'),order=st in p['stopOrder'],sh=p['stopHeadways'].get(st,'ABSENT'),tier=p['stopTiers'].get(st,'ABSENT') if 'stopTiers' in p else None,hs=(p.get('headsign') or '')[:22]))
    fl=[f for f in flips if f['slug']==s and str(f['routeId'])==str(x['routeId']) and f['day']==x['day'] and str(f['stop'])==str(x['stop'])]
    key=(x['slug'],x['route'],x['day'],x['headsign'][:20] if x['headsign'] else '')
    print(x['slug'],x['route'],x['day'],x['stop'],x['headsign'][:25] if x['headsign'] else '', json.dumps(res), 'flips-for-stop',[(f.get('pk'),f['site'],f['oldOutcome'],f['newOutcome'],f['ownN']) for f in fl][:4])
