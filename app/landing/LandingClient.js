'use client';

/**
 * Landing pública de GovTalent (govtalent.app/ sin sesión).
 *
 * El marcado sale tal cual del diseño (template.json, generado a partir del
 * archivo de diseño de la landing) y aquí se pinta con React: los huecos
 * {{...}}, las listas (sc-for) y los condicionales (sc-if). La lógica de las
 * maquetas animadas (pestañas, escritura, enriquecimiento…) es la misma del
 * diseño, copiada abajo sin cambios.
 *
 * Se renderiza también en el servidor, así que todo el texto llega en el
 * HTML (lo que lee Google). Las animaciones arrancan al montar.
 */
import { Fragment, createElement, useEffect, useReducer, useRef } from 'react';
import TPL from './template.json';

class DCLogic {
  constructor(update) {
    this.state = {};
    this._update = update;
  }
  setState(patch) {
    this.state = Object.assign({}, this.state, patch);
    this._update();
  }
}

/* ---------- lógica del diseño (sin cambios) ---------- */
var GT_DQ = 'Quién lleva energía en el Gobierno, el Congreso, las comunidades y la Comisión Europea';
var GT_DTABS = ['Buscar y enriquecer', 'Base de datos', 'Listas'];
var GT_DURLS = ['contactos', 'base-de-datos', 'listas'];
var GT_DDUR = [15000, 8000, 8000];
var GT_PROMPT = 'Avísame de cualquier novedad sobre almacenamiento energético y baterías en Madrid, Cataluña y a nivel estatal, sobre todo de plazos de enmiendas y consultas públicas.';
var GT_TABS = ['Asistente', 'Novedades', 'Alarmas', 'Base de datos', 'Enriquecer'];
var GT_URLS = ['asistente', 'novedades', 'alarmas', 'base-de-datos', 'contactos/listas/energia'];
var GT_DUR = [10000, 7000, 7000, 11500, 15000];
var GT_CTQ = 'Quién lleva energía en el Gobierno, el Congreso, las comunidades y la Comisión Europea';
var GT_PASOS = [
['Entiendo:', 'cargos con competencias en energía, no solo el ministerio'],
['Ámbito:', 'Gobierno y AGE, Congreso, parlamentos autonómicos y Comisión Europea'],
['Busco en', 'organigramas, comisiones parlamentarias y EU Whoiswho'],
['Ordeno', 'por nivel del cargo y priorizo a quien tiene correo']
];
var GT_FILAS = [
['Directora general de Política Energética y Minas', 'MITECO', 'Secretaría de Estado de Energía', 1, 'despacho.dgpem@miteco.gob.es', 'Despacho del cargo', 0, 'BOE | nombramiento', -1],
['Portavoz | Comisión de Transición Ecológica', 'Congreso de los Diputados', 'Grupo parlamentario', 0, 'nombre.apellido@congreso.es', 'Directo', 0, 'Congreso', -1],
['Jefa de unidad', 'Comisión Europea', 'DG Energía', 0, 'nombre.apellido@ec.europa.eu', 'Directo', 0, 'EU Whoiswho', -1],
['Subdirector general de Energía Eléctrica', 'MITECO', 'DG de Política Energética y Minas', 1, 'nombre.apellido@miteco.gob.es', 'Verificado', 1, 'DIR3', 12],
['Diputada | Comissió de Territori', 'Parlament de Catalunya', 'Grupo parlamentario', 0, 'nombre.apellido@parlament.cat', 'Directo', 0, 'Parlament de Catalunya', -1],
['Diputado | Comisión de Fomento', 'Parlamento de Andalucía', 'Grupo parlamentario', 0, 'nombre.apellido@parlamentodeandalucia.es', 'Probable', 1, 'Parlamento de Andalucía', 20],
['Consejera de Medio Ambiente y Energía', 'Comunidad de Madrid', 'Consejería', 1, 'nombre.apellido@madrid.org', 'Directo', 0, 'BOCM | nombramiento', -1],
['Director de Energía', 'CNMC', 'Dirección de Energía', 1, 'nombre.apellido@cnmc.es', 'Directo', 0, 'CNMC', -1]
];
function gtCt(clk) {
var L = GT_CTQ.length;
var typed = Math.max(0, Math.min(L, (clk - 8) * 2));
var tEnd = 8 + Math.ceil(L / 2);
var R = tEnd + 22;
var found = 0, marcha = 0;
var filas = GT_FILAS.map(function (f, i) {
var st = 'ver';
if (f[8] >= 0) {
var a = R + f[8], b = a + 12;
st = clk < a ? 'boton' : (clk < b ? 'busca' : 'ver');
if (st === 'busca') marcha++;
if (st === 'ver') found++;
}
return {
cls: 'ct-row in d' + (i + 2), nom: '[Nombre Apellido]', tit: !!f[3], cargo: f[0], inst: f[1], unidad: f[2],
email: f[4], tipo: f[5], tipocls: f[6] ? 'gt-tipo gt-tipo-p pop' : 'gt-tipo', fuente: f[7],
ver: st === 'ver', boton: st === 'boton', busca: st === 'busca',
nota: f[5] === 'Probable' && st === 'ver', notatxt: 'Patrón del dominio | comprobando en su servidor'
};
});
var n = clk < tEnd + 2 ? 0 : Math.min(GT_PASOS.length, Math.floor((clk - tEnd - 2) / 4) + 1);
return {
cred: 25 - found, credpct: Math.round((25 - found) / 25 * 100) + '%',
portada: clk < R, resultados: clk >= R,
vacio: typed === 0, lleno: typed > 0, texto: GT_CTQ.slice(0, typed),
boxcls: typed > 0 ? 'ct-box ct-box-on' : 'ct-box',
sendcls: typed >= L ? 'ct-send ct-send-on' : 'ct-send',
piensa: clk >= tEnd + 2 && clk < R, sugerencias: clk < tEnd + 2,
pasos: GT_PASOS.slice(0, n).map(function (p) { return { t: p[0], d: p[1] }; }),
query: GT_CTQ, filas: filas,
estado: marcha > 0 ? ' | enriqueciendo ' + marcha + '…' : ''
};
}

var GT_DBT = ['Todo', 'Instituciones', 'Organizaciones', 'Medios y actores sociales'];
var GT_DBN = ['País', 'Nivel', 'Tipo de organización', 'Tipo de medio'];
var GT_DBE = ['Institución u organización', 'Institución', 'Organización', 'Medio u organización'];
var GT_DB = [
[
['SE', 1, 'Secretaria de Estado de Energía', 'Secretaría de Estado de Energía', 1, 'Ministerio para la Transición Ecológica', 'Administración General del Estado', 3, 'secretaria.see@miteco.gob.es', '91 123 45 67'],
['CO', 0, 'Consejera', 'Consejo', 0, 'CNMC', 'Organismo regulador', 3, 'nombre.apellido@cnmc.es', '91 234 56 78'],
['PO', 0, 'Portavoz | Comisión de Transición Ecológica', 'Grupo parlamentario', 0, 'Congreso de los Diputados', 'Cortes Generales', 2, 'nombre.apellido@congreso.es', '91 345 67 89'],
['RI', 0, 'Directora de relaciones institucionales', 'Dirección general', 0, '[Patronal]', 'Patronal', 2, 'nombre.apellido@organizacion.es', '91 456 78 90'],
['RE', 0, 'Redactora de energía', 'Sección de Economía', 0, '[Diario]', 'Prensa', 2, 'nombre.apellido@diario.es', '91 567 89 01'],
['JU', 0, 'Jefa de unidad', 'DG Energía', 1, 'Comisión Europea', 'Unión Europea', 2, 'nombre.apellido@ec.europa.eu', '+32 2 299 11 11'],
['DI', 0, 'Diputada | Comisión de Industria', 'Grupo parlamentario', 0, 'Asamblea de Madrid', 'Parlamento autonómico', 2, 'nombre.apellido@asambleamadrid.es', '91 111 22 33'],
['DS', 1, 'Directora de sostenibilidad', 'Dirección general', 0, 'Farmaindustria', 'Asociación sectorial', 2, 'nombre.apellido@farmaindustria.es', '91 222 33 44']
],
[
['DG', 1, 'Director general de Política Energética y Minas', 'Secretaría de Estado de Energía', 0, 'Ministerio para la Transición Ecológica', 'Administración General del Estado', 3, 'despacho.dgpem@miteco.gob.es', '91 678 90 12'],
['DI', 0, 'Diputada | Comisión de Medio Ambiente', 'Grupo parlamentario', 0, 'Asamblea de Madrid', 'Parlamento autonómico', 3, 'nombre.apellido@asambleamadrid.es', '91 789 01 23'],
['CS', 1, 'Consejera de Medio Ambiente y Energía', 'Consejería', 0, 'Comunidad de Madrid', 'Comunidad autónoma', 2, 'nombre.apellido@madrid.org', '91 890 12 34'],
['DP', 0, 'Diputado | Comissió de Territori', 'Grupo parlamentario', 1, 'Parlament de Catalunya', 'Parlamento autonómico', 2, 'nombre.apellido@parlament.cat', '93 123 45 67'],
['CA', 0, 'Consejero de Asuntos Económicos', 'Cancillería', 0, 'Embajada de Alemania', 'Cuerpo diplomático', 2, 'info@madrid.diplo.de', '91 234 56 70'],
['DM', 0, 'Directora de Energías Renovables', 'Dirección', 0, 'IDAE', 'Organismo público', 2, 'nombre.apellido@idae.es', '91 345 67 80'],
['SE', 1, 'Secretario general', 'Secretaría general', 0, 'Consejo Económico y Social', 'Alta institución', 2, 'nombre.apellido@ces.es', '91 333 44 55'],
['AS', 0, 'Asesora', 'Gabinete de la Presidencia', 0, 'Junta de Andalucía', 'Comunidad autónoma', 2, 'nombre.apellido@juntadeandalucia.es', '95 444 55 66']
],
[
['DG', 1, 'Director general', 'Dirección general', 0, 'Farmaindustria', 'Asociación sectorial', 3, 'nombre.apellido@farmaindustria.es', '91 456 78 91'],
['AR', 0, 'Directora de asuntos regulatorios', 'Asuntos regulatorios', 0, 'FIAB', 'Asociación sectorial', 3, 'nombre.apellido@fiab.es', '91 567 89 02'],
['PP', 0, 'Director de políticas públicas', 'Políticas públicas', 0, 'ADIGITAL', 'Asociación sectorial', 2, 'nombre.apellido@adigital.org', '91 678 90 13'],
['SG', 1, 'Secretaria general', 'Secretaría general', 1, '[Patronal]', 'Patronal', 2, 'nombre.apellido@organizacion.es', '91 789 01 24'],
['PR', 1, 'Presidente', 'Consejo de administración', 0, '[Sociedad estatal]', 'Sociedad estatal', 2, 'nombre.apellido@organizacion.es', '91 890 12 35'],
['RI', 0, 'Responsable de relaciones institucionales', 'Dirección', 0, '[Asociación sectorial]', 'Asociación sectorial', 2, 'nombre.apellido@organizacion.es', '91 901 23 46'],
['DC', 0, 'Director de comunicación', 'Comunicación', 0, '[Patronal autonómica]', 'Patronal', 2, 'nombre.apellido@organizacion.es', '93 555 66 77'],
['PA', 1, 'Presidenta', 'Junta directiva', 0, '[Colegio profesional]', 'Colegio profesional', 2, 'nombre.apellido@organizacion.es', '91 666 77 88']
],
[
['DI', 1, 'Directora', 'Dirección', 0, '[Diario nacional]', 'Prensa', 3, 'nombre.apellido@diario.es', '91 123 45 68'],
['JE', 0, 'Jefe de Economía', 'Sección de Economía', 0, '[Agencia de noticias]', 'Agencia', 2, 'nombre.apellido@agencia.es', '91 234 56 79'],
['PR', 0, 'Presentadora', 'Informativos', 0, '[Radio]', 'Radio', 2, 'nombre.apellido@radio.es', '91 345 67 81'],
['SP', 0, 'Secretario de Políticas Públicas', 'Comisión ejecutiva', 0, '[Sindicato]', 'Sindicato', 2, 'nombre.apellido@sindicato.es', '91 456 78 92'],
['RI', 0, 'Responsable de incidencia política', 'Incidencia', 0, '[ONG]', 'ONG', 2, 'nombre.apellido@ong.org', '91 567 89 03'],
['SE', 0, 'Secretaria de Transición Ecológica', 'Comisión ejecutiva', 0, '[Partido político]', 'Partido político', 2, 'nombre.apellido@partido.es', '91 678 90 14'],
['CO', 0, 'Columnista de política', 'Opinión', 0, '[Diario digital]', 'Prensa', 2, 'nombre.apellido@diario.es', '91 777 88 99'],
['DI', 1, 'Director', 'Dirección', 0, '[Fundación]', 'Tercer sector', 2, 'nombre.apellido@fundacion.org', '91 888 99 00']
]
];
var GT_FOTOS_M = ['/landing/r01.svg', '/landing/r03.svg', '/landing/r05.svg', '/landing/r07.svg', '/landing/r09.svg', '/landing/r12.svg'];
var GT_FOTOS_F = ['/landing/r02.svg', '/landing/r04.svg', '/landing/r06.svg', '/landing/r08.svg', '/landing/r10.svg', '/landing/r11.svg'];
function gtDbRows(b) {
return GT_DB[b].map(function (r, i) {
return {
ini: r[0], avc: r[1] ? 'dav dav-t' : 'dav', foto: (/a$/.test(r[2].split(' ')[0]) ? GT_FOTOS_F : GT_FOTOS_M)[(b * 2 + i) % 6], nom: '[Nombre Apellido]', cargo: r[2], unidad: r[3],
otros: r[4] ? '| ' + r[4] + ' cargo más' : '', inst: r[5], nivel: r[6],
bars: 'bars b' + r[7], score: r[7] === 3 ? 'Alta' : (r[7] === 2 ? 'Media' : 'Baja'),
email: r[8], tel: r[9], cls: 'dbr in d' + (i + 2),
chk: i === 0 ? 'cbx chk-on' : (i === 1 ? 'cbx chk-on2' : (i === 2 ? 'cbx chk-on3' : 'cbx'))
};
});
}

class Component extends DCLogic {
componentDidMount() {
this.reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
this.auto = true;
this.dauto = true;
this.startTab(0);
this.startDir(0);
this.euauto = true;
this.setState({ eutab: 2 });
if (!this.reduce) {
this.eti = setInterval(() => {
if (!this.euauto) return;
this.setState({ eutab: (((this.state && this.state.eutab) || 0) + 1) % 5 });
}, 5000);
}
}
componentWillUnmount() {
clearInterval(this.ti);
clearTimeout(this.tt);
clearInterval(this.dti);
clearTimeout(this.dtt);
clearInterval(this.ei);
clearInterval(this.bi);
clearInterval(this.eti);
clearInterval(this.bi2);
}
startDir(i) {
clearInterval(this.dti);
clearTimeout(this.dtt);
this.setState({ dtab: i, dclk: this.reduce ? 999 : 0 });
if (i === 0 && !this.reduce) {
this.dti = setInterval(() => {
var t = ((this.state && this.state.dclk) || 0) + 1;
if (t > 140) { clearInterval(this.dti); return; }
this.setState({ dclk: t });
}, 100);
}
clearInterval(this.bi2);
if (i === 1 && !this.reduce) {
this.dbauto = true;
this.setState({ dblk: 0 });
this.bi2 = setInterval(() => {
if (!this.dbauto) return;
var b = ((this.state && this.state.dblk) || 0) + 1;
if (b > 3) { clearInterval(this.bi2); return; }
this.setState({ dblk: b });
}, 2700);
}
if (this.dauto && !this.reduce) {
this.dtt = setTimeout(() => this.startDir((i + 1) % GT_DTABS.length), GT_DDUR[i]);
}
}
pickDir(i) {
this.dauto = false;
this.startDir(i);
}
startTab(i) {
clearInterval(this.ti);
clearTimeout(this.tt);
clearInterval(this.ei);
clearInterval(this.bi);
if (i === 3) {
this.dbauto = true;
this.setState({ dblk: 0 });
if (!this.reduce) {
this.bi = setInterval(() => {
if (!this.dbauto) return;
var b = ((this.state && this.state.dblk) || 0) + 1;
if (b > 3) { clearInterval(this.bi); return; }
this.setState({ dblk: b });
}, 2700);
}
}
if (i === 4) {
this.setState({ hclk: this.reduce ? 999 : 0 });
if (!this.reduce) {
this.ei = setInterval(() => {
var t = ((this.state && this.state.hclk) || 0) + 1;
if (t > 140) { clearInterval(this.ei); return; }
this.setState({ hclk: t });
}, 100);
}
}
this.setState({ tab: i, typed: this.reduce ? GT_PROMPT.length : 0 });
if (i === 0 && !this.reduce) {
this.ti = setInterval(() => {
var s = (this.state && this.state.typed) || 0;
if (s >= GT_PROMPT.length) { clearInterval(this.ti); return; }
this.setState({ typed: Math.min(GT_PROMPT.length, s + 2) });
}, 30);
}
if (this.auto && !this.reduce) {
this.tt = setTimeout(() => this.startTab((i + 1) % GT_TABS.length), GT_DUR[i]);
}
}
pickTab(i) {
this.auto = false;
this.startTab(i);
}
renderVals() {
var st = this.state || {};
var tab = st.tab || 0;
var typed = st.typed == null ? 0 : st.typed;
var done = typed >= GT_PROMPT.length;
var si = function (on) { return on ? 'lat-it lat-on' : 'lat-it'; };
var ht = st.htyped == null ? 0 : st.htyped;
var dblk = st.dblk || 0;
var eut = st.eutab == null ? 2 : st.eutab;
var eus = [0, 1, 2, 3, 4].map((i) => ({ cls: i === eut ? 'eut eut-on' : 'eut', sel: i === eut ? 'true' : 'false', pick: () => { this.euauto = false; this.setState({ eutab: i }); } }));
var dbts = GT_DBT.map((label, i) => ({ label: label, cls: i === dblk ? 'seg seg-on' : 'seg', sel: i === dblk ? 'true' : 'false', pick: () => { this.dbauto = false; this.auto = false; clearTimeout(this.tt); this.setState({ dblk: i }); } }));
var dtab = st.dtab || 0;
var dtyped = st.dtyped == null ? 0 : st.dtyped;
var ddone = dtyped >= GT_DQ.length;
return {
dtabs: GT_DTABS.map((label, i) => ({
label: label,
cls: i === dtab ? 'tab tab-on' : 'tab',
sel: i === dtab ? 'true' : 'false',
pick: () => this.pickDir(i)
})),
d0: dtab === 0, d1: dtab === 1, d2: dtab === 2,
durl: 'govtalent.app/' + GT_DURLS[dtab],
dTyped: GT_DQ.slice(0, dtyped),
dDone: ddone,
dTyping: !ddone,
dbt0: dbts[0], dbt1: dbts[1], dbt2: dbts[2], dbt3: dbts[3], dbtabs: dbts,
eut0: eus[0], eut1: eus[1], eut2: eus[2], eut3: eus[3], eut4: eus[4],
eu0: eut === 0, eu1: eut === 1, eu2: eut === 2, eu3: eut === 3, eu4: eut === 4,
b0: dblk === 0, b1: dblk === 1, b2: dblk === 2, b3: dblk === 3,
dbrows: gtDbRows(dblk), dbm: gtDbRows(dblk).slice(0, 3), hcF: gtCt(st.hclk == null ? 0 : st.hclk).filas.slice(0, 4), dcF: gtCt(st.dclk == null ? 0 : st.dclk).filas.slice(0, 4), dbNivel: GT_DBN[dblk], dbEntidad: GT_DBE[dblk],
hc: gtCt(st.hclk == null ? 0 : st.hclk), dc: gtCt(st.dclk == null ? 0 : st.dclk),
tabs: GT_TABS.map((label, i) => ({
label: label,
cls: i === tab ? 'tab tab-on' : 'tab',
sel: i === tab ? 'true' : 'false',
pick: () => this.pickTab(i)
})),
t0: tab === 0, t1: tab === 1, t2: tab === 2, t3: tab === 3, t4: tab === 4,
url: 'govtalent.app/' + GT_URLS[tab],
typedText: GT_PROMPT.slice(0, typed),
typingDone: done,
typing: !done,
side: {
asistente: si(tab === 0),
novedades: si(tab === 1),
alarmas: si(tab === 2),
bd: si(tab === 3),
contactos: si(tab === 4)
}
};
}
}

/* ---------- pintado de la plantilla ---------- */
const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
const ONLY_HOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;

function lookup(expr, scope) {
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  let v = scope;
  for (const k of expr.split('.')) {
    if (v == null) return undefined;
    v = v[k];
  }
  return v;
}
function value(str, scope) {
  if (typeof str !== 'string' || str.indexOf('{{') < 0) return str;
  const m = str.match(ONLY_HOLE);
  if (m) return lookup(m[1], scope);
  return str.replace(HOLE, (_, e) => {
    const v = lookup(e, scope);
    return v == null ? '' : String(v);
  });
}
function renderKids(kids, scope) {
  return kids.map((k, i) => renderNode(k, scope, i));
}
function renderNode(node, scope, key) {
  if (typeof node === 'string') {
    const v = value(node, scope);
    return v == null || v === false || v === true ? null : String(v);
  }
  const [tag, attrs, kids] = node;
  if (tag === 'sc-if') {
    return value(attrs.value, scope) ? createElement(Fragment, { key }, ...renderKids(kids, scope)) : null;
  }
  if (tag === 'sc-for') {
    const list = value(attrs.list, scope) || [];
    const as = attrs.as;
    return createElement(
      Fragment,
      { key },
      ...list.map((item, i) => createElement(Fragment, { key: i }, ...renderKids(kids, { ...scope, [as]: item })))
    );
  }
  const props = { key };
  for (const name in attrs) {
    const v = attrs[name];
    if (name === 'style') {
      const st = {};
      for (const p in v) st[p] = value(v[p], scope);
      props.style = st;
    } else if (name === 'className') {
      // Mismo prefijo que landing.css (l-), para no chocar con globals.css.
      const c = value(v, scope);
      props.className = c ? String(c).split(/\s+/).filter(Boolean).map((k) => 'l-' + k).join(' ') : undefined;
    } else {
      props[name] = value(v, scope);
    }
  }
  return createElement(tag, props, ...(kids.length ? renderKids(kids, scope) : []));
}

export default function LandingClient() {
  const [, force] = useReducer((x) => x + 1, 0);
  const ref = useRef(null);
  if (!ref.current) ref.current = new Component(() => force());
  useEffect(() => {
    const c = ref.current;
    c.componentDidMount();
    return () => c.componentWillUnmount();
  }, []);
  // Móvil y tableta: las maquetas de la plataforma se ven como en el
  // ordenador, reducidas al ancho disponible (no se recolocan).
  useEffect(() => {
    const fit = () => {
      document.querySelectorAll('.gtl [data-fit]').forEach((el) => {
        if (window.innerWidth > 900) {
          el.style.width = '';
          el.style.zoom = '';
          return;
        }
        const base = Number(el.dataset.fit);
        const pa = el.parentElement;
        const cs = getComputedStyle(pa);
        const disponible = pa.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        el.style.boxSizing = 'border-box';
        el.style.width = base + 'px';
        el.style.zoom = String(Math.min(1, disponible / base));
      });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const vals = ref.current.renderVals();
  return createElement('div', { className: 'gtl' }, ...TPL.map((n, i) => renderNode(n, vals, i)));
}
