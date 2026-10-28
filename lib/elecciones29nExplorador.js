// Lógica del explorador del 29N (hemiciclo, filtros, mapa y nuevos).
// Vanilla JS sobre el DOM que pinta Elecciones29n.js, con los datos de
// lib/data/elecciones29n.json.
export function iniciar(root, DATA){
const $=(s)=>root.querySelector(s);

const D=DATA.d, CARGOS=DATA.c, NU=DATA.nu;
function foto(d,t){return d.f?`<img src="${d.f}" alt="" loading="lazy" style="width:${t}px;height:${t}px;border-radius:50%;object-fit:cover;object-position:top;flex-shrink:0;background:#f3f2ee;border:2px solid ${COL[d.g]}">`:''}
const ORDEN=['Sumar','ERC','Bildu','PSOE','PNV','Junts','Mixto','PP','VOX'];
const COL={Sumar:'#e0527f',Podemos:'#6b2e8c',Compromís:'#e8732a',UPN:'#1d3f7a',ERC:'#f0ad3a',Bildu:'#9cbf3b',PSOE:'#d4463c',PNV:'#3e8a4f',Junts:'#26b3a6',Mixto:'#9a978f',PP:'#2f6fba',VOX:'#5aa33a'};
const DEST={congreso:['Repite en el Congreso','#6d5aef'],senado:['Pasa al Senado','#a99df5'],suplente:['Suplente','#d9d4fb'],no:['No se presenta','#e6e4dc']};
let modo='29n', grupos=new Set(ORDEN), dest='todos', q='', sel=null, prov=null;
D.sort((a,b)=>ORDEN.indexOf(a.g)-ORDEN.indexOf(b.g)||({congreso:0,senado:1,suplente:2,no:3}[a.d]-{congreso:0,senado:1,suplente:2,no:3}[b.d])||a.n.localeCompare(b.n));
// --- hemiciclo
const N=D.length, FILAS=12, R0=150, R1=380, cx=400, cy=405;
let pos=[];const radios=[...Array(FILAS)].map((_,i)=>R0+(R1-R0)*i/(FILAS-1));const tot=radios.reduce((a,b)=>a+b,0);
let asign=radios.map(r=>Math.round(N*r/tot));let dif=N-asign.reduce((a,b)=>a+b,0);asign[FILAS-1]+=dif;
radios.forEach((r,i)=>{const n=asign[i];for(let k=0;k<n;k++){const a=Math.PI*(1-k/(n-1));pos.push({x:cx+r*Math.cos(a),y:cy-r*Math.sin(a),a})}});
pos.sort((p,q)=>q.a-p.a||0);
const svg=$('#hemi');
svg.innerHTML=D.map((d,i)=>`<circle data-i="${i}" cx="${pos[i].x.toFixed(1)}" cy="${pos[i].y.toFixed(1)}" r="9.2"/>`).join('')+
 `<text x="400" y="360" class="centro" font-size="64" font-weight="750" fill="#1a1a18" id="cn" letter-spacing="-2">114</text><text x="400" y="392" class="centro" font-size="14" fill="#6b6862" id="ct">no se presentan</text>`;
const circles=[...svg.querySelectorAll('circle')];
function visible(d){return grupos.has(d.g)&&(dest==='todos'||(dest==='repite'?(d.d==='congreso'):dest==='senado'?(d.d==='senado'||d.d==='suplente'):d.d==='no'))&&(!q||(d.n+' '+d.z).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(q))&&(!prov||d.z===prov)}
function pinta(){
 let vis=0,no=0;
 circles.forEach((c,i)=>{const d=D[i],v=visible(d);if(v){vis++;if(d.d==='no')no++;}
  let fill=modo==='grupo'?COL[d.g]:(d.d==='no'?'#fff':d.d==='senado'?'#a99df5':d.d==='suplente'?'#d9d4fb':COL[d.g]);
  let stroke=modo==='29n'&&d.d==='no'?'#c9c6be':'none';
  c.setAttribute('fill',fill);c.setAttribute('stroke',stroke);c.setAttribute('stroke-width','1.5');
  c.style.opacity=v?1:.12;c.setAttribute('r',sel===i?12:9.2);});
 const etq={repite:'repiten',senado:'al Senado o suplentes',no:'se van'};
 if(dest!=='todos'){$('#cn').textContent=vis;$('#ct').textContent=etq[dest];}
 else if(modo==='29n'){$('#cn').textContent=no;$('#ct').textContent=vis===350?'no se presentan':`de ${vis} se van`;}
 else{$('#cn').textContent=vis;$('#ct').textContent='diputados';}
 $('#ley').innerHTML=modo==='29n'?
  `<span><i style="background:#6d5aef"></i>Repite (color de su grupo)</span><span><i style="background:#a99df5"></i>Pasa al Senado</span><span><i style="background:#d9d4fb"></i>Suplente</span><span><i style="background:#fff;border:1.5px solid #c9c6be;width:8px;height:8px"></i>No se presenta</span>`:
  ORDEN.map(g=>`<span><i style="background:${COL[g]}"></i>${g}</span>`).join('');
 const todosG=grupos.size===ORDEN.length;
 $('#gtabs').innerHTML=`<button class="gt ${todosG?'on':''}" data-g="*"><span class="n">Todos</span><span class="v">${D.filter(d=>d.d==='no').length} de 350 se van</span></button>`+ORDEN.map(g=>{const t=D.filter(d=>d.g===g),n=t.filter(d=>d.d==='no').length;return `<button class="gt ${!todosG&&grupos.has(g)?'on':''}" data-g="${g}"><span class="n"><i style="background:${COL[g]}"></i>${g}</span><span class="v">${n} de ${t.length} se van</span></button>`}).join('');
 const base=D.filter(d=>grupos.has(d.g)&&(!prov||d.z===prov));
 const cuenta={todos:base.length,repite:base.filter(d=>d.d==='congreso').length,senado:base.filter(d=>d.d==='senado'||d.d==='suplente').length,no:base.filter(d=>d.d==='no').length};
 $('#dests').innerHTML=[['todos','Todos'],['repite','Repiten'],['senado','Senado o suplente'],['no','Se van']].map(([k,l])=>`<button data-d="${k}" class="${dest===k?'on':''}">${l} <span style="color:#8b8780;font-weight:400">${cuenta[k]}</span></button>`).join('');
 $('#filtro-prov').innerHTML=prov?`<span class="chip" data-p="x">${prov} <b>quitar</b></span>`:'';
 ficha();
}
function ficha(){
 const f=$('#ficha');
 if(sel===null){const no=D.filter(d=>d.d==='no').length;
  f.innerHTML=`<div class="ante">El Congreso del 29N</div><div class="kpis"><div class="k"><b style="color:#6d5aef">${D.filter(d=>d.d==='congreso').length}</b><span>repiten en el Congreso</span></div><div class="k"><b style="color:#8b7cf2">${D.filter(d=>d.d==='senado').length}</b><span>pasan al Senado</span></div><div class="k"><b>${D.filter(d=>d.d==='suplente').length}</b><span>van de suplentes</span></div><div class="k"><b>${no}</b><span>no se presentan</span></div></div><p class="vacia" style="margin-top:16px">Pasa por un escaño o busca un nombre para ver su ficha.</p>`;return}
 const d=D[sel],x=d.x;
 const txt=d.d==='no'?`No figura en ninguna de las candidaturas presentadas.`:`${x.c==='congreso'?'Congreso':'Senado'} por ${x.z}<br>Número ${x.o}${x.p?' de suplentes':''} en la lista de <b>${x.s}</b>`;
 f.innerHTML=`<div style="display:flex;gap:14px;align-items:center">${foto(d,64)}<div><div style="display:flex;align-items:center;gap:8px"><i style="width:10px;height:10px;border-radius:50%;background:${COL[d.g]};display:inline-block"></i><span class="g">${d.g}</span><span class="g" style="color:#a8a49c">${d.z}</span></div><h3>${d.n}</h3></div></div><div class="dest ${d.d==='no'?'no':'si'}"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:4px">${DEST[d.d][0]}</div>${txt}</div>${tray(d)}<p style="margin-top:14px;font-size:12.5px"><a href="/institutions/deputies/${d.slug}" style="color:#5a47dc">Ver ficha completa en GovTalent →</a></p>`;
}
function tray(d){let h='';
 if(d.car.length)h+=`<div class="tray"><div class="t">Cargos en la XV Legislatura</div><ul>${d.car.slice(0,5).map(c=>`<li>${c}</li>`).join('')}${d.car.length>5?`<li style="color:#8b8780">y ${d.car.length-5} más</li>`:''}</ul></div>`;
 if(d.com.length)h+=`<div class="tray"><div class="t">Vocal en ${d.com.length===1?'una comisión':d.com.length+' comisiones'}</div><div style="font-size:12.5px;color:#55534e;line-height:1.5">${d.com.slice(0,6).join(', ')}${d.com.length>6?` y ${d.com.length-6} más`:''}</div></div>`;
 return h}
const tip=$('#tip');
svg.addEventListener('mousemove',e=>{const c=e.target.closest('circle');if(!c){tip.style.opacity=0;return}const d=D[+c.dataset.i];tip.innerHTML=`<div style="display:flex;gap:9px;align-items:center">${foto(d,38)}<div><b>${d.n}</b><br>${d.g}, ${d.z}${d.car[0]?`<br><span style="color:#d9d4fb">${d.car[0]}</span>`:''}<br><span style="color:#c9c6be">${DEST[d.d][0]}</span></div></div>`;tip.style.left=e.clientX+14+'px';tip.style.top=e.clientY+14+'px';tip.style.opacity=1;sel=+c.dataset.i;circles.forEach((cc,i)=>cc.setAttribute('r',sel===i?12:9.2));ficha();});
svg.addEventListener('mouseleave',()=>{tip.style.opacity=0});
$('#modos').onclick=e=>{const b=e.target.closest('button');if(!b)return;modo=b.dataset.m;root.querySelectorAll('#modos button').forEach(x=>x.classList.toggle('on',x===b));pinta()};
$('#gtabs').onclick=e=>{const c=e.target.closest('.gt');if(!c)return;const g=c.dataset.g;grupos=g==='*'?new Set(ORDEN):new Set([g]);sel=null;pinta()};
$('#dests').onclick=e=>{const b=e.target.closest('button');if(!b)return;dest=b.dataset.d;sel=null;pinta()};
$('#filtro-prov').onclick=e=>{if(e.target.closest('[data-p]')){prov=null;pinta()}};
$('#q').oninput=e=>{q=e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();const m=D.findIndex(visible);sel=q&&m>=0?m:null;pinta()};
// nuevos
const OT=['Gobierno','Delegaciones del Gobierno','Gobiernos autonómicos','Senado','Parlamentos autonómicos','Parlamento Europeo','Diputaciones','Ayuntamientos','Partido','Otros cargos','Sociedad civil'];
const OTN={Gobierno:'Vienen del Gobierno',Partido:'Cargos de partido',Diputaciones:'Diputaciones y cabildos'};
let nG='*', nO='*', nTodos=false;
const GOB=DATA.gob||[];
const ORDN=['Sumar','Podemos','Compromís','ERC','Bildu','PSOE','PNV','Junts','Mixto','UPN','PP','VOX'];
NU.sort((a,b)=>(a.ot?OT.indexOf(a.ot):99)-(b.ot?OT.indexOf(b.ot):99)||ORDN.indexOf(a.g)-ORDN.indexOf(b.g)||a.z.localeCompare(b.z)||a.o-b.o);
$('#nn').textContent=NU.length;
function pintaNuevos(){
 const porG=NU.filter(n=>nG==='*'||n.g===nG);
 $('#otabs').innerHTML=`<button class="ot ${nO==='*'?'on':''}" data-o="*">Todos<b>${porG.length}</b></button>`+OT.map(o=>{const k=o==='Gobierno'?GOB.filter(n=>nG==='*'||n.g===nG).length:porG.filter(n=>n.ot===o).length;return k?`<button class="ot ${nO===o?'on':''}" data-o="${o}">${OTN[o]||o}<b>${k}</b></button>`:''}).join('')+(porG.some(n=>!n.ot)?`<button class="ot ${nO==='-'?'on':''}" data-o="-">Sin datos aún<b>${porG.filter(n=>!n.ot).length}</b></button>`:'');
 const gs=ORDN.filter(g=>NU.some(n=>n.g===g));
 $('#ntabs').innerHTML=`<button class="gt ${nG==='*'?'on':''}" data-g="*"><span class="n">Todos</span><span class="v">${NU.length} nuevos</span></button>`+gs.map(g=>`<button class="gt ${nG===g?'on':''}" data-g="${g}"><span class="n"><i style="background:${COL[g]}"></i>${g}</span><span class="v">${(k=>k+(k===1?' nuevo':' nuevos'))(NU.filter(n=>n.g===g).length)}</span></button>`).join('');
 const f=nO==='Gobierno'?GOB.filter(n=>nG==='*'||n.g===nG):porG.filter(n=>nO==='*'||(nO==='-'?!n.ot:n.ot===nO));
 const lista=nTodos?f:f.slice(0,24);
 $('#nuevos').innerHTML=lista.map(n=>{const ini=n.n.split(' ').filter(w=>w.length>2&&!/^(del|las|los)$/i.test(w)).slice(0,2).map(w=>w[0]).join('');return `<div class="nv">${n.f?`<img src="${n.f}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;ini&quot; style=&quot;border:2px solid ${COL[n.g]};color:${COL[n.g]}&quot;>${ini}</div>'" style="width:44px;height:44px;border-radius:50%;object-fit:cover;object-position:top;flex-shrink:0;border:2px solid ${COL[n.g]};background:#f3f2ee">`:`<div class="ini" style="border:2px solid ${COL[n.g]};color:${COL[n.g]}">${ini}</div>`}<div><b>${n.n}</b><div class="l">${n.g} por ${n.z}<br>${n.nota||`Número ${n.o} de la lista. Su partido tiene ${n.de} ${n.de===1?'escaño':'escaños'} en la provincia`}</div>${n.org?`<span class="o">${n.org}</span>`:''}</div></div>`}).join('');
 $('#nmas').style.display=f.length>24?'':'none';
 $('#nmas').textContent=nTodos?'Ver menos':`Ver los ${f.length}`;
}
$('#otabs').onclick=e=>{const b=e.target.closest('.ot');if(!b)return;nO=b.dataset.o;nTodos=false;pintaNuevos()};
$('#ntabs').onclick=e=>{const b=e.target.closest('.gt');if(!b)return;nG=b.dataset.g;nO='*';nTodos=false;pintaNuevos()};
$('#nmas').onclick=()=>{nTodos=!nTodos;pintaNuevos()};
pintaNuevos();
// mapa: provincias reales (es-atlas, IGN), Canarias en recuadro
const M=DATA.mapa;
const mapa=$('#mapa');
const pct=z=>{const t=D.filter(d=>d.z===z),n=t.filter(d=>d.d==='no').length;return {t:t.length,n,p:t.length?n/t.length:0}};
const fill=p=>`rgba(109,90,239,${(.1+p*.85).toFixed(2)})`;
mapa.innerHTML=`<svg viewBox="0 0 ${M.w} ${M.h}" class="mapa-svg" role="img" aria-label="Mapa de España por provincias"><rect x="${M.caja.x}" y="${M.caja.y}" width="${M.caja.w}" height="${M.caja.h}" rx="10" fill="none" stroke="#d9d6cf" stroke-dasharray="4 4"/>`+
 M.p.map(q=>{const r=pct(q.n);const peq=/^(Ceuta|Melilla)$/.test(q.n);return `<g class="prov" data-z="${q.n}"><path d="${q.d}" fill="${fill(r.p)}" stroke="#fff" stroke-width="1"/>${peq?`<circle cx="${q.cx}" cy="${q.cy}" r="8" fill="${fill(r.p)}" stroke="#fff" stroke-width="1.5"/>`:''}</g>`}).join('')+`</svg>
 <div class="mapa-ley"><span>Menos se van</span><i style="background:linear-gradient(90deg,${fill(0)},${fill(1)})"></i><span>Más se van</span></div>`;
mapa.addEventListener('mousemove',e=>{const g=e.target.closest('.prov');if(!g){tip.style.opacity=0;return}const r=pct(g.dataset.z);tip.innerHTML=`<b>${g.dataset.z}</b><br>${r.n} de ${r.t} diputados se van`;tip.style.left=e.clientX+14+'px';tip.style.top=e.clientY+14+'px';tip.style.opacity=1;});
mapa.addEventListener('mouseleave',()=>{tip.style.opacity=0});
mapa.onclick=e=>{const t=e.target.closest('.prov');if(!t)return;const z=t.dataset.z;mapa.querySelectorAll('.prov').forEach(x=>x.classList.toggle('sel',x===t));const ds=D.filter(d=>d.z===z);
 $('#prov').innerHTML=`<div class="ante">${z}</div><h3 style="margin:6px 0 10px;font-size:20px">${ds.filter(d=>d.d==='no').length} de ${ds.length} se van</h3>`+ds.map(d=>`<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f3f2ee;font-size:13px">${foto(d,30)}<span style="flex:1">${d.n}<br><span style="font-size:11.5px;color:${COL[d.g]}">${d.g}</span></span><span style="color:${d.d==='no'?'#8b8780':'#3c3489'};font-size:12px">${d.d==='no'?'Se va':d.d==='senado'?'Senado':d.d==='suplente'?'Suplente':'Repite, nº '+d.x.o}</span></div>`).join('')+`<p style="margin-top:12px"><a href="#hemiciclo" data-ver-prov="${z}" style="color:#5a47dc;font-size:13px">Ver en el hemiciclo →</a></p>`};
$('#h-n').textContent=D.filter(d=>d.d==='no').length;
pinta();

{const ac=mapa.querySelector('.prov[data-z="A Coruña"]');if(ac)ac.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
$('#prov').addEventListener('click',e=>{const a=e.target.closest('[data-ver-prov]');if(!a)return;e.preventDefault();prov=a.dataset.verProv;grupos=new Set(ORDEN);dest='todos';pinta();root.querySelector('.stage').scrollIntoView({behavior:'smooth',block:'start'});});

}
