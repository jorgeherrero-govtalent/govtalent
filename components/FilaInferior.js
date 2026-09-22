'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * La última fila de la home.
 *
 * CAMBIA DE FORMA SEGÚN EL PLAN, y es a propósito: quien está en Free
 * necesita descubrir el producto, y quien paga necesita trabajar. Con Free
 * hay dos columnas, proyectos de ejemplo y una muestra del directorio.
 * Con Pro, proyectos ocupa el ancho entero y no hay nada al lado: el
 * directorio ya lo tiene en el menú.
 *
 * EL PLAN SE CARGA UNA VEZ AQUÍ y no en cada tarjeta, para no repetir la
 * misma consulta dos veces en la misma fila.
 *
 * LOS CORREOS VIAJAN YA ENMASCARADOS. Difuminar con CSS no protege nada:
 * el texto sigue en el HTML y se lee con las herramientas del navegador.
 * De la dirección real solo sale el dominio.
 */

const MORADO = '#6d5aef';
const BENTO = { background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const SIRVIENDO = new Set(['active', 'trialing', 'past_due']);

// Un solo ejemplo: la tarjeta del directorio de al lado tiene tres fichas,
// y con dos proyectos completos esta columna se pasaba de largo. Uno bien
// enseñado explica lo mismo que dos a medias.
const PROYECTO_EJEMPLO = {
  id: 'ej-1',
  nombre: 'Ley de gobernanza de la IA',
  objetivo: 'Que el marco de cumplimiento no recaiga sobre el desplegador.',
  iniciales: ['MG', 'JR', 'CD'],
  resto: 6,
  actores: 9,
  asuntos: 1,
  novedades: 4,
};

// Fichas de muestra del directorio. Del correo solo se escribe el dominio:
// la parte local nunca llega al navegador.
// Tres fichas, compactas. Con el tamaño anterior esta columna crecía más
// que la de proyectos, que solo tiene un ejemplo; encogiendo avatar, texto
// y separación caben las tres sin descuadrar la fila.
const CARGOS_MUESTRA = [
  { id: 'c1', nombre: 'Leire Iglesias Santiago', puesto: 'Secretaria de Estado · Vivienda', dominio: 'vivienda.gob.es' },
  { id: 'c2', nombre: 'Esteban González Pons', puesto: 'Eurodiputado · Grupo PPE', dominio: 'europarl.europa.eu' },
  { id: 'c3', nombre: 'Sara Hernández del Olmo', puesto: 'Secretaria General · Transportes', dominio: 'transportes.gob.es' },
];

function iniciales(nombre) {
  const p = (nombre || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase();
}

const TONOS = [
  { fondo: '#e8f4f0', texto: '#0f6e56' },
  { fondo: '#f0eefe', texto: '#3c3489' },
  { fondo: '#faeeda', texto: '#854f0b' },
];

function Caras({ caras, iniciales: ini, resto }) {
  const lista = ini || caras || [];
  if (!lista.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
      <span style={{ display: 'flex' }}>
        {lista.slice(0, 3).map((c, i) => {
          const tono = TONOS[i % TONOS.length];
          const esTexto = typeof c === 'string';
          return (
            <span
              key={i}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: tono.fondo,
                color: tono.texto,
                border: '1.5px solid #fff',
                marginLeft: i === 0 ? 0 : -7,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {esTexto ? c : c?.imagen ? (
                <img src={c.imagen} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                iniciales(c?.nombre)
              )}
            </span>
          );
        })}
      </span>
      {resto > 0 && <span style={{ fontSize: 11, color: '#a8a49c' }}>y {resto} más</span>}
    </div>
  );
}

function Cifra({ valor, rotulo, morado }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.1, color: morado ? MORADO : '#1a1a18' }}>
        {valor}
      </div>
      <div style={{ fontSize: 10.5, color: '#8b8780' }}>{rotulo}</div>
    </div>
  );
}

function TarjetaProyecto({ p, href }) {
  const cuerpo = (
    <>
      <div style={{ fontSize: 13, color: '#1a1a18', fontWeight: 600, lineHeight: 1.35, marginBottom: p.objetivo ? 3 : 9 }}>
        {p.nombre}
      </div>
      {p.objetivo && (
        <div style={{ fontSize: 11.5, color: '#8b8780', lineHeight: 1.5, marginBottom: 11 }}>{p.objetivo}</div>
      )}
      <Caras caras={p.caras} iniciales={p.iniciales} resto={p.resto} />
      <div style={{ borderTop: '.5px solid #f2f0ec', paddingTop: 10, display: 'flex', gap: 18 }}>
        <Cifra valor={p.actores} rotulo={p.actores === 1 ? 'actor' : 'actores'} morado />
        <Cifra valor={p.asuntos} rotulo={p.asuntos === 1 ? 'asunto' : 'asuntos'} />
        <Cifra valor={p.novedades} rotulo={p.novedades === 1 ? 'novedad' : 'novedades'} />
      </div>
    </>
  );

  const estilo = {
    border: '.5px solid #e6e4dd',
    borderRadius: 11,
    padding: 14,
    display: 'block',
    textDecoration: 'none',
    color: 'inherit',
  };

  if (!href) return <div style={estilo}>{cuerpo}</div>;
  return (
    <Link href={href} style={estilo}>
      {cuerpo}
    </Link>
  );
}

function NuevoProyecto() {
  return (
    <Link
      href="/projects"
      style={{
        border: '.5px dashed #d6d2ca',
        borderRadius: 11,
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        color: '#8b8780',
        fontSize: 12.5,
        textDecoration: 'none',
      }}
    >
      <i className="ti ti-plus" style={{ fontSize: 14 }} aria-hidden="true"></i>
      Nuevo proyecto
    </Link>
  );
}

function Boton({ href, children }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-block',
        background: MORADO,
        color: '#fff',
        borderRadius: 8,
        padding: '9px 16px',
        fontSize: 12.5,
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Link>
  );
}

function Cabecera({ verTodos }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18' }}>Proyectos</span>
        {verTodos && (
          <Link href="/projects" style={{ fontSize: 12, color: MORADO, textDecoration: 'none' }}>
            Ver todos
          </Link>
        )}
      </div>
    </>
  );
}

export default function FilaInferior() {
  const supabase = createClient();
  const [esPro, setEsPro] = useState(null);
  const [proyectos, setProyectos] = useState([]);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        if (!cancelado) setEsPro(false);
        return;
      }

      // Pro propio o heredado del Teams de su organización: quien tiene
      // Teams tiene la licencia Pro incluida.
      const [{ data: perfil }, { data: pertenencias }] = await Promise.all([
        supabase.from('users').select('plan, plan_status').eq('id', uid).single(),
        supabase.from('organization_members').select('organizations(plan, plan_status)').eq('user_id', uid),
      ]);

      const tienePro =
        (perfil?.plan === 'pro' && SIRVIENDO.has(perfil?.plan_status || 'active')) ||
        (pertenencias || []).some(
          (f) =>
            f.organizations &&
            f.organizations.plan === 'teams' &&
            SIRVIENDO.has(f.organizations.plan_status || 'active')
        );

      if (cancelado) return;
      setEsPro(tienePro);
      if (!tienePro) return;

      const { data: lista } = await supabase
        .from('projects')
        .select('id, name, objetivo, updated_at')
        .eq('user_id', uid)
        .eq('archived', false)
        .order('updated_at', { ascending: false })
        .limit(2);

      const ids = (lista || []).map((p) => p.id);
      if (!ids.length) {
        if (!cancelado) setProyectos([]);
        return;
      }

      // Agregadas: tres consultas para todos los proyectos, no tres por cada uno.
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
      for (const id of ids) acc[id] = { actores: 0, asuntos: 0, novedades: 0, todas: [] };
      for (const it of items || []) acc[it.project_id].asuntos += 1;
      for (const a of actores || []) {
        acc[a.project_id].actores += 1;
        acc[a.project_id].todas.push(a);
      }
      for (const e of eventos || []) if (e.estado === 'nuevo') acc[e.project_id].novedades += 1;

      const montados = (lista || []).map((p) => {
        const d = acc[p.id];
        // Los que tienen foto primero: tres siluetas iguales no dicen de
        // qué va el proyecto, que es para lo que están las caras.
        const caras = [...d.todas].sort((a, b) => (b.imagen ? 1 : 0) - (a.imagen ? 1 : 0)).slice(0, 3);
        return {
          id: p.id,
          nombre: p.name,
          objetivo: null,
          caras,
          resto: Math.max(0, d.actores - caras.length),
          actores: d.actores,
          asuntos: d.asuntos,
          novedades: d.novedades,
        };
      });

      if (!cancelado) setProyectos(montados);
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Free: proyectos de ejemplo y muestra del directorio ----------------
  if (esPro === false) {
    return (
      <div className="bento-fila" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'stretch' }}>
        <div className="bento" style={{ ...BENTO, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <Cabecera />
          <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 13 }}>
            Tu espacio de trabajo para asuntos públicos. Un ejemplo:
          </div>
          <div style={{ flex: 1 }}>
            <TarjetaProyecto p={PROYECTO_EJEMPLO} />
          </div>
          <div style={{ borderTop: '.5px solid #f2f0ec', marginTop: 13, paddingTop: 13 }}>
            <Boton href="/projects">Ver proyectos</Boton>
          </div>
        </div>

        <div className="bento" style={{ ...BENTO, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18', marginBottom: 3 }}>Quién decide</div>
          <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 13 }}>
            Cargos y asesores de la AGE, el Congreso y las instituciones europeas.
          </div>
          <div style={{ flex: 1 }}>
            {CARGOS_MUESTRA.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: i === 0 ? '0 0 9px' : '9px 0',
                  borderTop: i === 0 ? 'none' : '.5px solid #f2f0ec',
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: TONOS[i % TONOS.length].fondo,
                    color: TONOS[i % TONOS.length].texto,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10.5,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {iniciales(c.nombre)}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#1a1a18', lineHeight: 1.35 }}>{c.nombre}</div>
                  <div style={{ fontSize: 10.5, color: '#a8a49c', marginBottom: 1, lineHeight: 1.35 }}>
                    {c.puesto}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="ti ti-mail" style={{ fontSize: 11, color: '#a8a49c' }} aria-hidden="true"></i>
                    <span style={{ fontSize: 10.5, color: '#8b8780' }}>
                      <span style={{ letterSpacing: '.5px' }}>••••••</span>@{c.dominio}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '.5px solid #f2f0ec', marginTop: 6, paddingTop: 13 }}>
            <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.55, marginBottom: 11 }}>
              <span style={{ color: '#1a1a18', fontWeight: 600 }}>11.843 cargos</span> con su
              contacto, en un solo directorio.
            </div>
            <Boton href="/instituciones/directorio">Ver base de datos</Boton>
          </div>
        </div>
      </div>
    );
  }

  // --- Pro sin ningún proyecto --------------------------------------------
  if (esPro && proyectos.length === 0) {
    return (
      <div className="bento" style={{ ...BENTO, padding: '20px 24px' }}>
        <Cabecera />
        <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 14 }}>
          Tu espacio de trabajo para asuntos públicos.
        </div>
        <div
          style={{
            borderTop: '.5px solid #f2f0ec',
            paddingTop: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12.5, color: '#3a3a36', lineHeight: 1.6, maxWidth: 560 }}>
            Organiza en un proyecto los asuntos que sigues, los actores a los que quieres llegar y el
            registro de tus reuniones. Con trazabilidad y generación de actas de manera automática.
          </div>
          <Boton href="/projects">Crear mi primer proyecto</Boton>
        </div>
      </div>
    );
  }

  // --- Pro con proyectos ---------------------------------------------------
  // Con uno solo, la segunda celda es la invitación a crear otro; con dos o
  // más, las dos celdas son proyectos y el enlace va en la cabecera.
  const unoSolo = proyectos.length === 1;

  return (
    <div className="bento" style={{ ...BENTO, padding: '20px 24px' }}>
      <Cabecera verTodos={!unoSolo && esPro !== null} />
      <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 14 }}>
        Tu espacio de trabajo para asuntos públicos.
      </div>
      {/* bento-fila trae el salto a una columna en móvil, con !important
          para ganarle al estilo en línea. Sin la clase, las dos tarjetas
          seguían en paralelo en pantalla estrecha y la segunda se cortaba. */}
      <div className="bento-fila" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {esPro === null ? (
          <div style={{ fontSize: 12.5, color: '#8b8780' }}>Cargando…</div>
        ) : (
          <>
            {proyectos.map((p) => (
              <TarjetaProyecto key={p.id} p={p} href={`/projects?p=${p.id}`} />
            ))}
            {unoSolo && <NuevoProyecto />}
          </>
        )}
      </div>
    </div>
  );
}
