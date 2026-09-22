'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { groupColor } from '@/lib/grupos';
import LogoGrupo from '@/components/LogoGrupo';
import PestanasCongreso from '@/components/PestanasCongreso';

export default function GroupsDirectoryPage() {
  const supabase = createClient();
  const [groups, setGroups] = useState(null);
  const [asesores, setAsesores] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    // group_profile trae ya los recuentos. Antes se leía de deputy_roles,
    // que se diseñó para esto pero nunca se llegó a cargar: por eso las
    // nueve tarjetas mostraban "Portavoz: —".
    const { data } = await supabase
      .from('group_profile')
      .select('group_id, slug, name, short_name, member_count, n_diputados, n_vivas, n_presentadas, n_leyes, n_portavocias')
      .order('n_diputados', { ascending: false });
    const lista = data || [];
    setGroups(lista);

    // Los asesores no están en group_profile, así que se cuentan aparte.
    //
    // Un recuento por grupo con head: true y no una sola consulta que se
    // traiga los asesores para contarlos aquí. Son nueve peticiones que
    // no devuelven ni una fila, frente a traer los trescientos y pico
    // registros enteros a un listado que solo va a enseñar el total.
    //
    // Mismos filtros que la ficha del grupo —activo y sin objeción—
    // para que la cifra de la tarjeta y la de la pestaña Equipo digan lo
    // mismo. La política de RLS ya filtra por ahí, pero dejarlo escrito
    // evita que la tarjeta cambie sola el día que se toque la política.
    const conteos = await Promise.all(
      lista.map((g) =>
        supabase
          .from('parliamentary_staff')
          .select('id', { count: 'exact', head: true })
          .eq('parliamentary_group_id', g.group_id)
          .eq('active', true)
          .eq('objecion', false)
      )
    );
    const porGrupo = {};
    lista.forEach((g, i) => {
      // null y no 0 si la consulta falla: un cero diría "este grupo no
      // tiene asesores", que es una afirmación, no una ausencia de dato.
      porGrupo[g.group_id] = conteos[i]?.error ? null : (conteos[i]?.count ?? null);
    });
    setAsesores(porGrupo);
  }

  // Sin tildes, igual que el resto de buscadores: nadie escribe
  // "Catalunya" con acento al buscar.
  const normalize = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtered = (groups || []).filter((g) => normalize(g.name).includes(normalize(search)));

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Grupos parlamentarios</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>
          {groups
            ? `${groups.length} grupos · ${groups.reduce((s, g) => s + (g.n_diputados || 0), 0)} diputados · XV Legislatura`
            : '—'}
        </p>
      </div>

      <PestanasCongreso />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#fff',
          border: '.5px solid #e0dfd8',
          borderRadius: 20,
          padding: '8px 16px',
          marginBottom: 16,
          maxWidth: 380,
        }}
      >
        <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar grupo parlamentario..."
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
        />
      </div>

      {groups === null ? (
        <div className="spinner"></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-flag-off"></i>
            No hay grupos que coincidan con la búsqueda.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.map((g) => (
            <Link
              key={g.group_id}
              href={`/institutions/groups/${g.slug}`}
              className="card"
              style={{ padding: 16, textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 13 }}>
                <LogoGrupo nombre={g.name} color={groupColor(g.name)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>{g.name}</div>
                  {/* Los diputados se han bajado al pie, así que aquí ya
                      no se repiten: el mismo número dos veces en la
                      misma tarjeta hace dudar de si son dos cosas
                      distintas. */}
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 3 }}>
                    {g.n_portavocias > 0
                      ? `${g.n_portavocias} ${g.n_portavocias === 1 ? 'portavocía' : 'portavocías'}`
                      : 'XV Legislatura'}
                  </div>
                </div>
              </div>

              {/* Quiénes son, no cuánto papel mueven.
                  Aquí iban "en trámite" y "leyes", que contaban la
                  actividad legislativa del grupo: mil setecientas y pico
                  iniciativas en una tarjeta de directorio no dicen nada
                  de un grupo y encima competían con la cifra de la
                  portada. El directorio responde a otra pregunta —a
                  cuánta gente tengo enfrente y quién prepara los
                  expedientes—, y esa se contesta con diputados y
                  asesores. */}
              <div style={{ display: 'flex', gap: 16, paddingTop: 12, borderTop: '.5px solid #f0f0eb' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1d6f5c' }}>
                    {(g.n_diputados || 0).toLocaleString('es-ES')}
                  </div>
                  <div style={{ fontSize: 10, color: '#999' }}>
                    {g.n_diputados === 1 ? 'diputado' : 'diputados'}
                  </div>
                </div>
                <div>
                  {/* Una raya mientras se cuenta o si el recuento falló.
                      Un 0 aquí sería una afirmación falsa. */}
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {asesores[g.group_id] === null || asesores[g.group_id] === undefined
                      ? '—'
                      : asesores[g.group_id].toLocaleString('es-ES')}
                  </div>
                  <div style={{ fontSize: 10, color: '#999' }}>
                    {asesores[g.group_id] === 1 ? 'asesor' : 'asesores'}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
