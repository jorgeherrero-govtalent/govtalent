'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';
import PanelBloqueado from '@/components/PanelBloqueado';
import usePlanPro from '@/lib/usePlanPro';
import {
  MORADO, GRIS, CCAA, NOMBRE_PARLAMENTO, FASES, ETIQUETA_TIPO,
  fechaCorta, fechaLarga, finDePlazoTexto, tituloLegible, plazoEnDias,
} from '@/lib/ccaa/vista';

/**
 * Ficha de una ley de un parlamento autonómico.
 *
 * Diseño elegido el 04-10-2026 (opción C): barra de fases, una frase
 * «Ahora» con el punto en que está la ley y todos los trámites con su
 * fuente — la ficha del parlamento o el boletín y la página, si lo ha
 * leído GovTalent.
 *
 * Disciplina de nulos: si un plazo se da en días sin fecha final, se dice
 * así; no se calcula una fecha que el boletín no publica.
 */

const CARD = { background: '#fff', borderRadius: 16, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };

// Atrezo del panel Pro: genérico, nunca leyes reales.
const FILAS_LEYES = [
  { iniciales: 'LEY', nombre: 'Ley autonómica modificada', cargo: 'Materia afectada' },
  { iniciales: 'LEY', nombre: 'Ley autonómica modificada', cargo: 'Materia afectada' },
  { iniciales: 'LEY', nombre: 'Ley autonómica modificada', cargo: 'Materia afectada' },
];

const ORDEN_FASE = { admision: 0, enmiendas: 1, ponencia: 2, pleno: 3 };

function Ahora({ e, tramites }) {
  let texto;
  if (e.is_closed) {
    texto = e.resultado ? `Tramitación terminada: ${e.resultado}.` : 'Tramitación terminada.';
  } else if (e.plazo_abierto && e.plazo_enmiendas) {
    texto = `Plazo de enmiendas abierto hasta el ${finDePlazoTexto(e.plazo_enmiendas)}${e.n_ampliaciones ? ` (ampliado ${e.n_ampliaciones} ${e.n_ampliaciones === 1 ? 'vez' : 'veces'})` : ''}.`;
  } else if (plazoEnDias(e.plazo_en_dias)) {
    texto = `${e.plazo_en_dias.replace(/\.$/, '')}. El boletín no fija la fecha final.`;
  } else if (tramites[0]?.descripcion) {
    texto = `Último trámite (${fechaCorta(tramites[0].fecha) || 'sin fecha'}): ${tramites[0].descripcion}`;
  } else {
    texto = e.situacion || 'En tramitación.';
  }
  const fuente = tramites.find((t) => t.descripcion && texto.includes(t.descripcion)) || null;
  return (
    <div style={{ background: '#f6f4ff', borderRadius: 12, padding: '14px 16px', fontSize: 13, lineHeight: 1.55 }}>
      <b>Ahora:</b> {texto}
      {fuente?.url && (
        <>
          {' '}
          <a href={fuente.url} target="_blank" rel="noreferrer">
            Fuente ↗
          </a>
        </>
      )}
    </div>
  );
}

function Fuente({ t }) {
  if (!t.url && t.origen !== 'boletin_ia') return <span>Ficha del parlamento</span>;
  const texto = t.origen === 'boletin_ia' ? `Boletín${t.pagina ? `, pág. ${t.pagina}` : ''}` : 'Fuente';
  return (
    <>
      {t.url ? (
        <a href={t.url} target="_blank" rel="noreferrer">
          {texto} ↗
        </a>
      ) : (
        texto
      )}
      {t.origen === 'boletin_ia' && <span style={{ color: MORADO }}> · leído por GovTalent</span>}
    </>
  );
}

export default function FichaParlamentoAutonomico() {
  const { slug } = useParams();
  const supabase = createClient();
  const esPro = usePlanPro();
  const [e, setE] = useState(undefined);
  const [tramites, setTramites] = useState([]);
  const [hermana, setHermana] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('ccaa_resumen').select('*').eq('slug', slug).maybeSingle();
      setE(data || null);
      if (!data) return;
      const { data: tr } = await supabase
        .from('ccaa_tramites')
        .select('id, tipo, fecha, plazo_hasta, descripcion, organo, pagina, url, origen')
        .eq('expediente_id', data.id)
        .order('fecha', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      setTramites(tr || []);
      // Presupuestos y ley de acompañamiento del mismo año van juntos.
      const otra = data.tipo_norm === 'presupuestos' ? 'acompanamiento' : data.tipo_norm === 'acompanamiento' ? 'presupuestos' : null;
      const anio = String(data.titulo).match(/\b(20\d\d)\b/)?.[1];
      if (otra && anio) {
        const { data: h } = await supabase
          .from('ccaa_expedientes')
          .select('titulo, num_expediente, slug')
          .eq('parlamento', data.parlamento)
          .eq('tipo_norm', otra)
          .ilike('titulo', `%${anio}%`)
          .limit(1);
        setHermana(h?.[0] || null);
      }
    })();
  }, [slug]);

  if (e === undefined) return <div className="sec" style={{ maxWidth: 920, fontSize: 13, color: GRIS }}>Cargando…</div>;
  if (e === null) {
    return (
      <div className="sec" style={{ maxWidth: 920 }}>
        <BackLink fallbackHref="/parlamentos-autonomicos" fallbackLabel="Parlamentos autonómicos" />
        <p style={{ fontSize: 13, color: GRIS }}>No encontramos esta ley.</p>
      </div>
    );
  }

  const titulo = tituloLegible(e.titulo_es || e.titulo);
  const numVisible = e.num_expediente && !/^[IVX]+-[0-9A-F]{12}$/.test(e.num_expediente) ? e.num_expediente : null;
  const actual = e.is_closed ? 4 : ORDEN_FASE[e.fase] ?? -1;
  const fechasFase = {};
  for (const t of [...tramites].reverse()) {
    const f = ['pleno', 'aprobacion'].includes(t.tipo) ? 'pleno'
      : ['ponencia', 'comision', 'dictamen'].includes(t.tipo) ? 'ponencia'
      : ['plazo_enmiendas', 'ampliacion_plazo', 'enmiendas_totalidad', 'enmiendas_parciales', 'comparecencias'].includes(t.tipo) ? 'enmiendas'
      : ['registro', 'admision', 'publicacion', 'criterio_gobierno', 'toma_consideracion'].includes(t.tipo) ? 'admision' : null;
    if (f && t.fecha && !fechasFase[f]) fechasFase[f] = t.fecha;
  }
  const leyes = Array.isArray(e.leyes_modificadas) ? e.leyes_modificadas : null;

  return (
    <div className="sec" style={{ maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, fontSize: 12.5, color: GRIS }}>
        <BackLink fallbackHref="/parlamentos-autonomicos" fallbackLabel="Parlamentos autonómicos" />
        <span>
          <Link href="/parlamentos-autonomicos" style={{ color: GRIS, textDecoration: 'none' }}>
            Parlamentos autonómicos
          </Link>{' '}
          › {CCAA[e.parlamento]}
          {numVisible ? ` · ${numVisible}` : ''}
        </span>
      </div>

      <div style={{ ...CARD, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <div style={{ fontSize: 12, color: e.tipo_norm === 'presupuestos' || e.tipo_norm === 'acompanamiento' ? MORADO : GRIS }}>
              {[ETIQUETA_TIPO[e.tipo_norm] || e.tipo, e.autor].filter(Boolean).join(' · ')}
            </div>
            <h1 style={{ fontSize: 22, lineHeight: 1.3, fontWeight: 600, margin: '6px 0 0', letterSpacing: '-.3px' }}>{titulo}</h1>
          </div>
          <FollowButton kind="ccaa" refId={e.id} label={titulo} />
        </div>

        <div className="ccaa-barra" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
          {FASES.map((f, i) => {
            const hecha = i < actual;
            const ahora = i === actual;
            return (
              <div key={f.id}>
                <div style={{ height: 6, borderRadius: 3, background: ahora ? MORADO : hecha ? '#1d6f5c' : '#e6e4dc' }}></div>
                <div style={{ fontSize: 12, marginTop: 6, fontWeight: ahora ? 600 : 400, color: hecha || ahora ? '#1a1a18' : GRIS }}>{f.nombre}</div>
                {fechasFase[f.id] && <div style={{ fontSize: 11.5, color: GRIS }}>{fechaCorta(fechasFase[f.id])}</div>}
              </div>
            );
          })}
        </div>

        <Ahora e={e} tramites={tramites} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ ...CARD, flex: '999 1 520px', minWidth: 0, padding: '22px 26px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>Todos los trámites</h2>
          {tramites.length === 0 ? (
            <p style={{ fontSize: 13, color: GRIS, margin: 0 }}>Todavía no conocemos ningún trámite.</p>
          ) : (
            tramites.map((t) => (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr)', gap: 14, padding: '11px 0', borderTop: '1px solid #efeee8', fontSize: 13 }}>
                <div style={{ color: GRIS }}>{fechaCorta(t.fecha) || '—'}</div>
                <div>
                  <div>{t.descripcion || '—'}</div>
                  {t.plazo_hasta && <div style={{ fontSize: 12.5, color: '#4b3bc4', marginTop: 2 }}>Hasta el {finDePlazoTexto(t.plazo_hasta)}</div>}
                  <div style={{ fontSize: 12, color: GRIS, marginTop: 3 }}>
                    {t.organo ? `${t.organo} · ` : ''}
                    <Fuente t={t} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...CARD, padding: '18px 20px', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ color: GRIS }}>Parlamento</div>
              <div>{NOMBRE_PARLAMENTO[e.parlamento]}</div>
            </div>
            {e.fecha_presentacion && (
              <div>
                <div style={{ color: GRIS }}>Registro</div>
                <div>{fechaLarga(e.fecha_presentacion)}</div>
              </div>
            )}
            {e.comision && (
              <div>
                <div style={{ color: GRIS }}>Comisión</div>
                <div>{e.comision}</div>
              </div>
            )}
            {hermana && (
              <div>
                <div style={{ color: GRIS }}>Va con</div>
                <Link href={`/parlamentos-autonomicos/${hermana.slug}`}>{tituloLegible(hermana.titulo)}</Link>
              </div>
            )}
            {e.url && (
              <a href={e.url} target="_blank" rel="noreferrer">
                Ver en el parlamento ↗
              </a>
            )}
          </div>

          {e.tipo_norm === 'acompanamiento' && (
            <div style={{ ...CARD, padding: '18px 20px', fontSize: 12.5, lineHeight: 1.5 }}>
              <div style={{ color: MORADO, fontWeight: 600, marginBottom: 6 }}>Leyes que modifica</div>
              {esPro === null ? null : esPro === false ? (
                <PanelBloqueado
                  titulo="Qué leyes cambia esta ley de acompañamiento"
                  descripcion="Cada ley que modifica, con su materia, para saber si toca la tuya."
                  filas={FILAS_LEYES}
                  forma="organo"
                />
              ) : leyes ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {leyes.map((l, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {l.ley}
                      {l.materia ? <span style={{ color: GRIS }}> · {l.materia}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: GRIS }}>Se completa cuando GovTalent lee el texto publicado del proyecto.</div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .ccaa-barra { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; row-gap: 12px !important; }
        }
      `}</style>
    </div>
  );
}
