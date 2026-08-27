'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';
import ActaActividad from '@/components/ActaActividad';

/**
 * Registro de actividad de la organización.
 *
 * La misma actividad que se registra dentro de cada proyecto, vista
 * desde la cuenta. Se registra donde se trabaja y se consulta donde se
 * responde.
 *
 * Quién ve qué: la administración de la cuenta ve toda la actividad de
 * la organización; el resto, solo la suya. Es lo que permite que esta
 * sea la vista del que responde de que se registre, sin que un
 * consultor vea lo que sus compañeros hacen para clientes que no lleva.
 */

const MORADO = '#6d5aef';
const BORDE = '#e0dfd8';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const TIPO_LABEL = {
  reunion: 'Reunión',
  documento: 'Entrega de documentación',
  email: 'Comunicación escrita',
};

function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export default function RegistroActividadPage() {
  const supabase = createClient();

  const [cargando, setCargando] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false);
  const [orgId, setOrgId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [actividades, setActividades] = useState([]);
  const [participantes, setParticipantes] = useState({});
  const [proyectos, setProyectos] = useState({});
  const [autores, setAutores] = useState({});
  const [asuntos, setAsuntos] = useState({});
  const [pestana, setPestana] = useState('pendientes');
  const [soloMias, setSoloMias] = useState(false);
  const [orden, setOrden] = useState('recientes');
  const [acta, setActa] = useState(null);

  const cargar = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return setCargando(false);
    setUserId(auth.user.id);

    const { data: miembro } = await supabase
      .from('organization_members')
      .select('role, organization_id')
      .eq('user_id', auth.user.id)
      .limit(1)
      .maybeSingle();

    if (!miembro) return setCargando(false);
    const admin = miembro.role === 'admin';
    setEsAdmin(admin);
    setOrgId(miembro.organization_id);

    // El filtro por creador se aplica aquí y no solo en la interfaz: si
    // dependiera de un botón, bastaría con inspeccionar la petición para
    // ver la actividad de los demás.
    let q = supabase
      .from('activities')
      .select(
        'id, tipo, estado, fecha, modalidad, lugar, asunto, cliente_nombre, client_id, organization_id, project_id, item_id, closed_at, anulada_motivo, created_by'
      )
      .eq('organization_id', miembro.organization_id)
      .order('fecha', { ascending: false });
    if (!admin) q = q.eq('created_by', auth.user.id);

    const { data: acts, error } = await q;
    if (error) toast('No se ha podido cargar el registro');
    const lista = acts || [];
    setActividades(lista);

    if (lista.length > 0) {
      const ids = lista.map((a) => a.id);
      const proyectoIds = [...new Set(lista.map((a) => a.project_id).filter(Boolean))];
      const itemIds = [...new Set(lista.map((a) => a.item_id).filter(Boolean))];
      const autorIds = [...new Set(lista.map((a) => a.created_by).filter(Boolean))];

      const [{ data: parts }, { data: proys }, { data: its }, { data: users }] = await Promise.all([
        supabase.from('activity_participants').select('activity_id, nombre, es_propio').in('activity_id', ids),
        proyectoIds.length > 0
          ? supabase.from('projects').select('id, name').in('id', proyectoIds)
          : Promise.resolve({ data: [] }),
        itemIds.length > 0
          ? supabase.from('project_items').select('id, etiqueta').in('id', itemIds)
          : Promise.resolve({ data: [] }),
        autorIds.length > 0
          ? supabase.from('users').select('id, first_name, last_name').in('id', autorIds)
          : Promise.resolve({ data: [] }),
      ]);

      const porActividad = {};
      for (const p of parts || []) (porActividad[p.activity_id] ||= []).push(p);
      setParticipantes(porActividad);
      setProyectos(Object.fromEntries((proys || []).map((p) => [p.id, p.name])));
      setAsuntos(Object.fromEntries((its || []).map((i) => [i.id, i])));
      setAutores(
        Object.fromEntries(
          (users || []).map((u) => [
            u.id,
            [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'Sin nombre',
          ])
        )
      );
    }
    setCargando(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Completa es la que tiene lo que exige el artículo 6.2 para poder
  // cerrarse. Anuladas aparte: no cuentan pero constan.
  const { pendientes, conActa, anuladas } = useMemo(() => {
    const base = soloMias ? actividades.filter((a) => a.created_by === userId) : actividades;
    // Se ordena aquí y no en la consulta: cambiar el orden no debería
    // costar otra petición.
    const ordenada = [...base].sort((a, b) =>
      orden === 'antiguas' ? (a.fecha || '').localeCompare(b.fecha || '') : (b.fecha || '').localeCompare(a.fecha || '')
    );
    return {
      pendientes: ordenada.filter((a) => a.estado === 'borrador'),
      conActa: ordenada.filter((a) => a.estado === 'cerrada'),
      anuladas: ordenada.filter((a) => a.estado === 'anulada'),
    };
  }, [actividades, soloMias, userId, orden]);

  const visibles = pestana === 'pendientes' ? pendientes : pestana === 'acta' ? conActa : anuladas;

  const pestanaEstilo = (activa) => ({
    fontSize: 11.5,
    padding: '5px 12px',
    borderRadius: 14,
    cursor: 'pointer',
    background: activa ? '#f0eefe' : '#f5f4f1',
    color: activa ? MORADO : '#777',
    fontWeight: activa ? 600 : 400,
  });

  if (cargando) return <div className="spinner"></div>;

  if (!orgId) {
    return (
      <div className="empty-state">
        <i className="ti ti-building-off"></i>
        Todavía no administras ninguna organización.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>Registro de actividad</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>
        {esAdmin
          ? 'Las reuniones, entregas y comunicaciones con la Administración, y el acta de cada una.'
          : 'Tus reuniones, entregas y comunicaciones con la Administración, y el acta de cada una.'}
      </p>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={pestanaEstilo(pestana === 'pendientes')} onClick={() => setPestana('pendientes')}>
          Por completar {pendientes.length > 0 ? pendientes.length : ''}
        </span>
        <span style={pestanaEstilo(pestana === 'acta')} onClick={() => setPestana('acta')}>
          Con acta {conActa.length > 0 ? conActa.length : ''}
        </span>
        {anuladas.length > 0 && (
          <span style={pestanaEstilo(pestana === 'anuladas')} onClick={() => setPestana('anuladas')}>
            Anuladas {anuladas.length}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {/* Solo para la administración: el resto ya ve únicamente lo suyo,
            y ofrecerle el filtro sugeriría que hay algo más que ver. */}
        {esAdmin && (
          <span
            onClick={() => setSoloMias((v) => !v)}
            style={{ fontSize: 11.5, color: '#999', cursor: 'pointer' }}
          >
            {soloMias ? 'Todo el equipo' : 'Solo las mías'}
          </span>
        )}
        <span
          onClick={() => setOrden((v) => (v === 'recientes' ? 'antiguas' : 'recientes'))}
          style={{ fontSize: 11.5, color: '#999', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <i
            className={`ti ti-arrow-${orden === 'recientes' ? 'down' : 'up'}`}
            style={{ fontSize: 12, verticalAlign: -2, marginRight: 3 }}
          ></i>
          {orden === 'recientes' ? 'Más recientes' : 'Más antiguas'}
        </span>
      </div>

      {visibles.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-file-dots"></i>
            {pestana === 'pendientes'
              ? 'Nada por completar. La actividad se registra desde cada proyecto.'
              : pestana === 'acta'
              ? 'Todavía no hay ninguna actividad registrada.'
              : 'No hay actividades anuladas.'}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {visibles.map((a, i) => {
            const parts = participantes[a.id] || [];
            const contraparte = parts.filter((p) => !p.es_propio);
            const asunto = asuntos[a.item_id];
            const contexto = [
              autores[a.created_by],
              a.project_id ? proyectos[a.project_id] : null,
              a.cliente_nombre,
              fechaCorta(a.fecha),
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: i === visibles.length - 1 ? 'none' : '.5px solid #f0f0eb',
                }}
              >
                <i
                  className={`ti ti-${a.estado === 'cerrada' ? 'file-check' : 'file-dots'}`}
                  style={{ fontSize: 16, color: a.estado === 'cerrada' ? '#1d6f5c' : '#b8b4ac', flexShrink: 0 }}
                ></i>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {TIPO_LABEL[a.tipo] || a.tipo}
                    {contraparte.length > 0 && ` · ${contraparte.map((p) => p.nombre).join(', ')}`}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#a8a49c',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {contexto}
                  </div>
                </div>

                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                  {a.estado === 'cerrada' ? (
                    <button
                      onClick={() => setActa({ a, asunto })}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: '#999',
                        fontSize: 11.5,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        fontFamily: 'inherit',
                      }}
                    >
                      <i className="ti ti-file-text" style={{ fontSize: 13, verticalAlign: -2, marginRight: 4 }}></i>
                      Ver acta
                    </button>
                  ) : a.estado === 'anulada' ? (
                    <span style={{ fontSize: 10.5, color: '#aaa' }} title={a.anulada_motivo || ''}>
                      Anulada
                    </span>
                  ) : null}

                  {/* Se completa donde se registró: el formulario vive en
                      el proyecto y necesita sus actores y sus asuntos. */}
                  {a.project_id && (
                    <Link
                      href={`/projects?p=${a.project_id}#actividad`}
                      style={{ fontSize: 11.5, color: '#999', textDecoration: 'none', whiteSpace: 'nowrap' }}
                    >
                      Ir al proyecto
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {acta && <ActaActividad actividad={acta.a} asunto={acta.asunto} onCerrar={() => setActa(null)} />}
    </div>
  );
}
