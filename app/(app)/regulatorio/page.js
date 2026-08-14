'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

/**
 * Portada de Regulatorio.
 *
 * Agrupa lo que antes eran dos entradas sueltas en la barra de navegación
 * —Expedientes y Procedimientos— y deja sitio para los dos módulos
 * españoles cuando estén.
 *
 * Los recuentos se piden a la base de datos en lugar de escribirlos a
 * mano: si mañana el sync carga más procedimientos, la portada lo refleja
 * sola. Un número desactualizado en la primera pantalla resta más
 * credibilidad de lo que suma tenerlo.
 */

function FlagEU() {
  return (
    <span
      role="img"
      aria-label="Unión Europea"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 14,
        borderRadius: 3,
        background: '#003399',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #FFCC00' }} />
    </span>
  );
}

function FlagES() {
  return (
    <span
      role="img"
      aria-label="España"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 20,
        height: 14,
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
        border: '.5px solid rgba(0,0,0,.12)',
      }}
    >
      <span style={{ height: '25%', background: '#C60B1E' }} />
      <span style={{ height: '50%', background: '#FFC400' }} />
      <span style={{ height: '25%', background: '#C60B1E' }} />
    </span>
  );
}

function Cifra({ n, label, destacada }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: destacada ? '#3C3489' : '#1a1a1a' }}>
        {n === null ? '—' : n.toLocaleString('es-ES')}
      </div>
      <div style={{ fontSize: 9.5, color: '#999' }}>{label}</div>
    </div>
  );
}

function ModuloCard({ href, icon, titulo, fuente, descripcion, cifras }) {
  return (
    <Link
      href={href}
      className="card"
      style={{ padding: 16, textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: '#EEEDFE',
            color: '#3C3489',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <i className={`ti ti-${icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{titulo}</div>
          <div style={{ fontSize: 10.5, color: '#999' }}>{fuente}</div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: '#666', lineHeight: 1.55, marginBottom: 11 }}>{descripcion}</div>
      <div style={{ display: 'flex', gap: 16, paddingTop: 11, borderTop: '.5px solid #f0f0eb' }}>
        {cifras.map((c) => (
          <Cifra key={c.label} {...c} />
        ))}
      </div>
    </Link>
  );
}

function SoonCard({ icon, titulo, fuente, descripcion }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '.5px dashed #d5d3c9',
        borderRadius: 12,
        padding: 16,
        opacity: 0.72,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: '#f0efe9',
            color: '#8d8b83',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <i className={`ti ti-${icon}`} style={{ fontSize: 16 }} aria-hidden="true"></i>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#666' }}>{titulo}</div>
          <div style={{ fontSize: 10.5, color: '#999' }}>{fuente}</div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: '#999', lineHeight: 1.55 }}>{descripcion}</div>
    </div>
  );
}

export default function RegulatorioPage() {
  const supabase = createClient();
  const [cifras, setCifras] = useState({
    expedientes: null,
    ventanas: null,
    procedimientos: null,
    tramitacion: null,
    esTotal: null,
    esVivas: null,
  });

  useEffect(() => {
    // Solo recuentos, con head: true, así que no se traen filas.
    Promise.all([
      supabase.from('eu_initiatives').select('id', { count: 'exact', head: true }),
      supabase.from('eu_open_windows').select('id', { count: 'exact', head: true }),
      supabase.from('ep_procedures').select('process_id', { count: 'exact', head: true }),
      supabase
        .from('ep_procedures')
        .select('process_id', { count: 'exact', head: true })
        .eq('is_closed', false),
      supabase.from('es_initiatives').select('num_expediente', { count: 'exact', head: true }),
      supabase
        .from('es_initiatives')
        .select('num_expediente', { count: 'exact', head: true })
        .eq('is_closed', false),
    ]).then(([exp, ven, proc, tram, esT, esV]) => {
      setCifras({
        expedientes: exp.count ?? null,
        ventanas: ven.count ?? null,
        procedimientos: proc.count ?? null,
        tramitacion: tram.count ?? null,
        esTotal: esT.count ?? null,
        esVivas: esV.count ?? null,
      });
    });
  }, []);

  const suma = (...xs) => (xs.every((x) => x !== null) ? xs.reduce((a, b) => a + b, 0) : null);
  const enMarchaUE = suma(cifras.ventanas, cifras.tramitacion);
  const enMarcha = suma(cifras.ventanas, cifras.tramitacion, cifras.esVivas);
  const total = suma(cifras.expedientes, cifras.procedimientos, cifras.esTotal);

  const Bloque = ({ children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
      {children}
    </div>
  );

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Regulatorio</h1>
        <p style={{ fontSize: 12.5, color: '#888', margin: '4px 0 0' }}>
          {total !== null
            ? `${total.toLocaleString('es-ES')} asuntos · ${enMarcha?.toLocaleString('es-ES')} en marcha`
            : 'Cargando…'}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
        <FlagEU />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Unión Europea</span>
        <div style={{ flex: 1, height: '.5px', background: '#e0dfd8' }}></div>
        {enMarchaUE !== null && <span style={{ fontSize: 11, color: '#888' }}>{enMarchaUE} en marcha</span>}
      </div>

      <div style={{ marginBottom: 24 }}>
        <Bloque>
          <ModuloCard
            href="/initiatives"
            icon="file-text"
            titulo="Expedientes"
            fuente="Comisión Europea"
            descripcion="Plazos, resumen y actores responsables de la tramitación."
            cifras={[
              { n: cifras.ventanas, label: 'abiertas', destacada: true },
              { n: cifras.expedientes, label: 'total' },
            ]}
          />
          <ModuloCard
            href="/procedures"
            icon="gavel"
            titulo="Procedimientos"
            fuente="Parlamento Europeo"
            descripcion="Ponentes, fase normativa, comisiones y actores clave."
            cifras={[
              { n: cifras.tramitacion, label: 'en marcha', destacada: true },
              { n: cifras.procedimientos, label: 'total' },
            ]}
          />
        </Bloque>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
        <FlagES />
        <span style={{ fontSize: 13, fontWeight: 600 }}>España</span>
        <div style={{ flex: 1, height: '.5px', background: '#e0dfd8' }}></div>
        {cifras.esVivas !== null && <span style={{ fontSize: 11, color: '#888' }}>{cifras.esVivas} en trámite</span>}
      </div>

      <Bloque>
        <SoonCard
          icon="messages"
          titulo="Consultas públicas"
          fuente="Ministerios"
          descripcion="Consultas y audiencias de los ministerios, con sus plazos y potenciales actores."
        />
        <ModuloCard
          href="/congreso"
          icon="building-bank"
          titulo="Congreso"
          fuente="Cortes Generales"
          descripcion="Proyectos y proposiciones de ley con su ponencia, actores y plazos de enmiendas."
          cifras={[
            { n: cifras.esVivas, label: 'en trámite', destacada: true },
            { n: cifras.esTotal, label: 'total' },
          ]}
        />
      </Bloque>
    </div>
  );
}
