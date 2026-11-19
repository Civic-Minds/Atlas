import json,glob,collections as C,csv
slugs=[p[9:-5] for p in glob.glob('analysis-*.json')]
cells=[];flips=[]
for s in slugs:
    a=json.load(open(f'analysis-{s}.json'))
    for c in a['cells']: c['slug']=s; cells.append(c)
    for f in a['flips']: f['slug']=s; flips.append(f)
print(len(slugs),len(cells),len(flips))
tight=lambda r:r['oldOutcome']=='published'
# 1 flips
print('flips tight',sum(map(tight,flips)),'loose',sum(not tight(f) for f in flips))
# unique windows
def wk(f): return (f['slug'],f['routeId'],f['day'],f['dir'],f['headsign'],f['stop'],f.get('pk'),f['site'],f['start'],f['end'])
u={}
for f in flips: u[wk(f)]=f
print('unique windows',len(u),'tight',sum(map(tight,u.values())),'loose',sum(not tight(f) for f in u.values()))
print('allDay flips',sum(f['allDay'] for f in flips),'tight',sum(f['allDay'] and tight(f) for f in flips))
print('sites tight',C.Counter((f['site'],f['caller'].split(' ')[0]) for f in flips if tight(f)))
# T-verification: min(limOld,limNew)
bad=[f for f in flips if min(f['limOld'],f['limNew'])<f['longest']-1e-9 and f['oldOutcome']=='published']
print('tight flips under T check',len(bad))
# stops
st=lambda f:(f['slug'],f['routeId'],f['day'],f['dir'],f['headsign'],f['stop'])
print('stops with T flips',len({st(f) for f in flips if tight(f)}),'stop-periods',len({st(f)+(f.get('pk'),) for f in flips if tight(f)}))
print('agencies T flips',C.Counter(f['slug'] for f in flips if tight(f)))
# cell classification
cat=C.Counter(); bykind=C.defaultdict(C.Counter)
for c in cells:
    fr=c.get('flipRows',[])
    t=sum(r['oldOutcome']=='published' for r in fr); l=len(fr)-t
    if not fr: k='noflip(cascade/missing)'
    elif l==0: k='tight-only'
    elif t==0: k='loose-only'
    else: k='mixed'
    cat[k]+=1; bykind[k][c['kind']]+=1
print(cat); 
for k,v in bykind.items(): print(k,dict(v))
json.dump(cells,open('cells_all.json','w'))
