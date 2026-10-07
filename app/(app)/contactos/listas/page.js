'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Paginacion, { usePaginacion } from '@/components/Paginacion';
import { ESTILOS_CONTACTOS, MORADO, BORDE, GRIS, miles } from '@/components/ContactosUI';

/**
 * Listas (Buscar y enriquecer, sql/76). Las listas que ve el usuario —las
 * suyas y las de su organización— con sus cifras y los cambios
 * detectados: salidas, cambios de cargo o de contacto e incorporaciones.
 * Se crean desde el buscador de Contactos.
 */

function haceCuanto(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  if (dias < 14) return 'Hace 1 semana';
  if (dias < 60) return `Hace ${Math.floor(dias / 7)} semanas`;
  return d.toLocaleDateString('es-ES');
}

export default function ListasPage() {
  const [listas, setListas] = useState(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [soloCambios, setSoloCambios] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/contactos/listas', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!vivo) return;
        if (res.status === 403) {
          setBloqueado(true);
          setListas([]);
          return;
        }
        if (!res.ok) throw new Error(json.error || 'No se pudieron cargar las listas');
        setListas(json.listas || []);
      } catch (e) {
        if (vivo) {
          setError(e.message);
          setListas([]);
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (listas || []).filter((l) => (!t || l.nombre.toLowerCase().includes(t)) && (!soloCambios || l.n_cambios > 0));
  }, [listas, q, soloCambios]);

  const pag = usePaginacion(filtradas.length, [q, soloCambios]);
  const pagina = filtradas.slice(pag.desde, pag.hasta);

  return (
    <div className="gt-ct">
      <style>{ESTILOS_CONTACTOS}</style>
      <div className="gt-ct-cab">
        <div>
          <h1>Listas</h1>
          <p>Tus listas y las de tu equipo. Te avisan cuando alguien cambia de cargo, deja de figurar o aparece alguien nuevo.</p>
        </div>
        {!bloqueado && (
          <Link href="/contactos" className="btn-ai" style={{ textDecoration: 'none' }}>
            <i className="ti ti-plus" aria-hidden="true"></i> Nueva lista
          </Link>
        )}
      </div>
      <nav className="gt-ct-tabs" aria-label="Buscar y enriquecer">
        <Link href="/contactos">Buscador</Link>
        <Link href="/contactos/listas" className="on" aria-current="page">
          Listas
        </Link>
      </nav>

      {listas === null && <div className="spinner"></div>}

      {bloqueado && (
        <div style={{ maxWidth: 560, margin: '32px auto 0', border: `1px solid ${BORDE}`, borderRadius: 16, padding: 24, background: '#fff', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            <i className="ti ti-lock" style={{ color: MORADO, marginRight: 6 }} aria-hidden="true"></i>
            Disponible con el Directorio
          </span>
          <p style={{ margin: 0, fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>
            Guarda listas de contactos que se mantienen al día: te avisan de los nombramientos, ceses y cambios de cargo.
          </p>
          <Link href="/precios" className="btn-ai" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
            Ver planes
          </Link>
        </div>
      )}

      {error && <div className="gt-ct-aviso">{error}</div>}

      {listas && !bloqueado && listas.length === 0 && !error && (
        <div style={{ maxWidth: 560, margin: '32px auto 0', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Todavía no tienes listas</span>
          <p style={{ margin: 0, fontSize: 13.5, color: GRIS, lineHeight: 1.6 }}>
            Busca en Contactos y pulsa «Guardar como lista», o selecciona personas y «Añadir a lista».
          </p>
          <Link href="/contactos" className="btn-p" style={{ textDecoration: 'none' }}>
            Ir al buscador
          </Link>
        </div>
      )}

      {listas && listas.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <input className="gt-ct-in" style={{ maxWidth: 260, fontSize: 13, padding: '8px 10px' }} placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar listas" />
            <label className="gt-ct-chk">
              <input type="checkbox" checked={soloCambios} onChange={(e) => setSoloCambios(e.target.checked)} />
              Con cambios
            </label>
          </div>
          <div className="gt-ct-tabla">
            <table style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Contactos</th>
                  <th>Con email</th>
                  <th>Creada por</th>
                  <th>Actualizada</th>
                </tr>
              </thead>
              <tbody>
                {pagina.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/contactos/listas/${l.id}`} style={{ color: '#1a1a18', fontWeight: 500, textDecoration: 'none' }}>
                        {l.nombre}
                      </Link>
                      <div style={{ marginTop: 3 }}>
                        {l.n_cambios > 0 ? (
                          <Link href={`/contactos/listas/${l.id}`} style={{ fontSize: 12, fontWeight: 600, color: MORADO, textDecoration: 'none' }}>
                            {miles(l.n_cambios)} {l.n_cambios === 1 ? 'cambio' : 'cambios'}
                          </Link>
                        ) : (
                          <span style={{ fontSize: 12, color: GRIS }}>Sin cambios</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="gt-ct-pill">{miles(l.n_miembros)}</span>
                    </td>
                    <td>
                      <span className="gt-ct-pill">{miles(l.n_con_email)}</span>
                    </td>
                    <td>{l.mia ? 'Tú' : l.creada_por}</td>
                    <td style={{ color: GRIS }}>{haceCuanto(l.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginacion pag={pag} dentro />
          </div>
        </>
      )}
    </div>
  );
}
