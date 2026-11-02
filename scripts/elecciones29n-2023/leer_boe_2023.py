import re,json,sys
L=open('boe23.txt',encoding='utf8').read().split('\n')
out=[];junta=None;camara=None;cand=None;sig=None;sup=False
skip=re.compile(r'BOLETÍN OFICIAL DEL ESTADO|^Núm\. 152|Verificable en|cve: BOE|^\s*$')
pend=''
for raw in L:
    l=raw.strip()
    l=re.sub(r'\s{3,}(Verificable en https://www\.boe\.es|cve: BOE-A-2023-15066)\s*$','',l)
    if skip.search(l) and not l.startswith('JUNTA'): continue
    m=re.match(r'JUNTA ELECTORAL (?:PROVINCIAL )?DE (.+)$',l)
    if m: junta=m.group(1).strip(); camara=None; continue
    if l.startswith('CONGRESO DE LOS DIPUTADOS'): camara='congreso'; continue
    if l.startswith('SENADO'): camara='senado'; continue
    if l.startswith('Suplentes'): sup=True; continue
    m=re.match(r'^(\d+)\.\s+(.*\(([^()]+)\))\s*$',l)
    if m and camara and not re.match(r'^\d+\.\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]',m.group(2)):
        cand=m.group(2); sig=m.group(3); sup=False; continue
    m=re.match(r'^(\d+)\.\s+(.+?)\.?$',l)
    if m and camara and cand:
        out.append(dict(z=junta,c=camara,cand=cand,s=sig,o=int(m.group(1)),n=m.group(2).strip().rstrip('.'),sup=sup))
json.dump(out,open('c23.json','w'),ensure_ascii=False)
import collections
print(len(out), collections.Counter((r['c'],r['sup']) for r in out))
print(sorted(collections.Counter(r['z'] for r in out if r['c']=='congreso').items())[:60])
