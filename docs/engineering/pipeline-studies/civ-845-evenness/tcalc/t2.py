import json,glob,collections as C
cells=json.load(open('cells_all.json'))
flips=[]
for s in [p[9:-5] for p in glob.glob('analysis-*.json')]:
    for f in json.load(open(f'analysis-{s}.json'))['flips']: f['slug']=s; flips.append(f)
idx=C.defaultdict(list)
for f in flips: idx[(f['slug'],str(f['routeId']),f['day'],str(f['dir']),f['headsign'] or '',str(f['stop']),str(f.get('pk')))].append(f)
TM=[10,15,20,30,60]; tier=lambda v: sum(1 for m in TM if v>m)
for c in cells:
    c['k']=(c['slug'],str(c['routeId']),c['day'],str(c['dir']),c['headsign'] or '',str(c['stop']),str(c['period']))
    fl=idx.get(c['k'],[])
    t=sum(f['oldOutcome']=='published' for f in fl)
    c['cls']='nofl' if not fl else ('T' if t==len(fl) else ('L' if t==0 else 'M'))
    c['fl']=fl
print(C.Counter(c['cls'] for c in cells))
def near(a,b): return abs(float(a)-float(b))<0.51
def path(c):
    if not c['fl'] or c['from'] is None or c['to'] is None: return None
    fr,to=float(c['from']),float(c['to'])
    for f in c['fl']:
        # pooled value vs own value vs longest
        pooled=[f['value'],f['longest']]; own=[f['ownValue']]
        if f['oldOutcome']=='published':  # tighten: from pooled, to own/longest
            if (near(fr,f['value']) or near(fr,f['longest'])) and (f['ownValue'] is not None and near(to,f['ownValue']) or near(to,f['longest'])): return 'same'
        else:
            if (f['ownValue'] is not None and near(fr,f['ownValue']) or near(fr,f['longest'])) and (near(to,f['value']) or near(to,f['longest'])): return 'same'
    return 'other'
res=C.defaultdict(C.Counter)
for c in cells:
    kind=c['kind']; p=path(c)
    if kind in('published->none','none->published'): p='gate on/off'
    elif kind=='stop missing on one side': p='missing'
    elif p is None: p='unlinked'
    c['path']=p
    res[c['cls']][p]+=1
for k,v in res.items(): print(k,dict(v))
# swings
def delta(c):
    if c['from'] is None or c['to'] is None: return None
    try: return float(c['to'])-float(c['from'])
    except: return None
def stats(cs,label):
    vc=[c for c in cs if delta(c) is not None]
    ad=[abs(delta(c)) for c in vc]
    tc=sum(tier(float(c['from']))!=tier(float(c['to'])) for c in vc)
    print(label,'cells',len(cs),'value-to-value',len(vc),'tier chg',tc,'>30',sum(a>30 for a in ad),'31-60',sum(30<a<=60 for a in ad),'>60',sum(a>60 for a in ad),'pub->none',sum(c['kind']=='published->none' for c in cs),'none->pub',sum(c['kind']=='none->published' for c in cs),'stops',len({c['k'][:6] for c in cs}),'stopperiods',len({c['k'] for c in cs}),'agencies',len({c['slug'] for c in cs}))
stats(cells,'ALL')
stats([c for c in cells if c['cls']=='T'],'T-cells')
stats([c for c in cells if c['cls']=='L'],'L-cells')
stats([c for c in cells if c['cls']=='nofl'],'nofl')
for cl in('T','L'):
  for p in ('same','other','gate on/off'):
    stats([c for c in cells if c['cls']==cl and c['path']==p],f'{cl}/{p}')
# casc flag
print('cascade flag',C.Counter((c['cls'],c.get('stopHasCascadeInputChange')) for c in cells))
big=[c for c in cells if delta(c) is not None and abs(delta(c))>60]
print('>60 by cls/path/field',C.Counter((c['cls'],c['path'],c['field']) for c in big))
print('>60 by dir',C.Counter((c['kind']) for c in big))
print('>60 by agency',C.Counter(c['slug'] for c in big).most_common(8))
json.dump([{k:v for k,v in c.items() if k!='fl'} for c in cells],open('cells_cls.json','w'))
tot=[c for c in cells if c['cls']=='T']
