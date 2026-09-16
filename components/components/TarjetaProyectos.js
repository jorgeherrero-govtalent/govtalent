'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * La tarjeta de proyectos de la home.
 *
 * TRES ESTADOS. Con Pro y proyectos, los dos más recientes y una fila
 * punteada para crear otro. Con Pro y ninguno, la invitación a crear el
 * primero. Sin Pro, dos ejemplos y el botón a /projects, que es donde
 * vive la demo completa: esta tarjeta no vende, solo abre la puerta.
 *
 * LAS CIFRAS SE PIDEN AGREGADAS. Tres consultas para todos los proyectos
 * y no tres por proyecto, igual que en la página de proyectos.
 *
 * LA ALTURA LA MANDA LA TARJETA DE AL LADO. El contenido central crece y
 * el pie va anclado abajo, así que las dos columnas de la fila acaban a
 * la misma altura sin números mágicos.
 */

const MORADO = '#6d5aef';
const SIRVIENDO = new Set(['active', 'trialing', 'past_due']);

// Los mismos ejemplos que la página de proyectos enseña a quien no tiene
// Pro. Viven aquí duplicados a propósito: son texto de escaparate, no
// datos, y no compensa exportarlos solo para esto.
const EJEMPLOS = [
  { id: 'demo-1', name: 'Ley de gobernanza de la IA', actores: 9, asuntos: 1, novedades: 4 },
  { id: 'demo-2', name: 'Movilidad sostenible', actores: 6, asuntos: 2, novedades: 3 },
];

function Caras({ caras, total }) {
  const huecos = caras.length ? caras : Array.from({ length: Math.min(total, 3) });
  if (!huecos.length) return null;
  return (
    <span style={{ display: 'flex', flexShrink: 0 }}>
      {huecos.map((c, i) => (
        <span
          key={i}
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#f0eefe',
            border: '1.5px solid #fff',
            marginLeft: i === 0 ? 0 : -6,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {c?.imagen ? (
            <img src={c.imagen} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : null}
        </span>
      ))}
    </span>
  );
}

function Cifras({ actores, asuntos, novedades }) {
  return (
    <span style={{ fontSize: 11.5, color: '#8b8780' }}>
      <span style={{ color: MORADO, fontWeight: 600 }}>{actores}</span>{' '}
      {actores === 1 ? 'actor' : 'actores'} ·{' '}
      <span style={{ color: '#1a1a18', fontWeight: 600 }}>{asuntos}</span>{' '}
      {asuntos === 1 ? 'asunto' : 'asuntos'} ·{' '}
      <span style={{ color: '#1a1a18', fontWeight: 600 }}>{novedades}</span>{' '}
      {novedades === 1 ? 'novedad' : 'novedades'}
    </span>
  );
}

function Fila({ nombre, caras, actores, asuntos, novedades, href, primera }) {
  const contenido = (
    <>
      <div style={{ fontSize: 12.5, color: '#1a1a18', fontWeight: 600, marginBottom: 6 }}>{nombre}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Caras caras={caras} total={actores} />
        <Cifras actores={actores} asuntos={asuntos} novedades={novedades} />
      </div>
    </>
  );

  const estilo = {
    display: 'block',
    padding: primera ? '0 0 11px' : '11px 0',
    borderTop: primera ? 'none' : '.5px solid #f2f0ec',
    textDecoration: 'none',
    color: 'inherit',
  };

  if (!href) return <div style={estilo}>{contenido}</div>;
  return (
    <Link href={href} style={estilo}>
      {contenido}
    </Link>
  );
}

export default function TarjetaProyectos() {
  const supabase = createClient();
  const [esPro, setEsPro] = useState(null);
  const [proyectos, setProyectos] = useState([]);
  const [datos, setDatos] = useState({});

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        if (!cancelado) setEsPro(false);
        return;
      }

      // Pro propio o heredado del plan Teams de su organización: quien
      // tiene Teams tiene la licencia Pro incluida.
      const [{ data: perfil }, { data: pertenencias }] = await Promise.all([
        supabase.from('users').select('plan, plan_status').eq('id', uid).single(),
        supabase
          .from('organization_members')
          .select('organizations(plan, plan_status)')
          .eq('user_id', uid),
      ]);

      const proPropio = perfil?.plan === 'pro' && SIRVIENDO.has(perfil?.plan_status || 'active');
      const proPorTeams = (pertenencias || []).some(
        (f) =>
          f.organizations &&
          f.organizations.plan === 'teams' &&
          SIRVIENDO.has(f.organizations.plan_status || 'active')
      );
      const tienePro = proPropio || proPorTeams;

      if (cancelado) return;
      setEsPro(tienePro);
      if (!tienePro) return;

      const { data: lista } = await supabase
        .from('projects')
        .select('id, name, updated_at')
        .eq('user_id', uid)
        .eq('archived', false)
        .order('updated_at', { ascending: false })
        .limit(2);

      if (cancelado) return;
      const ids = (lista || []).map((p) => p.id);
      if (!ids.length) {
        setProyectos([]);
        return;
      }

      // Agregadas: tres consultas para todos los proyectos, no tres por
      // cada uno.
      const [{ data: items }, { data: actores }, { data: eventos }] = await Promise.all([
        supabase.from('project_items').select('project_id').in('project_id', ids),
        supabase
          .from('project_actors')
          .select('project_id, nombre, imagen')
          .in('project_id', ids)
          .order('created_at'),
        supabase.from('project_events').select('project_id, estado').in('project_id', ids),
      ]);

      const acc = {};
      for (const id of ids) acc[id] = { actores: 0, asuntos: 0, novedades: 0, caras: [], todas: [] };
      for (const it of items || []) acc[it.project_id].asuntos += 1;
      for (const a of actores || []) {
        acc[a.project_id].actores += 1;
        acc[a.project_id].todas.push(a);
      }
      for (const id of ids) {
        const d = acc[id];
        // Los que tienen foto primero: tres siluetas iguales no dicen de
        // qué va el proyecto, que es para lo que están las caras.
        d.caras = [...d.todas].sort((a, b) => (b.imagen ? 1 : 0) - (a.imagen ? 1 : 0)).slice(0, 3);
        delete d.todas;
      }
      for (const e of eventos || []) if (e.estado === 'nuevo') acc[e.project_id].novedades += 1;

      if (cancelado) return;
      setDatos(acc);
      setProyectos(lista || []);
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cabecera = (derecha) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 10,
        marginBottom: 3,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18' }}>Proyectos</div>
      {derecha}
    </div>
  );

  // --- Free: dos ejemplos y la puerta a /projects -------------------------
  if (esPro === false) {
    return (
      <div className="bento" style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
        {cabecera(null)}
        <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 12 }}>
          Tu espacio de trabajo para asuntos públicos. Algunos ejemplos:
        </div>
        <div style={{ flex: 1 }}>
          {EJEMPLOS.map((e, i) => (
            <Fila
              key={e.id}
              nombre={e.name}
              caras={[]}
              actores={e.actores}
              asuntos={e.asuntos}
              novedades={e.novedades}
              primera={i === 0}
            />
          ))}
        </div>
        <div style={{ borderTop: '.5px solid #f2f0ec', marginTop: 6, paddingTop: 13 }}>
          <Link
            href="/projects"
            style={{
              display: 'inline-block',
              background: MORADO,
              color: '#fff',
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Ver proyectos
          </Link>
        </div>
      </div>
    );
  }

  // --- Pro sin ningún proyecto -------------------------------------------
  if (esPro && proyectos.length === 0) {
    return (
      <div className="bento" style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
        {cabecera(null)}
        <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 12 }}>
          Tu espacio de trabajo para asuntos públicos.
        </div>
        <div style={{ flex: 1, borderTop: '.5px solid #f2f0ec', paddingTop: 13 }}>
          <div style={{ fontSize: 12.5, color: '#3a3a36', lineHeight: 1.6 }}>
            Reúne en un proyecto los asuntos que sigues, los actores a los que quieres llegar y el
            registro de tus reuniones. Las actas se componen solas a partir de lo que anotas.
          </div>
        </div>
        <div style={{ borderTop: '.5px solid #f2f0ec', marginTop: 13, paddingTop: 13 }}>
          <Link
            href="/projects"
            style={{
              display: 'inline-block',
              background: MORADO,
              color: '#fff',
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Crear mi primer proyecto
          </Link>
        </div>
      </div>
    );
  }

  // --- Pro con proyectos --------------------------------------------------
  return (
    <div className="bento" style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
      {cabecera(
        <Link href="/projects" style={{ fontSize: 12, color: MORADO, textDecoration: 'none' }}>
          Ver todos
        </Link>
      )}
      <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 12 }}>
        Tu espacio de trabajo para asuntos públicos.
      </div>

      <div style={{ flex: 1 }}>
        {esPro === null ? (
          <div style={{ fontSize: 12.5, color: '#8b8780' }}>Cargando…</div>
        ) : (
          proyectos.map((p, i) => {
            const d = datos[p.id] || { actores: 0, asuntos: 0, novedades: 0, caras: [] };
            return (
              <Fila
                key={p.id}
                nombre={p.name}
                caras={d.caras}
                actores={d.actores}
                asuntos={d.asuntos}
                novedades={d.novedades}
                href={`/projects?p=${p.id}`}
                primera={i === 0}
              />
            );
          })
        )}

        {/* Tercera fila punteada: rellena el hueco que dejan dos proyectos
            frente a las tres entradas de la tarjeta de al lado, y de paso
            es la acción que más se usa. */}
        {esPro && proyectos.length > 0 && (
          <Link
            href="/projects"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              marginTop: 11,
              padding: '13px',
              border: '.5px dashed #d6d2ca',
              borderRadius: 10,
              color: '#8b8780',
              fontSize: 12.5,
              textDecoration: 'none',
            }}
          >
            <i className="ti ti-plus" style={{ fontSize: 14 }} aria-hidden="true"></i>
            Nuevo proyecto
          </Link>
        )}
      </div>
    </div>
  );
}
