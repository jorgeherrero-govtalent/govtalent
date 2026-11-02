import json,re,unicodedata,collections,sys
c23=[r for r in json.load(open('c23.json')) if r['c']=='congreso' and not r['sup']]
cand=json.load(open(sys.argv[1] if len(sys.argv)>1 else '/home/claude/repo2/lib/data/candidatos29n.json'))
def a(s): return unicodedata.normalize('NFD',s).encode('ascii','ignore').decode().lower()
def k(n):
    n=re.sub(r'[-.,()]',' ',a(n)); return ' '.join(x for x in n.split() if x not in('de','del','la','las','los','y','i','da','do'))
def fam23(s):
    S=s.upper()
    if 'PSOE' in S or S=='PSC': return 'PSOE'
    if S=='PP': return 'PP'
    if S=='UPN': return 'PP'
    if S=='VOX': return 'VOX'
    if 'SUMAR' in S: return 'Sumar'
    if S=='ERC': return 'ERC'
    if 'JUNTS' in S: return 'Junts'
    if 'BILDU' in S: return 'Bildu'
    if 'PNV' in S: return 'PNV'
    if S=='BNG': return 'BNG'
    if S=='CCA': return 'CC'
    return None
def compatible(g26,f23): return f23==g26 or (g26=='Podemos' and f23=='Sumar')
Z23={}
for r in c23: Z23.setdefault(a(r['z']),[]).append(r)
byk=collections.defaultdict(list)
for r in c23: byk[k(r['n'])].append(r)
def prov23(z): return a(z).replace('illes balears','baleares')
res={}; st=collections.Counter()
for z,ls in cand['p'].items():
  pz=prov23(z)
  for l in ls:
    for i,n in enumerate(l['c']):
      kn=k(n); m=None; how=None
      mz=[r for r in byk.get(kn,[]) if a(r['z'])==pz]
      if len(mz)==1: m=mz[0]; how='misma provincia'
      elif not mz:
        # misma provincia por apellidos + nombre de pila, misma familia
        w=kn.split()
        cands=[r for r in Z23.get(pz,[]) if k(r['n']).split()[-2:]==w[-2:] and k(r['n']).split()[0]==w[0] and compatible(l['g'],fam23(r['s']))]
        if len(cands)==1: m=cands[0]; how='misma provincia (nombre parecido)'
        else:
          ot=[r for r in byk.get(kn,[]) if compatible(l['g'],fam23(r['s']))]
          if len(ot)==1 and len(byk.get(kn,[]))==1: m=ot[0]; how='otra provincia'
      if m:
        res[f'{z}|{l["s"]}|{i+1}']=dict(z=m['z'].title() if m['z'].isupper() else m['z'],s=m['s'],o=m['o'],como=how)
        st[how]+=1
      else: st['sin 2023']+=1
json.dump(res,open('cruce.json','w'),ensure_ascii=False)
print(st, len(res))
for kk,v in list(res.items()):
    if v['como']=='otra provincia': print(kk,v)
