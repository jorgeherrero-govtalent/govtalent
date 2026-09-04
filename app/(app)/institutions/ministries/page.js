'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';
import UpgradeModal from '@/components/UpgradeModal';
import usePlanPro from '@/lib/usePlanPro';

// Deriva un "tipo de cargo" a partir del texto libre del cargo, para poder
// filtrar sin depender de una lista cerrada mantenida a mano.
const PAGE_SIZES = [20, 50, 100, 200];

// La misma proporción que la tabla de personas de la Comisión Europea.
// El contacto ocupa columna propia: se enseña entero, no como icono.
const GRID_PERSONAS = '1.7fr 1fr 1.2fr 1.4fr';

const VERDE = '#1d6f5c';
const MORADO = '#6d5aef';

// La misma foto que en la Comisión Europea: cae a las iniciales si no
// hay imagen o si falla al cargar.
function Photo({ url, name, size = 56, radius = 10 }) {
  const [failed, setFailed] = useState(false);
  const base = { width: size, height: size, borderRadius: radius, flexShrink: 0, objectFit: 'cover', background: '#ece9e2' };

  if (!url || failed) {
    return (
      <div
        style={{
          ...base,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8d8b83',
          fontSize: Math.round(size * 0.3),
          fontWeight: 700,
        }}
        aria-hidden="true"
      >
        {initials(name)}
      </div>
    );
  }
  return <img src={url} alt="" width={size} height={size} style={base} onError={() => setFailed(true)} />;
}

// La misma bandera que en la portada del directorio institucional.
function FlagES() {
  return (
    <span
      role="img"
      aria-label="Bandera de España"
      style={{
        display: 'inline-block',
        width: 20,
        height: 14,
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ display: 'block', height: 3.5, background: '#AA151B' }} />
      <span style={{ display: 'block', height: 6, background: '#F1BF00' }} />
      <span style={{ display: 'block', height: 3.5, background: '#AA151B' }} />
    </span>
  );
}

function roleType(role) {
  const r = role.toLowerCase();
  if (r.startsWith('presidente') || r.startsWith('presidenta') || r.includes('ministro') || r.includes('ministra')) return 'Ministro/a';
  if (r.includes('vicepresident')) return 'Ministro/a';
  if (r.includes('secretari') && r.includes('estado')) return 'Secretario/a de Estado';
  if (r.includes('director') && r.includes('gabinete')) return 'Director/a del Gabinete';
  if (r.includes('secretari') && r.includes('general')) return 'Secretario/a General';
  if (r.includes('subsecretari')) return 'Subsecretario/a';
  if (r.includes('director') && r.includes('general')) return 'Director/a General';
  return 'Otros';
}

// Rango de cada cargo, para ordenar la lista por jerarquía en vez de por
// el orden en que llegan de la base. Antes un director de comunicación
// aparecía antes que el subsecretario.
const ORDEN_CARGO = [
  [/^(vice)?presidente|^(vice)?presidenta|ministr[oa]/i, 0],
  [/secretari[oa] de estado/i, 1],
  [/subsecretari[oa]/i, 2],
  [/secretari[oa] general/i, 3],
  [/director[a]? general/i, 4],
  [/director[a]? del gabinete/i, 5],
  [/director[a]? de comunicaci/i, 6],
  [/subdirector/i, 7],
];

function rangoCargo(role) {
  for (const [re, n] of ORDEN_CARGO) if (re.test(role || '')) return n;
  return 8;
}

/**
 * El cargo exacto de una persona.
 *
 * Muchos cargos son genéricos en el campo role —"Director", "Presidente",
 * "Secretario General"— y solo se entienden con su unidad: Javier Pantoja
 * no es "Director" sino "Director de Parques Nacionales".
 *
 * La unidad sale de age_units cuando el cruce con DIR3 la encontró, y de
 * unit_name cuando no.
 */
// "Director General" también entra: sin él, Miguel Ángel Sanz salía como
// "Director General" a secas en vez de "Director General del Instituto de
// Turismo de España". La lista anterior solo cubría los roles de una
// palabra y se dejaba fuera justo los más frecuentes.
const ROL_GENERICO = /^(director[a]?|director[a]? general|subdirector[a]? general|presidente|presidenta|vicepresidente|vicepresidenta|gerente|secretari[oa]|secretari[oa] general|subsecretari[oa]|secretari[oa] de estado|interventor[a]? general|delegad[oa] del gobierno|jefe|jefa|abogad[oa] general del estado|fiscal general del estado)$/i;

function cargoExacto(o) {
  const role = (o.role || '').trim();
  const unidad = o.age_units?.nombre || o.unit_name || '';
  if (!unidad || unidad === o.ministry_name) return role;
  if (!ROL_GENERICO.test(role)) return role;

  // Se quita el prefijo del órgano para no repetirlo: "Director" +
  // "Dirección General de Tráfico" da "Director General de Tráfico", no
  // "Director de Dirección General de Tráfico".
  const limpio = unidad
    .replace(/^(Dirección General|D\.G\.|Subdirección General|S\.G\.|Secretaría General|S\.Gral\.|Secretaría de Estado|S\. de E\.|Subsecretaría|Organismo Autónomo)\s*(de\s+|del\s+|de la\s+|)/i, '')
    .replace(/,?\s*O\.\s?A\.\s*$/i, '')
    .trim();
  return `${role} de ${limpio}`;
}

function initials(fullName) {
  const parts = fullName.trim().split(' ');
  return `${parts[0]?.[0] || ''}${parts[parts.length - 1]?.[0] || ''}`.toUpperCase();
}

// "Del Canto Soriano, Lydia" -> "Lydia Del Canto Soriano"
function nameDisplay(officialName) {
  const [last, first] = officialName.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}

// Sin tildes, en minúsculas y con los espacios colapsados: para comparar
// nombres de persona entre las dos tablas sin depender de la puntuación.
function normalizePerson(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Quita "Ministerio de/del/de la/de los/de las/para la/para el", tildes y
// mayúsculas, para poder comparar "Sanidad" (como lo guarda
// government_members) con "Ministerio de Sanidad" (como lo guarda
// government_officials) sin que el texto tenga que ser idéntico letra a letra.
function normalizeMinistry(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^ministerio\s+(de\s+la\s+|de\s+los\s+|de\s+las\s+|de\s+|del\s+|para\s+la\s+|para\s+el\s+)?/, '')
    .trim();
}

// Las dos fuentes no siempre nombran igual la misma cartera: La Moncloa añade
// coletillas ("... y portavoz del Gobierno") que la Agenda de la Comunicación
// no lleva. Comparamos por prefijo en ambos sentidos para absorber esas
// diferencias sin mantener una tabla de equivalencias a mano.
function ministryMatches(a, b) {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

// Cargos que corresponden al propio miembro del Gobierno que encabeza la
// tarjeta: no deben repetirse dentro de su propio equipo. Exige "del Gobierno"
// para no arrastrar a presidentes de organismos adscritos.
const TOP_ROLE = /^(ministro|ministra|vicepresident|president[ea] del gobierno)/;

// Los 3 vicepresidentes llevan también una cartera ministerial propia — su
// equipo real está repartido en DOS secciones distintas de la fuente
// (su Vicepresidencia y su Ministerio), así que hay que juntar ambas.
function teamFor(member, officials, vicepresidenteOrdinal) {
  const sections = [];
  if (member.rank === 'presidente') sections.push('presidencia del gobierno');
  if (member.rank === 'vicepresidente' && vicepresidenteOrdinal) {
    sections.push(`vicepresidencia ${vicepresidenteOrdinal} del gobierno`);
  }
  if (member.ministry_name) sections.push(normalizeMinistry(member.ministry_name));

  const memberKey = normalizePerson(member.full_name);

  const equipo = officials.filter((o) => {
    const key = normalizeMinistry(o.ministry_name);
    if (!sections.some((s) => ministryMatches(s, key))) return false;

    // El propio ministro viene también como registro de government_officials
    // (la Agenda lo incluye en el listado de su ministerio). Se descarta para
    // que no aparezca dos veces dentro del equipo.
    if (normalizePerson(nameDisplay(o.full_name)) === memberKey) return false;
    if (TOP_ROLE.test(normalizePerson(o.role))) return false;

    return true;
  });

  // Sin repetidos: quien dirige el gabinete de una vicepresidencia figura
  // dos veces en la Agenda, una por la vicepresidencia y otra por el
  // ministerio. Las dos secciones coinciden aquí y salía duplicado.
  const vistos = new Set();
  const unicos = equipo.filter((o) => {
    const k = `${normalizePerson(o.full_name)}|${normalizePerson(o.role)}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  // Por jerarquía y, a igualdad, por apellido. Antes salían en el orden
  // en que llegaban de la base: un director de comunicación aparecía
  // antes que el subsecretario.
  return unicos.sort((a, b) => {
    const d = rangoCargo(a.role) - rangoCargo(b.role);
    return d !== 0 ? d : (a.full_name || '').localeCompare(b.full_name || '');
  });
}

/**
 * La caja de búsqueda de las barras de filtro.
 *
 * Estaba escrita a mano dentro de Buscar. Al aparecer también en
 * Organigrama y en Ministerios eran tres copias del mismo bloque de
 * estilos, así que se saca aquí: el ancho es lo único que cambia entre
 * las tres.
 */
function Buscador({ value, onChange, placeholder, ancho = '1 1 220px' }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#fff',
        border: '.5px solid #e0dfd8',
        borderRadius: 20,
        padding: '7px 14px',
        flex: ancho,
      }}
    >
      <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
      />
    </div>
  );
}

// Las etiquetas de los filtros aplicados, con su enlace para limpiarlos.
// Mismo bloque que ya usaba Buscar.
function ChipsFiltros({ grupos, onLimpiar }) {
  const todos = grupos.flat();
  if (todos.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      {todos.map((v) => (
        <span key={v} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
          {v}
        </span>
      ))}
      <span onClick={onLimpiar} style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}>
        Limpiar filtros
      </span>
    </div>
  );
}

// Coincidencia de texto sobre nombre y cargo a la vez: se busca "Escrivá"
// igual que "secretaría de estado", y quien busca no distingue entre las
// dos cosas.
function coincideTexto(nombre, cargo, q) {
  if (!q) return true;
  return `${nombre || ''} ${cargo || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes(q);
}

function normalizarConsulta(q) {
  return (q || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Una fila del organigrama: el titular arriba y su equipo desplegable.
 *
 * El equipo llega ya filtrado desde OrganigramaTab en vez de calcularse
 * aquí. Tiene que ser así porque la pestaña necesita saber cuántos
 * quedan tras el filtro para decidir si la fila se muestra siquiera, y
 * si el cálculo viviera dentro no habría forma de preguntárselo.
 *//**
 * Una tarjeta del organigrama, calcada de las de comisarios.
 *
 * Es un <Link> entero, como allí: una sola acción, un solo destino. El
 * equipo desplegable que tenía se retiró; el equipo de cada ministerio
 * está en su ficha y en la pestaña Personas.
 */
function TarjetaCargo({ member }) {
  return (
    <Link
      href={`/institutions/ministries/${member.slug}`}
      className="card"
      style={{
        padding: 14,
        textDecoration: 'none',
        color: 'inherit',
        // Columna con el enlace al fondo: sin esto, las tarjetas de una
        // misma fila estiran a la más alta pero su "Ver su ficha" queda
        // a distinta altura en cada una, que es lo que se veía
        // descuadrado.
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1 }}>
        <Photo url={member.photo_url} name={member.full_name} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{nameDisplay(member.full_name)}</div>
          <div style={{ fontSize: 10.5, color: '#999', marginTop: 2 }}>{member.role}</div>
          {member.ministry_name && (
            <div style={{ fontSize: 11.5, color: '#666', marginTop: 6, lineHeight: 1.45 }}>{member.ministry_name}</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: MORADO, marginTop: 11 }}>Ver su ficha →</div>
    </Link>
  );
}

/**
 * Un bloque del organigrama: título con filete y rejilla de tarjetas.
 * Mismas medidas que el Bloque de comisarios.
 */
function BloqueCargos({ titulo, lista }) {
  if (lista.length === 0) return null;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.3px' }}>
          {titulo}
        </span>
        <div style={{ flex: 1, height: '.5px', background: '#e0dfd8' }}></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
        {lista.map((b) => (
          <TarjetaCargo key={b.m.slug} member={b.m} />
        ))}
      </div>
    </div>
  );
}

function OrganigramaTab({ members, officials }) {
  const esPro = usePlanPro();
  const [upsell, setUpsell] = useState(null);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState(new Set());
  const [ministerioFilter, setMinisterioFilter] = useState(new Set());

  const ordinalWords = ['primera', 'segunda', 'tercera'];

  // El organigrama en forma de lista plana, con la sección y el ordinal
  // de vicepresidencia ya resueltos. teamFor los necesita, y calcularlos
  // en el render obligaba a recorrer members tres veces.
  const bloques = useMemo(() => {
    const out = [];
    for (const m of members.filter((x) => x.rank === 'presidente')) {
      out.push({ m, seccion: 'presidencia', ordinal: null });
    }
    members
      .filter((x) => x.rank === 'vicepresidente')
      .forEach((m, i) => out.push({ m, seccion: 'presidencia', ordinal: ordinalWords[i] }));
    for (const m of members.filter((x) => x.rank === 'ministro')) {
      out.push({ m, seccion: 'ministerios', ordinal: null });
    }
    return out;
  }, [members]);

  const etiquetaBloque = (b) => b.m.ministry_name || b.m.role;

  // MultiSelectFilter espera objetos { value, label } y hace
  // v.label.toLowerCase() al abrir el desplegable. Con cadenas sueltas,
  // `label` es undefined y la página entera revienta al pulsar. Es el
  // mismo formato que ya usaban los filtros de Organismos y de Leyes.
  const ministerioOptions = useMemo(
    () =>
      [...new Set(bloques.map(etiquetaBloque).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v })),
    [bloques]
  );

  // Los tipos que salen de verdad en el organigrama, no la lista teórica:
  // ofrecer "Subdirector/a" cuando no hay ninguno da un filtro que solo
  // sirve para vaciar la pantalla.
  const tipoOptions = useMemo(() => {
    const vistos = new Set();
    for (const b of bloques) {
      vistos.add(roleType(b.m.role || ''));
      for (const o of teamFor(b.m, officials, b.ordinal)) vistos.add(roleType(o.role || ''));
    }
    return [...vistos].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  }, [bloques, officials]);

  const q = normalizarConsulta(search);
  const hayFiltro = q !== '' || tipoFilter.size > 0 || ministerioFilter.size > 0;

  const visibles = useMemo(() => {
    return bloques
      .map((b) => {
        if (ministerioFilter.size > 0 && !ministerioFilter.has(etiquetaBloque(b))) return null;

        const equipo = teamFor(b.m, officials, b.ordinal).filter(
          (o) =>
            (tipoFilter.size === 0 || tipoFilter.has(roleType(o.role || ''))) &&
            coincideTexto(nameDisplay(o.full_name), cargoExacto(o), q)
        );

        // El titular cuenta como coincidencia propia: filtrando por
        // "Ministro/a" el equipo queda vacío —teamFor excluye al titular
        // justamente para no duplicarlo— y sin esto desaparecerían los
        // veinticuatro ministerios de golpe.
        const titularCoincide =
          (tipoFilter.size === 0 || tipoFilter.has(roleType(b.m.role || ''))) &&
          coincideTexto(b.m.full_name, b.m.role, q);

        if (hayFiltro && equipo.length === 0 && !titularCoincide) return null;
        return { ...b, equipo };
      })
      .filter(Boolean);
  }, [bloques, officials, q, tipoFilter, ministerioFilter, hayFiltro]);

  // Tres bloques y no dos, como en comisarios: la presidencia va sola y
  // las vicepresidencias aparte. Juntas, el presidente quedaba como una
  // tarjeta más entre cuatro.
  const presidenciaSola = visibles.filter((b) => b.m.rank === 'presidente');
  const vices = visibles.filter((b) => b.m.rank === 'vicepresidente');
  const ministerios = visibles.filter((b) => b.seccion === 'ministerios');

  function limpiar() {
    setSearch('');
    setTipoFilter(new Set());
    setMinisterioFilter(new Set());
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Buscador
          value={search}
          onChange={setSearch}
          placeholder="Buscar persona o cargo en el organigrama..."
        />
        <MultiSelectFilter
          label="Ministerio"
          values={ministerioOptions}
          selected={ministerioFilter}
          onApply={setMinisterioFilter}
          bloqueado={esPro === false}
          onBloqueado={() =>
            setUpsell({
              title: 'Filtrar por ministerio',
              message: 'Quédate con el organigrama de los ministerios que te tocan. Disponible en el plan Pro.',
            })
          }
        />
        <MultiSelectFilter
          label="Tipo de cargo"
          values={tipoOptions}
          selected={tipoFilter}
          onApply={setTipoFilter}
          bloqueado={esPro === false}
          onBloqueado={() =>
            setUpsell({
              title: 'Filtrar por tipo de cargo',
              message:
                'Separa a los secretarios de Estado de los directores generales y del resto del organigrama. Disponible en el plan Pro.',
            })
          }
        />
      </div>

      <ChipsFiltros grupos={[[...ministerioFilter], [...tipoFilter]]} onLimpiar={limpiar} />

      {visibles.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hay nadie con estos filtros.
          </div>
        </div>
      ) : (
        <>
          <BloqueCargos titulo="Presidencia" lista={presidenciaSola} />
          <BloqueCargos titulo="Vicepresidencias" lista={vices} />
          <BloqueCargos titulo="Ministerios" lista={ministerios} />
        </>
      )}
      {upsell && (
        <UpgradeModal title={upsell.title} message={upsell.message} onClose={() => setUpsell(null)} />
      )}
    </>
  );
}

/**
 * Una celda de la tabla de personas que puede estar bloqueada.
 *
 * Misma pieza que en la Comisión Europea. Con plan enseña el valor; sin
 * él, texto de relleno difuminado que se puede pulsar.
 *
 * El relleno es inventado a propósito: difuminar el valor real con CSS
 * no lo oculta, solo lo despeina, y aquí hay correos y teléfonos de
 * unidades de la Administración.
 *
 * Mientras esPro es null no se pinta nada en el hueco. Son unas
 * décimas, y evita que a un usuario Pro le parpadee un candado.
 */
function CeldaContacto({ valor, esPro, onUpsell }) {
  const base = { fontSize: 11.5, color: '#666', minWidth: 0, textAlign: 'center' };

  if (esPro === null) return <div style={base}></div>;
  if (esPro) return <div style={base}>{valor || '—'}</div>;

  // Sin contacto real no hay nada que vender: se deja la raya y no se
  // promete un correo que tampoco aparece pagando.
  if (!valor) return <div style={base}>—</div>;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onUpsell();
      }}
      style={{
        ...base,
        border: 'none',
        background: 'none',
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        filter: 'blur(3.5px)',
        userSelect: 'none',
        width: '100%',
      }}
      aria-label="Ver el contacto con el plan Pro"
    >
      buzon.unidad@ministerio.gob.es
    </button>
  );
}

function BuscarTab({ members, officials }) {
  const esPro = usePlanPro();
  // Objeto y no booleano: esta pestaña tiene dos motivos de venta —el
  // filtro de tipo de cargo y el contacto— y cada uno dice lo suyo.
  const [upsell, setUpsell] = useState(null);
  const [search, setSearch] = useState('');
  const [ministryFilter, setMinistryFilter] = useState(new Set());
  const [typeFilter, setTypeFilter] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // El tamaño de página se comparte con el resto de directorios: quien
  // lo pone en 100 en eurodiputados lo encuentra igual aquí.
  useEffect(() => {
    const saved = parseInt(window.localStorage.getItem('gt_page_size') || '20', 10);
    if (PAGE_SIZES.includes(saved)) setPageSize(saved);
  }, []);

  function changePageSize(n) {
    setPageSize(n);
    setPage(1); // sin esto, estar en la página 12 con 20 filas y saltar a 200 deja la tabla vacía
    try {
      window.localStorage.setItem('gt_page_size', String(n));
    } catch {}
  }

  // Unimos ministros + resto del equipo en una sola lista para poder buscar
  // a cualquiera, sin importar su nivel.
  const allPeople = useMemo(() => {
    const fromMembers = members.map((m) => ({
      full_name_display: m.full_name,
      role: m.role,
      ministry_name: m.ministry_name || m.role,
      unit_name: null,
      slug: m.slug,
      isMember: true,
    }));
    const memberKeys = new Set(members.map((m) => normalizePerson(m.full_name)));
    const fromOfficials = officials
      // Los ministros ya entran por government_members: si la Agenda los
      // repite, no deben salir dos veces en el buscador.
      .filter((o) => !memberKeys.has(normalizePerson(nameDisplay(o.full_name))))
      .map((o) => ({
        full_name_display: nameDisplay(o.full_name),
        // El mismo cargo compuesto que en las tarjetas: "Director" a
        // secas no dice nada, y esta lista lo mostraba tal cual.
        role: cargoExacto(o),
        ministry_name: o.ministry_name,
        unit_name: (o.age_units?.nombre || o.unit_name) !== o.ministry_name
          ? (o.age_units?.nombre || o.unit_name)
          : null,
        slug: o.slug,
        isMember: false,
      }));
    return [...fromMembers, ...fromOfficials];
  }, [members, officials]);

  const ministryOptions = useMemo(() => {
    const unique = [...new Set(allPeople.map((p) => p.ministry_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return unique.map((m) => ({ value: m, label: m }));
  }, [allPeople]);

  const typeOptions = useMemo(() => {
    const unique = [...new Set(allPeople.map((p) => roleType(p.role)))];
    const order = ['Ministro/a', 'Secretario/a de Estado', 'Director/a del Gabinete', 'Secretario/a General', 'Subsecretario/a', 'Director/a General', 'Otros'];
    return order.filter((t) => unique.includes(t)).map((t) => ({ value: t, label: t }));
  }, [allPeople]);

  const filtered = useMemo(() => {
    let list = allPeople;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.full_name_display.toLowerCase().includes(q) || p.role.toLowerCase().includes(q));
    }
    if (ministryFilter.size > 0) list = list.filter((p) => ministryFilter.has(p.ministry_name));
    if (typeFilter.size > 0) list = list.filter((p) => typeFilter.has(roleType(p.role)));

    // Por ministerio y, dentro de cada uno, por jerarquía: ministro,
    // secretarios de Estado, subsecretario, secretarías generales,
    // direcciones generales. Antes salían en el orden en que llegaban de
    // la base, que era arbitrario.
    return [...list].sort((a, b) => {
      const m = (a.ministry_name || '').localeCompare(b.ministry_name || '');
      if (m !== 0) return m;
      const r = rangoCargo(a.role) - rangoCargo(b.role);
      return r !== 0 ? r : (a.full_name_display || '').localeCompare(b.full_name_display || '');
    });
  }, [allPeople, search, ministryFilter, typeFilter]);

  // Al filtrar o buscar, volver a la primera página: si no, filtrar
  // estando en la 8 deja la tabla vacía sin explicación.
  useEffect(() => {
    setPage(1);
  }, [search, ministryFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);
  const from = filtered.length === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, filtered.length);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, '…', totalPages];
    if (current >= totalPages - 2) return [1, '…', totalPages - 2, totalPages - 1, totalPages];
    return [1, '…', current, '…', totalPages];
  }, [current, totalPages]);


  function clearFilters() {
    setSearch('');
    setMinistryFilter(new Set());
    setTypeFilter(new Set());
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Buscador value={search} onChange={setSearch} placeholder="Buscar por nombre o cargo..." />
        <MultiSelectFilter label="Ministerio" values={ministryOptions} selected={ministryFilter} onApply={setMinistryFilter} />
        {/* Solo Tipo de cargo. Ministerio se queda libre: es el eje por
            el que la gente se orienta —"enséñame Hacienda"— y sin él la
            tabla de 278 personas no se puede reducir por ningún sitio. */}
        <MultiSelectFilter
          label="Tipo de cargo"
          values={typeOptions}
          selected={typeFilter}
          onApply={setTypeFilter}
          bloqueado={esPro === false}
          onBloqueado={() =>
            setUpsell({
              title: 'Filtrar por tipo de cargo',
              message:
                'Separa a los secretarios de Estado de los directores generales y del resto del organigrama. Disponible en el plan Pro.',
            })
          }
        />
      </div>

      <ChipsFiltros grupos={[[...ministryFilter], [...typeFilter]]} onLimpiar={clearFilters} />

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hay nadie con estos filtros.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Cuatro columnas sin filetes intermedios, avatar con
              iniciales y contacto a la derecha: la misma tabla que la de
              personas de la Comisión Europea. Antes tenía separadores
              verticales de medio píxel entre columnas, que no usa
              ninguna otra tabla de la aplicación. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID_PERSONAS,
              padding: '10px 14px',
              borderBottom: '.5px solid #f0f0eb',
              fontSize: 10.5,
              fontWeight: 700,
              color: '#999',
              textTransform: 'uppercase',
            }}
          >
            <div>Persona</div>
            <div>Cargo</div>
            <div>Ministerio</div>
            <div style={{ textAlign: 'center' }}>Contacto</div>
          </div>

          {slice.map((p) => (
            <Link
              key={p.slug}
              href={p.isMember ? `/institutions/ministries/${p.slug}` : `/institutions/ministries/persona/${p.slug}`}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID_PERSONAS,
                padding: '11px 14px',
                borderBottom: '.5px solid #f0f0eb',
                alignItems: 'center',
                gap: 8,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: '#ece9e2',
                    color: '#8d8b83',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  {initials(p.full_name_display)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.full_name_display}</div>
                  {p.unit_name && <div style={{ fontSize: 10.5, color: '#999' }}>{p.unit_name}</div>}
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#666', minWidth: 0 }}>{p.role}</div>
              <div style={{ fontSize: 11.5, color: '#888', minWidth: 0 }}>{p.ministry_name}</div>

              <CeldaContacto
                valor={p.unit_email || p.unit_phone}
                esPro={esPro}
                onUpsell={() =>
                  setUpsell({
                    title: 'El contacto de la unidad',
                    message:
                      'El correo y el teléfono de la unidad que dirige cada persona, para escribir al sitio correcto a la primera. Disponible en el plan Pro.',
                  })
                }
              />
            </Link>
          ))}

          {/* Mismo patrón que en eurodiputados: con 239 personas y sin
              paginar, la lista era una tirada interminable. */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '11px 14px',
              background: '#fcfbf8',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 11.5, color: '#888' }}>Filas</span>
              <div style={{ display: 'flex', gap: 2, background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 7, padding: 2 }}>
                {PAGE_SIZES.map((n) => (
                  <span
                    key={n}
                    onClick={() => changePageSize(n)}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 5,
                      cursor: 'pointer',
                      background: pageSize === n ? '#1d6f5c' : 'transparent',
                      color: pageSize === n ? '#fff' : '#666',
                    }}
                  >
                    {n}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 11.5, color: '#888' }}>
                {from}–{to} de {filtered.length}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                onClick={() => setPage(Math.max(1, current - 1))}
                style={{ border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: current === 1 ? '#ccc' : '#555' }}
              >
                <i className="ti ti-chevron-left" style={{ fontSize: 13 }}></i>
              </span>
              {pageNumbers.map((n, i) =>
                n === '…' ? (
                  <span key={`e${i}`} style={{ fontSize: 11.5, color: '#aaa', padding: '0 3px' }}>…</span>
                ) : (
                  <span
                    key={n}
                    onClick={() => setPage(n)}
                    style={{
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      background: n === current ? '#1d6f5c' : 'transparent',
                      color: n === current ? '#fff' : '#555',
                      border: n === current ? 'none' : '.5px solid #e0dfd8',
                    }}
                  >
                    {n}
                  </span>
                )
              )}
              <span
                onClick={() => setPage(Math.min(totalPages, current + 1))}
                style={{ border: '.5px solid #e0dfd8', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: current === totalPages ? '#ccc' : '#555' }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: 13 }}></i>
              </span>
            </div>
          </div>
        </div>
      )}
      {upsell && (
        <UpgradeModal title={upsell.title} message={upsell.message} onClose={() => setUpsell(null)} />
      )}
    </>
  );
}

/**
 * Los ministerios como cuadrícula.
 *
 * El organigrama es bueno para ver la estructura del Gobierno, pero
 * malo para ir a un ministerio concreto: hay que desplegar y buscar. Las
 * tarjetas dan el acceso directo, con el titular y el tamaño de su
 * equipo.
 */
// Las iniciales de las palabras con carga: "Ministerio de Asuntos
// Exteriores, Unión Europea y Cooperación" → "AEUEC". Hace de sigla en el
// cuadrado, como el código de las direcciones generales europeas.
const VACIAS = new Set(['ministerio', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'para', 'a']);

function siglasMinisterio(nombre) {
  const palabras = (nombre || '')
    .replace(/[,.]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !VACIAS.has(w.toLowerCase()));

  const sigla = palabras.map((w) => w[0]).join('').toUpperCase();
  // Con una sola palabra la sigla queda en una letra —"S" para Sanidad,
  // "I" para Interior— y el cuadrado se ve vacío. En ese caso, las tres
  // primeras letras.
  if (sigla.length < 2 && palabras[0]) return palabras[0].slice(0, 3).toUpperCase();
  return sigla.slice(0, 5);
}

// Los organigramas se guardan con slug propio (organigrama_fuentes.slug) para
// no tener que casar el nombre del ministerio por texto, que es justo lo que
// falla cuando una fuente escribe "Ministerio de Presidencia" y otra
// "Ministerio de la Presidencia".
function organigramaDe(ministryName, organigramas) {
  const key = normalizeMinistry(ministryName);
  return organigramas.find((o) => ministryMatches(key, normalizeMinistry(o.ministerio))) || null;
}

function MinisteriosTab({ members, officials, organigramas }) {
  const [search, setSearch] = useState('');
  const [orden, setOrden] = useState('alfabetico');

  const todos = useMemo(() => {
    return members
      .filter((m) => m.ministry_name && m.rank !== 'presidente')
      .map((m) => {
        const key = normalizeMinistry(m.ministry_name);
        const equipo = officials.filter(
          (o) =>
            ministryMatches(key, normalizeMinistry(o.ministry_name)) &&
            normalizePerson(nameDisplay(o.full_name)) !== normalizePerson(m.full_name)
        );
        return { ...m, equipo: equipo.length, org: organigramaDe(m.ministry_name, organigramas) };
      });
  }, [members, officials, organigramas]);

  // Se busca por cartera y por titular a la vez: quien se acuerda del
  // nombre del ministro pero no del nombre exacto de la cartera —que son
  // largos y cambian cada legislatura— también encuentra la tarjeta.
  const ministerios = useMemo(() => {
    const q = normalizarConsulta(search);
    const lista = todos.filter((m) => coincideTexto(m.ministry_name, m.full_name, q));
    return [...lista].sort((a, b) =>
      orden === 'equipo'
        ? b.equipo - a.equipo || (a.ministry_name || '').localeCompare(b.ministry_name || '')
        : (a.ministry_name || '').localeCompare(b.ministry_name || '')
    );
  }, [todos, search, orden]);

  const ORDENES = [
    { id: 'alfabetico', label: 'A–Z' },
    { id: 'equipo', label: 'Equipo más grande' },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Buscador value={search} onChange={setSearch} placeholder="Buscar ministerio o titular..." />
        {/* Pastillas y no un desplegable: son dos opciones y con un
            desplegable el criterio activo queda escondido. */}
        <div style={{ display: 'flex', gap: 6 }}>
          {ORDENES.map((o) => {
            const on = orden === o.id;
            return (
              <button
                key={o.id}
                onClick={() => setOrden(o.id)}
                style={{
                  fontSize: 12,
                  fontFamily: 'inherit',
                  padding: '7px 13px',
                  borderRadius: 20,
                  cursor: 'pointer',
                  border: `.5px solid ${on ? '#1d6f5c' : '#e0dfd8'}`,
                  background: on ? '#e8f4f0' : '#fff',
                  color: on ? '#1d6f5c' : '#666',
                  fontWeight: on ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {ministerios.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-building-off"></i>
            No hay ministerios con estos filtros.
          </div>
        </div>
      ) : (
    /* Mismo formato que las direcciones generales de la Comisión Europea:
       siglas en un cuadrado, nombre y equipo al lado, y el titular debajo
       separado por una línea. */
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
      {ministerios.map((m) => (
        /* Con organigrama cargado la tarjeta lleva a la estructura del
           departamento; sin él, se mantiene el destino anterior (la ficha
           del titular) para que las 17 carteras que aún no lo tienen no
           queden sin enlace. */
        <Link
          key={m.slug}
          href={m.org ? `/institutions/ministries/organigrama/${m.org.slug}` : `/institutions/ministries/${m.slug}`}
          className="card"
          style={{ padding: 14, textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: '#EEEDFE',
                color: '#3C3489',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {siglasMinisterio(m.ministry_name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{m.ministry_name}</div>
            </div>
          </div>

          {/* Lo que aporta el organigrama: la estructura del departamento.
              Cuando no está cargado se mantiene el recuento de personas,
              para que la tarjeta no se quede vacía. */}
          <div style={{ fontSize: 10.5, color: '#999', lineHeight: 1.5, minHeight: 30 }}>
            {m.org ? (
              <>
                {m.org.secretarias ? `${m.org.secretarias} ${m.org.secretarias === 1 ? 'secretaría' : 'secretarías'} · ` : ''}
                {m.org.direcciones} {m.org.direcciones === 1 ? 'dirección general' : 'direcciones generales'}
                {m.org.subdirecciones ? ` · ${m.org.subdirecciones} subdirecciones` : ''}
              </>
            ) : (
              <>
                {m.equipo} {m.equipo === 1 ? 'persona' : 'personas'} en el directorio
              </>
            )}
          </div>

          <div
            style={{
              fontSize: 11,
              color: '#666',
              lineHeight: 1.5,
              borderTop: '.5px solid #f0f0eb',
              paddingTop: 9,
              marginTop: 9,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <i className="ti ti-user-star" style={{ fontSize: 12, verticalAlign: -1, color: '#aaa' }}></i>{' '}
              {m.full_name}
            </span>
            {m.org ? (
              <span style={{ color: '#1d6f5c', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <i className="ti ti-sitemap" style={{ fontSize: 12, verticalAlign: -1 }}></i> Organigrama
              </span>
            ) : null}
          </div>
        </Link>
      ))}
        </div>
      )}
    </>
  );
}

export default function MinistriesDirectoryPage() {
  const supabase = createClient();
  const [members, setMembers] = useState(null);
  const [officials, setOfficials] = useState([]);
  const [organigramas, setOrganigramas] = useState([]);
  const [tab, setTab] = useState('organigrama');

  useEffect(() => {
    Promise.all([
      supabase
        .from('government_members')
        .select('full_name, slug, role, rank, photo_url, ministry_name')
        .eq('active', true)
        .order('order_index', { ascending: true }),
      supabase
        .from('government_officials')
        .select('full_name, slug, role, ministry_name, unit_name, dir3_code, unit_email, unit_phone, age_units(nombre, categoria, nivel)')
        .eq('active', true),
      // Organigramas oficiales cargados. Se piden las unidades en crudo y se
      // agregan aquí: son unos cientos de filas y sale más barato que una
      // vista agregada por mantener.
      supabase.from('organigrama_fuentes').select('id, ministerio, slug, fecha_documento'),
      supabase.from('organigrama_unidades').select('fuente_id, categoria'),
    ]).then(([membersRes, officialsRes, fuentesRes, unidadesRes]) => {
      setMembers(membersRes.data || []);
      setOfficials(officialsRes.data || []);

      const conteo = new Map();
      for (const u of unidadesRes.data || []) {
        const c = conteo.get(u.fuente_id) || { secretarias: 0, direcciones: 0, subdirecciones: 0 };
        if (u.categoria === 'secretaria_estado' || u.categoria === 'secretaria_general') c.secretarias += 1;
        else if (u.categoria === 'direccion_general') c.direcciones += 1;
        else if (u.categoria === 'subdireccion_general') c.subdirecciones += 1;
        conteo.set(u.fuente_id, c);
      }

      setOrganigramas(
        (fuentesRes.data || [])
          .filter((f) => f.slug)
          .map((f) => ({
            ...f,
            ...(conteo.get(f.id) || { secretarias: 0, direcciones: 0, subdirecciones: 0 }),
          }))
      );
    });
  }, []);

  // Ministerios distintos entre los miembros del Gobierno. No hay tabla
  // de ministerios: el ministerio es un campo de texto, así que se
  // cuentan los valores únicos.
  const ministeriosDistintos = useMemo(
    () => new Set((members || []).map((m) => m.ministry_name).filter(Boolean)).size || '—',
    [members]
  );

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        {/* Bandera junto al título y recuentos separados por puntos:
            exactamente la cabecera de la Comisión Europea. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
          <FlagES />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ministerios</h1>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {members ? members.length + officials.length : '—'} personas · {members ? members.length : '—'} miembros del
          Gobierno · {ministeriosDistintos} ministerios
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', marginBottom: 14 }}>
        <span
          onClick={() => setTab('organigrama')}
          style={{
            fontSize: 13,
            fontWeight: tab === 'organigrama' ? 600 : 400,
            color: tab === 'organigrama' ? '#1d6f5c' : '#999',
            borderBottom: tab === 'organigrama' ? '2px solid #1d6f5c' : '2px solid transparent',
            paddingBottom: 8,
            cursor: 'pointer',
          }}
        >
          Organigrama
        </span>
        <span
          onClick={() => setTab('ministerios')}
          style={{
            fontSize: 13,
            fontWeight: tab === 'ministerios' ? 600 : 400,
            color: tab === 'ministerios' ? '#1d6f5c' : '#999',
            borderBottom: tab === 'ministerios' ? '2px solid #1d6f5c' : '2px solid transparent',
            paddingBottom: 8,
            cursor: 'pointer',
          }}
        >
          Ministerios
        </span>
        <span
          onClick={() => setTab('buscar')}
          style={{
            fontSize: 13,
            fontWeight: tab === 'buscar' ? 600 : 400,
            color: tab === 'buscar' ? '#1d6f5c' : '#999',
            borderBottom: tab === 'buscar' ? '2px solid #1d6f5c' : '2px solid transparent',
            paddingBottom: 8,
            cursor: 'pointer',
          }}
        >
          Personas
        </span>
      </div>

      {members === null ? (
        <div className="spinner"></div>
      ) : tab === 'organigrama' ? (
        <OrganigramaTab members={members} officials={officials} />
      ) : tab === 'ministerios' ? (
        <MinisteriosTab members={members} officials={officials} organigramas={organigramas} />
      ) : (
        <BuscarTab members={members} officials={officials} />
      )}
    </div>
  );
}
