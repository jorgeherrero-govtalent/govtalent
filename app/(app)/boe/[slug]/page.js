'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import BackLink from '@/components/BackLink';
import FollowButton from '@/components/FollowButton';

/**
 * Ficha de una disposición del BOE.
 *
 * El texto no se guarda: se enlaza al boletín. Nadie lee una ley en la
 * pantalla de un intermediario, y almacenarlo multiplicaría la base sin
 * aportar nada.
 *
 * Lo que aporta la ficha es el contexto: sobre qué normas actúa esta, y
 * qué más se ha publicado en su sector y por su ministerio. Eso responde
 * a "qué me afecta como organización", que es la pregunta de quien llega
 * nuevo y todavía no sigue nada.
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaLarga(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MESES_C[d.getMonth()]}`;
}

const CARD = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 2px rgba(0,0,0,.04)' };
const LABEL = { fontSize: 11, color: '#a8a49c', letterSpacing: '.4px', marginBottom: 14 };
const ENLACE = { fontSize: 12, color: '#8b8780', textDecoration: 'none' };

export default function BoeDetailPage() {
  const supabase = createClient();
  const { slug } = useParams();

  const [item, setItem] = useState(undefined);
  const [referencias, setReferencias] = useState([]);
  const [delSector, setDelSector] = useState([]);
  const [delMinisterio, setDelMinisterio] = useState([]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.from('boe_directory').select('*').eq('slug', slug).limit(1).maybeSingle();
      if (cancelled) return;
      if (!data) {
        setItem(null);
        return;
      }
      setItem(data);

      const [{ data: refs }, { data: sec }, { data: min }] = await Promise.all([
        supabase.from('boe_detail').select('*').eq('document_id', data.id),
        // Más del mismo sector. Solo si la norma tiene alerta: las
        // "otras disposiciones" están clasificadas al 12%.
        data.sector
          ? supabase
              .from('boe_directory')
              .select('id, slug, titulo, fecha_publicacion, departamento')
              .contains('sectores', [data.sector])
              .neq('id', data.id)
              .order('fecha_publicacion', { ascending: false })
              .limit(4)
          : Promise.resolve({ data: [] }),
        // Y del mismo ministerio, que sí viene siempre
        supabase
          .from('boe_directory')
          .select('id, slug, titulo, fecha_publicacion, rango')
          .eq('departamento_codigo', data.departamento_codigo)
          .neq('id', data.id)
          .order('fecha_publicacion', { ascending: false })
          .limit(4),
      ]);

      if (cancelled) return;
      setReferencias(refs || []);
      setDelSector(sec || []);
      setDelMinisterio(min || []);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (item === undefined) {
    return (
      <div className="sec" style={{ maxWidth: 860 }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (item === null) {
    return (
      <div className="sec" style={{ maxWidth: 860 }}>
        <div className="card">
          <div className="empty-state">
            <i className="ti ti-file-off"></i>
            No se ha encontrado esta disposición.
          </div>
        </div>
        <BackLink fallbackHref="/boe" fallbackLabel="Volver al BOE" />
      </div>
    );
  }

  const materias = (item.materias || []).filter((m) => !(item.sectores || []).includes(m));

  return (
    <div className="sec" style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <BackLink fallbackHref="/boe" fallbackLabel="BOE" />
        <span style={{ fontSize: 11.5, color: '#e0dfd8' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#a8a49c' }}>
          <Link href="/regulatorio" style={{ color: '#a8a49c', textDecoration: 'none' }}>
            Regulatorio
          </Link>
          {' › '}
          <Link href="/boe" style={{ color: '#a8a49c', textDecoration: 'none' }}>
            BOE
          </Link>
          {' › '}
          <span style={{ color: '#8b8780' }}>{item.id}</span>
        </span>
      </div>

      <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          {item.sector && (
            <span style={{ fontSize: 11, color: '#3C3489', background: '#f0eefe', padding: '4px 10px', borderRadius: 13 }}>
              {item.sector}
            </span>
          )}
          <span style={{ fontSize: 11, color: '#a8a49c' }}>
            {[item.rango, fechaCorta(item.fecha_publicacion)].filter(Boolean).join(' · ')}
          </span>
          {item.derogado && (
            <span style={{ fontSize: 11, color: '#9a3412', background: '#fef3ec', padding: '4px 10px', borderRadius: 13 }}>
              Derogada
            </span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: 16, fontWeight: 500, margin: 0, lineHeight: 1.4, letterSpacing: '-.2px' }}>
              {item.titulo}
            </h1>
            <div style={{ fontSize: 11.5, color: '#8b8780', marginTop: 8 }}>{item.departamento}</div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <FollowButton kind="boe" refId={item.id} label={item.titulo} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 22, paddingTop: 15, marginTop: 15, borderTop: '.5px solid #f2f0ec', flexWrap: 'wrap' }}>
          {item.url_html && (
            <a
              href={item.url_html}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12.5, color: '#6d5aef', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <i className="ti ti-file-text" style={{ fontSize: 15 }}></i> Leer el texto completo
            </a>
          )}
          {item.url_pdf && (
            <a
              href={item.url_pdf}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12.5, color: '#8b8780', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <i className="ti ti-download" style={{ fontSize: 15 }}></i> PDF
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12, marginBottom: 12 }}>
        {referencias.length > 0 && (
          <div style={{ ...CARD, padding: 18 }}>
            <div style={LABEL}>SOBRE QUÉ NORMAS ACTÚA</div>
            {referencias.slice(0, 5).map((r, i) => {
              const cuerpo = (
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  {r.palabra && <span style={{ color: '#a8a49c' }}>{r.palabra.toLowerCase()} </span>}
                  {/* texto primero: el BOE da ahí la frase exacta —"la
                      disposición final 7 del Real Decreto 611/2026"— y el
                      título completo solo cuando no hay texto. Al revés se
                      perdía la parte que dice QUÉ se modifica. */}
                  <span style={{ color: '#1a1a18' }}>{r.texto || r.referencia_titulo || r.referencia_id}</span>
                </div>
              );
              return r.tenemos_ficha && r.referencia_slug ? (
                <Link
                  key={`${r.referencia_id}-${i}`}
                  href={`/boe/${r.referencia_slug}`}
                  style={{ display: 'block', padding: '7px 0', textDecoration: 'none' }}
                >
                  {cuerpo}
                </Link>
              ) : (
                <div key={`${r.referencia_id}-${i}`} style={{ padding: '7px 0' }}>
                  {cuerpo}
                </div>
              );
            })}
            {referencias.length > 5 && (
              <div style={{ fontSize: 11, color: '#a8a49c', paddingTop: 9 }}>Y {referencias.length - 5} más.</div>
            )}
          </div>
        )}

        {materias.length > 0 && (
          <div style={{ ...CARD, padding: 18 }}>
            <div style={LABEL}>MATERIAS</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {materias.map((m) => (
                <span
                  key={m}
                  style={{ fontSize: 11, color: '#57534e', background: '#f5f4f1', padding: '4px 10px', borderRadius: 13 }}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {delSector.length > 0 && (
        <div style={{ ...CARD, padding: 20, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 15, gap: 10, flexWrap: 'wrap' }}>
            <div style={LABEL}>MÁS SOBRE {item.sector?.toUpperCase()}</div>
            <Link href={`/boe?sector=${encodeURIComponent(item.sector)}`} style={ENLACE}>
              Ver todas
            </Link>
          </div>
          {delSector.map((d) => (
            <Link
              key={d.id}
              href={`/boe/${d.slug}`}
              style={{
                display: 'flex',
                gap: 14,
                padding: '11px 0',
                borderTop: '.5px solid #f2f0ec',
                alignItems: 'flex-start',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span style={{ fontSize: 10.5, color: '#a8a49c', whiteSpace: 'nowrap', flexShrink: 0, minWidth: 46 }}>
                {fechaCorta(d.fecha_publicacion)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{d.titulo}</div>
                <div style={{ fontSize: 11, color: '#a8a49c', marginTop: 3 }}>{d.departamento}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {delMinisterio.length > 0 && (
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 15, gap: 10, flexWrap: 'wrap' }}>
            <div style={LABEL}>DEL MISMO MINISTERIO</div>
          </div>
          {delMinisterio.map((d) => (
            <Link
              key={d.id}
              href={`/boe/${d.slug}`}
              style={{
                display: 'flex',
                gap: 14,
                padding: '11px 0',
                borderTop: '.5px solid #f2f0ec',
                alignItems: 'flex-start',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <span style={{ fontSize: 10.5, color: '#a8a49c', whiteSpace: 'nowrap', flexShrink: 0, minWidth: 46 }}>
                {fechaCorta(d.fecha_publicacion)}
              </span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45 }}>{d.titulo}</div>
            </Link>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 11, color: '#a8a49c', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        Publicado en el BOE el {fechaLarga(item.fecha_publicacion)}.
      </div>
    </div>
  );
}
