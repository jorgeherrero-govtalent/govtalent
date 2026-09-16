'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Últimos nombramientos y ceses de altos cargos.
 *
 * EMPAREJA LOS RELEVOS. El BOE publica el cese y el nombramiento como dos
 * asientos distintos, así que sin agrupar se leen seis líneas inconexas
 * en lugar de tres hechos. Se cruza por cargo y fecha para los relevos, y
 * por persona y fecha para quien se mueve de un puesto a otro. Lo que no
 * casa se enseña suelto, que es mejor que esconderlo.
 *
 * VENTANA FLEXIBLE, NO DE QUINCE DÍAS. El ritmo del BOE es muy desigual:
 * en julio hubo 36 movimientos y en agosto 8. Con una ventana fija, la
 * tarjeta aparece vacía semanas enteras. Se enseñan los tres últimos con
 * su fecha, y el usuario juzga por sí mismo si son recientes.
 */

const MORADO = '#6d5aef';
const VERDE = '#1d6f5c';
const TOTAL_DIRECTORIO = '11.843';

// Se piden más de los que se enseñan: al emparejar, seis asientos pueden
// quedarse en tres hechos.
const A_PEDIR = 24;
const A_MOSTRAR = 3;

function fechaCorta(valor) {
  if (!valor) return '';
  return new Date(valor).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// Los nombres oficiales no caben en media columna: "Ministerio de
// Transportes y Movilidad Sostenible" ocupa dos líneas él solo.
function ministerioCorto(texto) {
  if (!texto) return '';
  return texto.replace(/^Ministerio de (Asuntos )?/i, '').replace(/^Presidencia del Gobierno$/i, 'Presidencia');
}

function nombreCorto(texto) {
  if (!texto) return '';
  const partes = texto.trim().split(/\s+/);
  if (partes.length <= 2) return texto;
  return `${partes[0]} ${partes[1]}`;
}

/**
 * Convierte asientos sueltos del BOE en hechos legibles.
 *
 * Tres formas, por orden de prioridad:
 *   - Ascenso: la misma persona cesa en un puesto y entra en otro.
 *   - Relevo: entra uno y sale otro del mismo puesto.
 *   - Suelto: lo que no casa con nada.
 */
function agrupar(filas) {
  const pendientes = [...filas];
  const usados = new Set();
  const hechos = [];

  const clave = (f) => `${f.fecha}|${(f.cargo || '').toLowerCase()}`;
  const clavePersona = (f) => `${f.fecha}|${(f.persona || '').toLowerCase()}`;

  for (const f of pendientes) {
    if (usados.has(f.id) || f.accion !== 'nombramiento') continue;

    // Ascenso: esta misma persona cesa el mismo día en otro puesto.
    const cesePropio = pendientes.find(
      (o) =>
        !usados.has(o.id) &&
        o.accion === 'cese' &&
        o.id !== f.id &&
        clavePersona(o) === clavePersona(f) &&
        (o.cargo || '') !== (f.cargo || '')
    );

    if (cesePropio) {
      usados.add(f.id);
      usados.add(cesePropio.id);
      hechos.push({
        id: f.id,
        fecha: f.fecha,
        cargo: f.cargo,
        departamento: f.departamento,
        tipo: 'ascenso',
        texto: `${f.persona}, que deja ${cesePropio.cargo}`,
      });
      continue;
    }

    // Relevo: otro cesa el mismo día en este mismo puesto.
    const ceseDelPuesto = pendientes.find(
      (o) => !usados.has(o.id) && o.accion === 'cese' && o.id !== f.id && clave(o) === clave(f)
    );

    usados.add(f.id);
    if (ceseDelPuesto) usados.add(ceseDelPuesto.id);

    hechos.push({
      id: f.id,
      fecha: f.fecha,
      cargo: f.cargo,
      departamento: f.departamento,
      tipo: ceseDelPuesto ? 'relevo' : 'alta',
      texto: ceseDelPuesto
        ? `Entra ${nombreCorto(f.persona)} · sale ${nombreCorto(ceseDelPuesto.persona)}`
        : f.persona,
    });
  }

  // Ceses sin relevo: se enseñan igual, un puesto que queda vacante es
  // información.
  for (const f of pendientes) {
    if (usados.has(f.id) || f.accion !== 'cese') continue;
    usados.add(f.id);
    hechos.push({
      id: f.id,
      fecha: f.fecha,
      cargo: f.cargo,
      departamento: f.departamento,
      tipo: 'cese',
      texto: `Cesa ${f.persona}`,
    });
  }

  hechos.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return hechos;
}

const ICONO = {
  ascenso: ['ti-arrow-up-right', VERDE],
  relevo: ['ti-arrows-exchange', MORADO],
  alta: ['ti-arrow-up-right', VERDE],
  cese: ['ti-arrow-down-right', '#993c1d'],
};

export default function TarjetaNombramientos() {
  const supabase = createClient();
  const [hechos, setHechos] = useState(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const { data } = await supabase
        .from('boe_appointments')
        .select('id, fecha, accion, persona, cargo, departamento')
        .not('persona', 'is', null)
        .order('fecha', { ascending: false })
        .limit(A_PEDIR);

      if (!cancelado) setHechos(agrupar(data || []).slice(0, A_MOSTRAR));
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bento" style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18', marginBottom: 3 }}>
        Últimos nombramientos y ceses
      </div>
      <div style={{ fontSize: 11.5, color: '#8b8780', marginBottom: 12 }}>
        Altos cargos de la Administración General del Estado.
      </div>

      <div style={{ flex: 1 }}>
        {hechos === null && <div style={{ fontSize: 12.5, color: '#8b8780' }}>Cargando…</div>}

        {hechos !== null && hechos.length === 0 && (
          <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.6 }}>
            Sin cambios en altos cargos por ahora.
          </div>
        )}

        {(hechos || []).map((h, i) => {
          const [icono, color] = ICONO[h.tipo] || ICONO.alta;
          return (
            <div
              key={h.id}
              style={{
                padding: i === 0 ? '0 0 11px' : '11px 0',
                borderTop: i === 0 ? 'none' : '.5px solid #f2f0ec',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12.5, color: '#1a1a18', fontWeight: 600, lineHeight: 1.4 }}>
                  {h.cargo}
                </span>
                <span style={{ fontSize: 11, color: '#a8a49c', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {fechaCorta(h.fecha)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#3a3a36', marginTop: 4, lineHeight: 1.45 }}>
                <i
                  className={`ti ${icono}`}
                  style={{ color, fontSize: 13, verticalAlign: -2, marginRight: 5 }}
                  aria-hidden="true"
                ></i>
                {h.texto}
              </div>
              <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 3 }}>
                {ministerioCorto(h.departamento)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '.5px solid #f2f0ec', marginTop: 6, paddingTop: 13 }}>
        <div style={{ fontSize: 12.5, color: '#8b8780', lineHeight: 1.55, marginBottom: 11 }}>
          <span style={{ color: '#1a1a18', fontWeight: 600 }}>{TOTAL_DIRECTORIO} cargos</span> de la
          AGE y la UE con su contacto en un solo directorio.
        </div>
        <Link
          href="/instituciones/directorio"
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
          Ver base de datos
        </Link>
      </div>
    </div>
  );
}
