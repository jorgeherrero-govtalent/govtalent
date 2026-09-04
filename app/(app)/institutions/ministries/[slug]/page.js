'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';

function initials(fullName) {
  const parts = (fullName || '').trim().split(' ');
  return `${parts[0]?.[0] || ''}${parts[parts.length - 1]?.[0] || ''}`.toUpperCase();
}

// "Del Canto Soriano, Lydia" -> "Lydia Del Canto Soriano"
function nameDisplay(officialName) {
  const [last, first] = (officialName || '').split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : officialName;
}

function normalizePerson(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Mismas reglas que el organigrama: government_members guarda "Sanidad" y
// government_officials "Ministerio de Sanidad".
function normalizeMinistry(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^ministerio\s+(de\s+la\s+|de\s+los\s+|de\s+las\s+|de\s+|del\s+|para\s+la\s+|para\s+el\s+)?/, '')
    .trim();
}

// La Moncloa añade coletillas ("... y portavoz del Gobierno") que la Agenda de
// la Comunicación no lleva: se compara por prefijo en ambos sentidos.
function ministryMatches(a, b) {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

// Cargos del propio titular, que no deben repetirse dentro de su equipo.
const TOP_ROLE = /^(ministro|ministra|vicepresident|president[ea] del gobierno)/;

const ORDINALS = ['primera', 'segunda', 'tercera'];


const CARD_LABEL = {
  fontSize: 10.5,
  fontWeight: 700,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
  marginBottom: 14,
};

// Rango de cada cargo, para ordenar el equipo por jerarquía. Duplicado
// del listado a propósito: son dos rutas independientes y compartirlo
// obligaría a un módulo nuevo para veinte líneas.
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

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function rangoCargo(role) {
  for (const [re, n] of ORDEN_CARGO) if (re.test(role || '')) return n;
  return 8;
}

// Los roles genéricos solo se entienden con su unidad: "Director" no
// dice nada, "Director de Parques Nacionales" sí.
const ROL_GENERICO = /^(director[a]?|director[a]? general|subdirector[a]? general|presidente|presidenta|vicepresidente|vicepresidenta|gerente|secretari[oa]|secretari[oa] general|subsecretari[oa]|secretari[oa] de estado|interventor[a]? general|delegad[oa] del gobierno|jefe|jefa)$/i;

function cargoExacto(o) {
  const role = (o.role || '').trim();
  const unidad = o.age_units?.nombre || o.unit_name || '';
  if (!unidad || unidad === o.ministry_name) return role;
  if (!ROL_GENERICO.test(role)) return role;
  const limpio = unidad
    .replace(/^(Dirección General|D\.G\.|Subdirección General|S\.G\.|Secretaría General|S\.Gral\.|Secretaría de Estado|S\. de E\.|Subsecretaría|Organismo Autónomo)\s*(de\s+|del\s+|de la\s+|)/i, '')
    .replace(/,?\s*O\.\s?A\.\s*$/i, '')
    .trim();
  return `${role} de ${limpio}`;
}

// ---------------------------------------------------------------------
// Organigrama del departamento
//
// La estructura sale del organigrama oficial que publica cada ministerio,
// no de DIR3: DIR3 solo recoge 144 subdirecciones en toda la AGE y los
// organigramas ministeriales bajan hasta ese nivel y por debajo.
// ---------------------------------------------------------------------

// Cada leyenda ministerial usa su vocabulario para lo mismo: Sanidad
// escribe "organismo_publico" donde el MTDFP escribe "organismo_autonomo".
const BANDA_ORG = {
  ministerio: 'gobierno',
  secretaria_estado: 'secretaria_estado',
  subsecretaria: 'subsecretaria',
  secretaria_general: 'secretaria_general',
  direccion_general: 'direccion_general',
  subdireccion_general: 'subdireccion_general',
  division: 'division',
  gabinete: 'gabinete',
  organismo_autonomo: 'organismo',
  organismo_publico: 'organismo',
  agencia_estatal: 'organismo',
  entidad_derecho_publico: 'organismo',
  entidad_gestora: 'organismo',
  sociedad_mercantil: 'organismo',
  otro_organismo: 'organismo',
  fondo: 'organismo',
  unidad: 'unidad',
};

const ORDEN_BANDA_ORG = [
  'gobierno',
  'secretaria_estado',
  'subsecretaria',
  'secretaria_general',
  'direccion_general',
  'subdireccion_general',
  'gabinete',
  'division',
  'organismo',
  'unidad',
];

function bandaOrg(categoria) {
  return BANDA_ORG[categoria] || 'unidad';
}

// El arbol se arma en cliente a partir de superior_id, para no depender de
// que exista la vista recursiva en la base.
function construirArbolOrg(unidades) {
  const porId = new Map(unidades.map((u) => [u.id, { ...u, hijos: [] }]));
  const raices = [];
  for (const u of porId.values()) {
    if (u.superior_id && porId.has(u.superior_id)) porId.get(u.superior_id).hijos.push(u);
    else raices.push(u);
  }
  const ordenar = (n) => {
    n.hijos.sort((a, b) => {
      const d = ORDEN_BANDA_ORG.indexOf(bandaOrg(a.categoria)) - ORDEN_BANDA_ORG.indexOf(bandaOrg(b.categoria));
      return d !== 0 ? d : a.nombre.localeCompare(b.nombre, 'es');
    });
    n.hijos.forEach(ordenar);
  };
  raices.forEach(ordenar);
  return raices;
}

function contarDescendientesOrg(nodo) {
  return nodo.hijos.reduce((n, h) => n + 1 + contarDescendientesOrg(h), 0);
}

// Bloque de contencion: un organo superior con sus organos directivos como
// pastillas. Las subdirecciones se resumen en un contador para que el
// bloque no crezca con el numero de hijos.
function BloqueOrg({ nodo }) {
  const directivos = nodo.hijos.filter((h) =>
    ['direccion_general', 'secretaria_general', 'subsecretaria', 'organismo'].includes(bandaOrg(h.categoria))
  );
  const resto = contarDescendientesOrg(nodo) - directivos.length;

  return (
    <div style={{ background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nodo.nombre}</div>
      {nodo.titular ? <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{nodo.titular}</div> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
        {directivos.map((d) => (
          <span
            key={d.id}
            title={d.titular ? `${d.nombre} · ${d.titular}` : d.nombre}
            style={{
              fontSize: 11,
              padding: '5px 9px',
              borderRadius: 7,
              background: d.dependencia === 'funcional' ? '#fff' : '#e8f4f0',
              color: d.dependencia === 'funcional' ? '#777' : '#04342C',
              border: d.dependencia === 'funcional' ? '.5px dashed #cfcdc5' : '.5px solid transparent',
            }}
          >
            {d.nombre}
          </span>
        ))}
        {resto > 0 ? (
          <span style={{ fontSize: 11, padding: '5px 9px', borderRadius: 7, background: '#f6f5f1', color: '#999' }}>
            + {resto} unidades
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Rama del arbol sangrado. Plegada por defecto: con 80 unidades y ocho
// niveles, desplegarlo entero no se lee.
function RamaOrg({ nodo, profundidad, abiertos, alternar }) {
  const tieneHijos = nodo.hijos.length > 0;
  const abierto = abiertos.has(nodo.id);
  const funcional = nodo.dependencia === 'funcional';

  return (
    <div>
      <div
        onClick={tieneHijos ? () => alternar(nodo.id) : undefined}
        style={{ padding: '7px 0 7px 13px', position: 'relative', cursor: tieneHijos ? 'pointer' : 'default' }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: -15,
            top: 16,
            width: 13,
            borderTop: funcional ? '.5px dashed #cfcdc5' : '.5px solid #e0dfd8',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: profundidad <= 1 ? 12.5 : 12, fontWeight: profundidad <= 1 ? 600 : 400 }}>
            {nodo.nombre}
          </span>
          {tieneHijos ? <span style={{ fontSize: 10.5, color: '#bbb' }}>· {nodo.hijos.length}</span> : null}
          {funcional ? <span style={{ fontSize: 10.5, color: '#bbb' }}>· funcional</span> : null}
          {nodo.confianza !== 'alta' ? (
            <span style={{ fontSize: 10.5, color: '#6d5aef' }} title="Lectura pendiente de revisar">
              · sin revisar
            </span>
          ) : null}
        </div>
        {nodo.titular || nodo.telefono ? (
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
            {nodo.titular}
            {nodo.titular && nodo.telefono ? ' · ' : ''}
            {nodo.telefono}
          </div>
        ) : null}
      </div>
      {tieneHijos && abierto ? (
        <div style={{ paddingLeft: 15, borderLeft: '.5px solid #e0dfd8', marginLeft: 4 }}>
          {nodo.hijos.map((h) => (
            <RamaOrg key={h.id} nodo={h} profundidad={profundidad + 1} abiertos={abiertos} alternar={alternar} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function GovernmentMemberProfilePage() {
  const { slug } = useParams();
  const supabase = createClient();

  const [member, setMember] = useState(null);
  const [officials, setOfficials] = useState([]);
  const [boe, setBoe] = useState([]);
  const [vicepresidents, setVicepresidents] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState('trayectoria');
  const [photoFailed, setPhotoFailed] = useState(false);
  const [orgFuente, setOrgFuente] = useState(null);
  const [orgUnidades, setOrgUnidades] = useState([]);
  const [orgAbiertos, setOrgAbiertos] = useState(new Set());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // .limit(1) antes de .maybeSingle(): sin él la consulta falla en
      // silencio si hay más de una fila que encaje.
      const { data } = await supabase
        .from('government_members')
        .select('*')
        .eq('slug', slug)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (!data) {
        setNotFound(true);
        return;
      }
      setMember(data);

      const [{ data: offs }, { data: vps }] = await Promise.all([
        supabase
          .from('government_officials')
          .select('full_name, slug, role, ministry_name, unit_name, dir3_code, age_units(nombre)')
          .eq('active', true),
        // Solo hace falta para los vicepresidentes: su equipo vive en dos
        // secciones distintas de la fuente y hay que saber su ordinal.
        data.rank === 'vicepresidente'
          ? supabase
              .from('government_members')
              .select('slug')
              .eq('active', true)
              .eq('rank', 'vicepresidente')
              .order('order_index', { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

      if (cancelled) return;
      setOfficials(offs || []);
      setVicepresidents(vps || []);

      // Organigrama oficial del departamento. Se cruza por nombre
      // normalizado porque government_members no guarda el codigo DIR3
      // del ministerio; son 22 valores y el cruce es estable.
      if (data.ministry_name) {
        const { data: fuentes } = await supabase
          .from('organigrama_fuentes')
          .select('id, ministerio, fecha_documento, formato, norma_referencia');

        const key = normalizeMinistry(data.ministry_name);
        const fuente = (fuentes || []).find((f) => ministryMatches(key, normalizeMinistry(f.ministerio)));

        if (fuente && !cancelled) {
          setOrgFuente(fuente);
          const { data: unidades } = await supabase
            .from('organigrama_unidades')
            .select('id, nombre, categoria, nivel, superior_id, titular, telefono, dependencia, confianza')
            .eq('fuente_id', fuente.id);
          if (!cancelled) setOrgUnidades(unidades || []);
        }
      }

      // Lo que publica el ministerio en el BOE. government_members no
      // guarda el código DIR3, así que se busca su unidad raíz por
      // nombre: es exacto porque el ministerio es una de las 26 raíces.
      if (data.ministry_name) {
        const { data: raiz } = await supabase
          .from('age_units')
          .select('dir3_code')
          .eq('nivel', 1)
          .ilike('nombre', `%${data.ministry_name.replace(/^Ministerio (de |del |para )?(la |el )?/i, '')}%`)
          .limit(1)
          .maybeSingle();

        if (raiz?.dir3_code) {
          const { data: docs } = await supabase
            .from('boe_documents')
            .select('id, slug, titulo, fecha_publicacion, rango, departamento')
            .eq('dir3_code', raiz.dir3_code)
            .order('fecha_publicacion', { ascending: false })
            .limit(4);
          if (!cancelled) setBoe(docs || []);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const team = useMemo(() => {
    if (!member) return [];

    const sections = [];
    if (member.rank === 'presidente') sections.push('presidencia del gobierno');
    if (member.rank === 'vicepresidente') {
      const idx = vicepresidents.findIndex((v) => v.slug === member.slug);
      if (idx >= 0 && ORDINALS[idx]) sections.push(`vicepresidencia ${ORDINALS[idx]} del gobierno`);
    }
    if (member.ministry_name) sections.push(normalizeMinistry(member.ministry_name));

    const memberKey = normalizePerson(member.full_name);

    const equipo = officials.filter((o) => {
      const key = normalizeMinistry(o.ministry_name);
      if (!sections.some((s) => ministryMatches(s, key))) return false;
      // La Agenda incluye al propio titular en el listado de su ministerio.
      if (normalizePerson(nameDisplay(o.full_name)) === memberKey) return false;
      if (TOP_ROLE.test(normalizePerson(o.role))) return false;
      return true;
    });

    // Sin repetidos: quien dirige el gabinete de una vicepresidencia
    // figura dos veces en la Agenda, una por la vicepresidencia y otra
    // por el ministerio, y aquí las dos secciones coinciden.
    const vistos = new Set();
    const unicos = equipo.filter((o) => {
      const k = `${normalizePerson(o.full_name)}|${normalizePerson(o.role)}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });

    // Y por jerarquía: antes salían en el orden en que llegaban de la
    // base, así que un director de comunicación aparecía antes que el
    // subsecretario.
    return unicos.sort((a, b) => {
      const d = rangoCargo(a.role) - rangoCargo(b.role);
      return d !== 0 ? d : (a.full_name || '').localeCompare(b.full_name || '');
    });
  }, [member, officials, vicepresidents]);


  // Los hooks van todos antes de cualquier return: React exige el mismo
  // numero y orden en cada render. Este useMemo estaba despues de los
  // returns de notFound y !member, y eso provocaba el error #310.
  const arbolOrg = useMemo(() => construirArbolOrg(orgUnidades), [orgUnidades]);
  const raizOrg = arbolOrg[0] || null;
  const nSubdirecciones = orgUnidades.filter((u) => u.categoria === 'subdireccion_general').length;

  function alternarOrg(id) {
    setOrgAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  if (notFound) {
    return (
      <div className="sec">
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hemos encontrado a esta persona.
            <div style={{ marginTop: 10 }}>
              <Link href="/institutions/ministries" className="btn-o" style={{ textDecoration: 'none' }}>
                Volver a Ministerios
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!member) return <div className="spinner"></div>;

  const hasContact = member.ministry_email || member.ministry_phone || member.ministry_website;

  const avatarStyle = {
    width: 70,
    height: 70,
    borderRadius: 12,
    flexShrink: 0,
    objectFit: 'cover',
    background: '#ece9e2',
  };

  const tabs = [
    { id: 'trayectoria', label: 'Trayectoria' },
    { id: 'equipo', label: `Equipo${team.length ? ` (${team.length})` : ''}` },
    // Solo aparece si el ministerio tiene organigrama cargado: hoy son 5
    // de 22 y una pestana vacia no aporta nada.
    ...(orgUnidades.length > 0
      ? [{ id: 'organigrama', label: `Organigrama (${orgUnidades.length})` }]
      : []),
    ...(boe.length > 0 ? [{ id: 'boe', label: 'BOE' }] : []),
    { id: 'contacto', label: 'Contacto' },
  ];

  return (
    <div className="sec" style={{ maxWidth: 800 }}>
      {/* El atrás va antes de la miga: la miga dice DÓNDE estás, el atrás
          de dónde VIENES. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/institutions/ministries" fallbackLabel="Ministerios" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/ministries" style={{ color: '#999', textDecoration: 'none' }}>
            Ministerios
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{member.full_name}</span>
        </span>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 200, flex: 1 }}>
            {member.photo_url && !photoFailed ? (
              <img
                src={member.photo_url}
                alt=""
                width={70}
                height={70}
                style={avatarStyle}
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <div
                style={{
                  ...avatarStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 21,
                  fontWeight: 700,
                  color: '#8d8b83',
                }}
                aria-hidden="true"
              >
                {initials(member.full_name)}
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.25 }}>{member.full_name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: '#6d5aef', flexShrink: 0 }}></span>
                <span style={{ fontSize: 12, color: '#555' }}>{member.role}</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>
                {member.ministry_name ? `Ministerio de ${member.ministry_name} · ` : ''}Gobierno de España
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
            {/* Era la única ficha de la plataforma sin seguir ni proyecto:
                usaba saved_government_members, la tabla anterior a
                follows, y un botón de Radar en gris. Ahora usa el mismo
                contrato (kind + ref_id) que el resto, así que sus avisos
                llegan por el mismo camino. Va con kind "cargo": se
                comprobó que ningún slug se repite entre
                government_members y government_officials. */}
            <FollowButton kind="cargo" refId={member.slug} label={member.full_name} />
          </div>
        </div>


      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '.5px solid #e0dfd8', margin: '18px 0', overflowX: 'auto' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 12.5,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#1d6f5c' : '#999',
              borderBottom: tab === t.id ? '2px solid #1d6f5c' : '2px solid transparent',
              padding: '0 0 9px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'trayectoria' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={CARD_LABEL}>Trayectoria</div>
          {member.bio_text ? (
            <div style={{ fontSize: 12.5, color: '#444', lineHeight: 1.75, whiteSpace: 'pre-line' }}>
              {member.bio_text}
            </div>
          ) : (
            <div className="empty-state">
              <i className="ti ti-file-off"></i>
              Aún no tenemos la trayectoria de esta persona.
            </div>
          )}
        </div>
      )}

      {tab === 'equipo' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={CARD_LABEL}>
            {member.ministry_name ? `Equipo del Ministerio de ${member.ministry_name}` : 'Equipo'}
          </div>
          {team.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-users-off"></i>
              No hay cargos registrados para este ministerio.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {team.map((o, i) => (
                <Link
                  key={o.slug}
                  href={`/institutions/ministries/persona/${o.slug}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 0',
                    borderBottom: i === team.length - 1 ? 'none' : '.5px solid #f0f0eb',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
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
                    {initials(nameDisplay(o.full_name))}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{nameDisplay(o.full_name)}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{cargoExacto(o)}</div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14 }}></i>
                </Link>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 14, paddingTop: 11, borderTop: '.5px solid #f0f0eb' }}>
            Fuente: Agenda de la Comunicación 2025 · La Moncloa
          </div>
        </div>
      )}

      {tab === 'organigrama' && raizOrg && (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div style={CARD_LABEL}>Estructura del departamento</div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 12 }}>
              {orgUnidades.length} unidades
              {nSubdirecciones ? ` · ${nSubdirecciones} subdirecciones` : ''}
              {orgFuente?.fecha_documento
                ? ` · organigrama de ${fechaCorta(orgFuente.fecha_documento)}`
                : ''}
            </div>

            <div style={{ background: '#f6f5f1', borderRadius: 12, padding: 12 }}>
              {raizOrg.hijos
                .filter((h) =>
                  ['secretaria_estado', 'subsecretaria', 'secretaria_general'].includes(bandaOrg(h.categoria))
                )
                .map((h) => (
                  <BloqueOrg key={h.id} nodo={h} />
                ))}
            </div>
          </div>

          <div className="card" style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={CARD_LABEL}>Detalle</div>
              <button
                onClick={() =>
                  setOrgAbiertos(orgAbiertos.size ? new Set() : new Set(orgUnidades.map((u) => u.id)))
                }
                style={{
                  background: 'none',
                  border: '.5px solid #1d6f5c',
                  borderRadius: 7,
                  color: '#1d6f5c',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
              >
                {orgAbiertos.size ? 'Plegar todo' : 'Desplegar todo'}
              </button>
            </div>
            <div style={{ paddingLeft: 15, borderLeft: '.5px solid #e0dfd8', marginLeft: 5 }}>
              {raizOrg.hijos.map((h) => (
                <RamaOrg
                  key={h.id}
                  nodo={h}
                  profundidad={1}
                  abiertos={orgAbiertos}
                  alternar={alternarOrg}
                />
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: '#bbb', marginTop: 10, lineHeight: 1.6 }}>
              Estructura tomada del organigrama oficial publicado por el ministerio.
              {orgFuente?.norma_referencia ? ` ${orgFuente.norma_referencia}.` : ''}
            </div>
          </div>
        </>
      )}

      {tab === 'boe' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={CARD_LABEL}>ÚLTIMO EN EL BOE</div>
          {boe.slice(0, 3).map((d, i) => (
            <Link
              key={d.id}
              href={`/boe/${d.slug || d.id}`}
              style={{
                display: 'block',
                padding: i === 0 ? '0 0 10px' : '10px 0',
                borderBottom: i === Math.min(boe.length, 3) - 1 ? 'none' : '.5px solid #f0f0eb',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{d.titulo}</div>
              <div style={{ fontSize: 10.5, color: '#a8a49c', marginTop: 3 }}>
                {[d.rango, fechaCorta(d.fecha_publicacion)].filter(Boolean).join(' · ')}
              </div>
            </Link>
          ))}

          {/* Se piden cuatro y se enseñan tres: así se sabe si hay más sin
              una consulta de recuento aparte. */}
          {boe.length > 3 && boe[0]?.departamento && (
            <Link
              href={`/boe?organismo=${encodeURIComponent(boe[0].departamento)}`}
              style={{ display: 'inline-block', marginTop: 11, fontSize: 11.5, color: '#6d5aef', textDecoration: 'none' }}
            >
              Ver todo lo publicado →
            </Link>
          )}
        </div>
      )}

      {tab === 'contacto' && (
        <div className="card" style={{ padding: 18 }}>
          <div style={CARD_LABEL}>Contacto del ministerio</div>
          {!hasContact ? (
            <div className="empty-state">
              <i className="ti ti-address-book-off"></i>
              No tenemos datos de contacto para este ministerio.
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: '#555', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {member.ministry_phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <i className="ti ti-phone" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                  {member.ministry_phone}
                </div>
              )}
              {member.ministry_email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <i className="ti ti-mail" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                  <a href={`mailto:${member.ministry_email}`} style={{ color: '#555', textDecoration: 'none', wordBreak: 'break-all' }}>
                    {member.ministry_email}
                  </a>
                </div>
              )}
              {member.ministry_website && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <i className="ti ti-world" style={{ color: '#6d5aef', fontSize: 14 }}></i>
                  <a
                    href={member.ministry_website.startsWith('http') ? member.ministry_website : `https://${member.ministry_website}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#555', textDecoration: 'none', wordBreak: 'break-all' }}
                  >
                    {member.ministry_website}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Datos obtenidos de La Moncloa — Gobierno de España.{' '}
        <a
          href="https://www.lamoncloa.gob.es/gobierno/composiciondelgobierno/Paginas/index.aspx"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#1d6f5c' }}
        >
          Ver fuente oficial ↗
        </a>
      </div>
    </div>
  );
}
