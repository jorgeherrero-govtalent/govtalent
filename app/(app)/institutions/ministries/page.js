'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import MultiSelectFilter from '@/components/MultiSelectFilter';

// Deriva un "tipo de cargo" a partir del texto libre del cargo, para poder
// filtrar sin depender de una lista cerrada mantenida a mano.
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
const ROL_GENERICO = /^(director[a]?|presidente|presidenta|gerente|secretari[oa] general|subsecretari[oa]|secretari[oa] de estado|interventor[a]? general|delegad[oa] del gobierno|jefe|jefa)$/i;

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

function GroupRow({ member, officials, vicepresidenteOrdinal }) {
  const [open, setOpen] = useState(false);
  const team = teamFor(member, officials, vicepresidenteOrdinal);

  return (
    <div className="card" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: '#e8f4f0',
            color: '#1d6f5c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {member.photo_url ? (
            <img src={member.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            initials(member.full_name)
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {vicepresidenteOrdinal
              ? `Vicepresidencia ${vicepresidenteOrdinal[0].toUpperCase()}${vicepresidenteOrdinal.slice(1)} del Gobierno${
                  member.ministry_name ? ` · Ministerio de ${member.ministry_name}` : ''
                }`
              : member.ministry_name
                ? `Ministerio de ${member.ministry_name}`
                : member.role}
          </div>
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 1 }}>
            {member.full_name} — {member.role}
          </div>
        </div>
        {team.length > 0 && (
          <span style={{ fontSize: 11.5, color: '#1d6f5c', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {open ? 'Ocultar equipo' : 'Ver equipo'} {open ? '▴' : '▾'}
          </span>
        )}
      </div>
      {open && team.length > 0 && (
        <div style={{ padding: '2px 16px 14px 66px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link
            href={`/institutions/ministries/${member.slug}`}
            style={{ fontSize: 12, color: '#333', fontWeight: 600, textDecoration: 'none' }}
          >
            {member.full_name} <span style={{ color: '#999', fontWeight: 400 }}>— {member.role}</span>
          </Link>
          {team.map((o) => (
            <Link
              key={o.slug}
              href={`/institutions/ministries/persona/${o.slug}`}
              style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}
            >
              {nameDisplay(o.full_name)} <span style={{ color: '#999' }}>— {cargoExacto(o)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function OrganigramaTab({ members, officials }) {
  const presidente = members.filter((m) => m.rank === 'presidente');
  const vicepresidencias = members.filter((m) => m.rank === 'vicepresidente');
  const ministros = members.filter((m) => m.rank === 'ministro');
  const ordinalWords = ['primera', 'segunda', 'tercera'];

  return (
    <>
      {(presidente.length > 0 || vicepresidencias.length > 0) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>
            Presidencia y Vicepresidencias
          </div>
          {presidente.map((m) => (
            <GroupRow key={m.slug} member={m} officials={officials} />
          ))}
          {vicepresidencias.map((m, i) => (
            <GroupRow key={m.slug} member={m} officials={officials} vicepresidenteOrdinal={ordinalWords[i]} />
          ))}
        </div>
      )}

      {ministros.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>Ministerios</div>
          {ministros.map((m) => (
            <GroupRow key={m.slug} member={m} officials={officials} />
          ))}
        </div>
      )}
    </>
  );
}

function BuscarTab({ members, officials }) {
  const [search, setSearch] = useState('');
  const [ministryFilter, setMinistryFilter] = useState(new Set());
  const [typeFilter, setTypeFilter] = useState(new Set());

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
        role: o.role,
        ministry_name: o.ministry_name,
        unit_name: o.unit_name !== o.ministry_name ? o.unit_name : null,
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
    return list;
  }, [allPeople, search, ministryFilter, typeFilter]);

  const activeCount = ministryFilter.size + typeFilter.size;

  function clearFilters() {
    setSearch('');
    setMinistryFilter(new Set());
    setTypeFilter(new Set());
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: '.5px solid #e0dfd8',
            borderRadius: 20,
            padding: '7px 14px',
            flex: '1 1 220px',
          }}
        >
          <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o cargo..."
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
          />
        </div>
        <MultiSelectFilter label="Ministerio" values={ministryOptions} selected={ministryFilter} onApply={setMinistryFilter} />
        <MultiSelectFilter label="Tipo de cargo" values={typeOptions} selected={typeFilter} onApply={setTypeFilter} />
      </div>

      {activeCount > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {[...ministryFilter].map((v) => (
            <span key={v} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          {[...typeFilter].map((v) => (
            <span key={v} style={{ fontSize: 11, background: '#f0efe9', color: '#666', padding: '3px 10px', borderRadius: 14 }}>
              {v}
            </span>
          ))}
          <span onClick={clearFilters} style={{ fontSize: 11, color: '#999', textDecoration: 'underline', cursor: 'pointer' }}>
            Limpiar filtros
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-user-off"></i>
            No hay nadie con estos filtros.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr .5px 1.6fr .5px 1.8fr .5px 24px',
              padding: '10px 16px',
              borderBottom: '.5px solid #f0f0eb',
              fontSize: 10.5,
              fontWeight: 700,
              color: '#999',
              textTransform: 'uppercase',
            }}
          >
            <div>Persona</div>
            <div></div>
            <div style={{ textAlign: 'center' }}>Cargo</div>
            <div></div>
            <div style={{ textAlign: 'center' }}>Ministerio / Unidad</div>
            <div></div>
            <div></div>
          </div>
          {filtered.map((p) => (
            <Link
              key={p.slug}
              href={p.isMember ? `/institutions/ministries/${p.slug}` : `/institutions/ministries/persona/${p.slug}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr .5px 1.6fr .5px 1.8fr .5px 24px',
                padding: '11px 16px',
                borderBottom: '.5px solid #f0f0eb',
                alignItems: 'center',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>{p.full_name_display}</span>
              <div style={{ background: '#f0f0eb' }}></div>
              <div style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>{p.role}</div>
              <div style={{ background: '#f0f0eb' }}></div>
              <div style={{ fontSize: 11.5, color: '#888', textAlign: 'center' }}>
                {p.ministry_name}
                {p.unit_name ? ` · ${p.unit_name}` : ''}
              </div>
              <div style={{ background: '#f0f0eb' }}></div>
              <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14 }}></i>
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
        .select('full_name, slug, role, ministry_name, unit_name, dir3_code, age_units(nombre, categoria, nivel)')
        .eq('active', true),
    ]).then(([membersRes, officialsRes]) => {
      setMembers(membersRes.data || []);
      setOfficials(officialsRes.data || []);
    });
  }, []);

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ministerios</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>
          {members ? members.length + officials.length : '—'} personas del Gobierno de España
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
          Buscar
        </span>
      </div>

      {members === null ? (
        <div className="spinner"></div>
      ) : tab === 'organigrama' ? (
        <OrganigramaTab members={members} officials={officials} />
      ) : (
        <BuscarTab members={members} officials={officials} />
      )}
    </div>
  );
}
