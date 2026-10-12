'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import { Avatar, LogoGrupoCcaa, Vacio } from '@/components/ParlamentoAutonomico';
import { PARLAMENTOS_UI, base, useComposicion, limpiarComision, normalizar, fechaCorta, esComision } from '@/lib/ccaa/composicionUI';

/**
 * Ficha de un grupo parlamentario autonómico. Copia de la del Congreso:
 * cabecera con logo y cifras, y pestañas Resumen · Portavoces ·
 * Diputados · Equipo. El equipo son los técnicos del grupo que publica
 * la Asamblea en sus datos abiertos (sin correo: no se publica).
 */

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'portavoces', label: 'Portavoces' },
  { id: 'diputados', label: 'Diputados' },
  { id: 'equipo', label: 'Equipo' },
];

const CARD = { background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 12, padding: 18 };
const LABEL = { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 13 };
const FILA = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '.5px solid #f0f0eb', textDecoration: 'none', color: 'inherit' };
const BUSCADOR = { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 20, padding: '7px 14px', flex: '1 1 180px' };
const INPUT = { border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' };
const VER_MAS = { fontSize: 11, color: '#1d6f5c', fontWeight: 600, paddingTop: 10, cursor: 'pointer' };
const chip = (activo) => ({
  background: activo ? '#e8f4f0' : '#fff',
  border: `.5px solid ${activo ? '#1d6f5c' : '#e0dfd8'}`,
  color: activo ? '#1d6f5c' : '#555',
  borderRadius: 20,
  padding: '7px 13px',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

function Buscador({ value, onChange, placeholder }) {
  return (
    <div style={BUSCADOR}>
      <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={INPUT} />
    </div>
  );
}

export default function GrupoAutonomicoPage() {
  const { p, slug } = useParams();
  const cfg = PARLAMENTOS_UI[p];
  const { datos, error } = useComposicion(p);
  const [tab, setTab] = useState('resumen');
  const [buscarPortavoz, setBuscarPortavoz] = useState('');
  const [buscarDiputado, setBuscarDiputado] = useState('');
  const [soloDestacados, setSoloDestacados] = useState(false);
  const [buscarTecnico, setBuscarTecnico] = useState('');

  const grupo = useMemo(() => datos?.grupos.find((g) => g.slug === slug) || null, [datos, slug]);

  const { diputados, portavoces, cargosGrupo, tecnicos } = useMemo(() => {
    if (!grupo) return { diputados: [], portavoces: [], cargosGrupo: [], tecnicos: [] };
    const diputados = datos.diputados.filter((d) => d.grupo_id === grupo.id);
    const ids = new Set(diputados.map((d) => d.id));
    const portavoces = datos.cargos
      .filter((c) => ids.has(c.diputado_id) && c.cargo_norm === 'portavoz' && c.comision_id && esComision(datos.comisionPorId[c.comision_id]))
      .map((c) => ({ ...c, d: datos.diputadoPorId[c.diputado_id], com: datos.comisionPorId[c.comision_id] }))
      .sort((a, b) => a.com.nombre.localeCompare(b.com.nombre));
    // Portavoz y adjuntos del grupo: los que lo representan en la Junta de Portavoces.
    const cargosGrupo = datos.cargos
      .filter((c) => ids.has(c.diputado_id) && /junta de (portav(oces|eus)|s[ií]ndics)/i.test(datos.comisionPorId[c.comision_id]?.nombre || '') && (c.cargo_norm === 'portavoz' || c.cargo_norm === 'portavoz_adjunto'))
      .map((c) => ({ ...c, d: datos.diputadoPorId[c.diputado_id] }))
      .sort((a, b) => (a.cargo_norm === 'portavoz' ? 0 : 1) - (b.cargo_norm === 'portavoz' ? 0 : 1) || a.cargo.localeCompare(b.cargo));
    return { diputados, portavoces, cargosGrupo, tecnicos: datos.tecnicos[grupo.id] || [] };
  }, [grupo, datos]);

  const conPortavocia = useMemo(() => new Set(portavoces.map((x) => x.diputado_id)), [portavoces]);

  const portavocesFiltrados = useMemo(() => {
    const q = normalizar(buscarPortavoz);
    return q ? portavoces.filter((x) => normalizar(x.d.nombre).includes(q) || normalizar(x.com.nombre).includes(q)) : portavoces;
  }, [portavoces, buscarPortavoz]);

  const diputadosFiltrados = useMemo(() => {
    let l = diputados;
    if (soloDestacados) l = l.filter((d) => conPortavocia.has(d.id));
    const q = normalizar(buscarDiputado);
    if (q) l = l.filter((d) => normalizar(d.nombre).includes(q));
    return l;
  }, [diputados, buscarDiputado, soloDestacados, conPortavocia]);

  const tecnicosFiltrados = useMemo(() => {
    const q = normalizar(buscarTecnico);
    return q ? tecnicos.filter((t) => normalizar(t.nombre).includes(q)) : tecnicos;
  }, [tecnicos, buscarTecnico]);

  if (!cfg) return <div className="sec"><Vacio texto="No tenemos este parlamento." /></div>;
  if (error) return <div className="sec" style={{ maxWidth: 900 }}><Vacio icono="ti-alert-circle" texto="No se ha podido cargar el grupo." /></div>;
  if (!datos) return <div className="sec" style={{ maxWidth: 900 }}><div className="spinner"></div></div>;
  if (!grupo) {
    return (
      <div className="sec" style={{ maxWidth: 900 }}>
        <Vacio icono="ti-flag-off" texto="No se ha encontrado este grupo parlamentario." />
        <BackLink fallbackHref={`${base(p)}/grupos`} fallbackLabel="Volver a Grupos" />
      </div>
    );
  }

  const corto = grupo.nombre.replace(/^Grupo Parlamentario\s*/i, '');

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <BackLink fallbackHref={`${base(p)}/grupos`} fallbackLabel="Grupos" />
        <span style={{ fontSize: 11.5, color: '#ddd' }}>|</span>
        <span style={{ fontSize: 11.5, color: '#999' }}>
          <Link href="/institutions" style={{ color: '#999', textDecoration: 'none' }}>
            Instituciones
          </Link>
          {' › '}
          <Link href="/institutions/comunidades" style={{ color: '#999', textDecoration: 'none' }}>
            Comunidades autónomas
          </Link>
          {' › '}
          <Link href={`${base(p)}/grupos`} style={{ color: '#999', textDecoration: 'none' }}>
            {cfg.nombre}
          </Link>
          {' › '}
          <span style={{ color: '#666' }}>{corto}</span>
        </span>
      </div>

      <div style={{ ...CARD, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <LogoGrupoCcaa grupo={grupo} size={56} radius={12} />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{grupo.nombre}</h1>
            <div style={{ fontSize: 12, color: '#555', marginTop: 5, lineHeight: 1.6 }}>
              {[
                `${diputados.length} ${diputados.length === 1 ? 'diputado' : 'diputados'}`,
                portavoces.length ? `portavoz en ${portavoces.length} ${portavoces.length === 1 ? 'comisión' : 'comisiones'}` : null,
                tecnicos.length ? `${tecnicos.length} ${tecnicos.length === 1 ? 'técnico' : 'técnicos'}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>
              {cfg.nombre} · {cfg.legislatura} Legislatura
              {grupo.fecha_constitucion ? ` · constituido el ${fechaCorta(grupo.fecha_constitucion)}` : ''}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, borderBottom: '.5px solid #e0dfd8', marginBottom: 15, overflowX: 'auto' }}>
        {TABS.map((t) => {
          const n = t.id === 'portavoces' ? portavoces.length : t.id === 'diputados' ? diputados.length : t.id === 'equipo' ? tecnicos.length : null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                fontSize: 12.5,
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? '#1d6f5c' : '#888',
                border: 'none',
                borderBottom: `2px solid ${tab === t.id ? '#1d6f5c' : 'transparent'}`,
                background: 'none',
                padding: '0 0 9px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}{' '}
              {n !== null && n > 0 && <span style={{ color: tab === t.id ? '#9cc4b8' : '#bbb' }}>{n.toLocaleString('es-ES')}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {(cargosGrupo.length > 0 || portavoces.length > 0) && (
            <div style={CARD}>
              <div style={LABEL}>A quién dirigirte</div>
              {cargosGrupo.slice(0, 3).map((c) => (
                <Link key={c.id} href={`${base(p)}/diputados/${c.d.slug}`} style={FILA}>
                  <Avatar nombre={c.d.nombre} url={c.d.foto_url} size={28} tono="gris" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{c.d.nombre}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>{c.cargo} del grupo</div>
                  </div>
                </Link>
              ))}
              {portavoces.slice(0, Math.max(0, 4 - Math.min(3, cargosGrupo.length))).map((x) => (
                <Link key={x.id} href={`${base(p)}/diputados/${x.d.slug}`} style={FILA}>
                  <Avatar nombre={x.d.nombre} url={x.d.foto_url} size={28} tono="gris" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{x.d.nombre}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>{limpiarComision(x.com.nombre)}</div>
                  </div>
                </Link>
              ))}
              {portavoces.length > 0 && (
                <div onClick={() => setTab('portavoces')} style={VER_MAS}>
                  Ver los {portavoces.length} →
                </div>
              )}

              {tecnicos.length > 0 && (
                <div style={{ borderTop: '.5px solid #f0f0eb', marginTop: 13, paddingTop: 14 }}>
                  <div style={{ ...LABEL, marginBottom: 11 }}>Equipo del grupo</div>
                  {tecnicos.slice(0, 3).map((t) => (
                    <div key={t.id} style={{ ...FILA, padding: '6px 0' }}>
                      <Avatar nombre={t.nombre} size={26} tono="gris" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{t.nombre}</div>
                        <div style={{ fontSize: 10, color: '#999' }}>{t.cargo}</div>
                      </div>
                    </div>
                  ))}
                  <div onClick={() => setTab('equipo')} style={VER_MAS}>
                    Ver los {tecnicos.length} →
                  </div>
                </div>
              )}
            </div>
          )}

          {diputados.length > 0 && (
            <div style={CARD}>
              <div style={LABEL}>Quiénes son · {diputados.length}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {diputados.slice(0, 24).map((d) => (
                  <Link key={d.id} href={`${base(p)}/diputados/${d.slug}`} title={d.nombre}>
                    <Avatar nombre={d.nombre} url={d.foto_url} size={34} tono="gris" />
                  </Link>
                ))}
              </div>
              <div onClick={() => setTab('diputados')} style={VER_MAS}>
                Ver los {diputados.length} →
              </div>
            </div>
          )}

          {diputados.length === 0 && <Vacio icono="ti-file-off" texto="Aún no tenemos la composición de este grupo." />}
        </div>
      )}

      {tab === 'portavoces' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <Buscador value={buscarPortavoz} onChange={setBuscarPortavoz} placeholder="Buscar por nombre o comisión..." />
          </div>
          <div style={CARD}>
            {portavocesFiltrados.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-microphone-off"></i>
                {portavoces.length === 0 ? 'No consta ningún portavoz de este grupo en las comisiones.' : 'Ningún portavoz con estos filtros.'}
              </div>
            ) : (
              portavocesFiltrados.map((x) => (
                <Link key={x.id} href={`${base(p)}/diputados/${x.d.slug}`} style={FILA}>
                  <Avatar nombre={x.d.nombre} url={x.d.foto_url} size={32} tono="gris" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{x.d.nombre}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>Portavoz en {limpiarComision(x.com.nombre)}</div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
                </Link>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'diputados' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <Buscador value={buscarDiputado} onChange={setBuscarDiputado} placeholder="Buscar por nombre..." />
            <span onClick={() => setSoloDestacados((v) => !v)} style={chip(soloDestacados)}>
              Con portavocía ({conPortavocia.size})
            </span>
          </div>
          <div style={CARD}>
            {diputadosFiltrados.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-user-off"></i>
                {diputados.length === 0 ? 'No hay diputados registrados en este grupo.' : 'Ningún diputado con estos filtros.'}
              </div>
            ) : (
              diputadosFiltrados.map((d) => (
                <Link key={d.id} href={`${base(p)}/diputados/${d.slug}`} style={FILA}>
                  <Avatar nombre={d.nombre} url={d.foto_url} size={32} tono="gris" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.nombre}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>{d.circunscripcion || cfg.ccaa}</div>
                  </div>
                  {conPortavocia.has(d.id) && (
                    <span style={{ fontSize: 10, background: '#e8f4f0', color: '#1d6f5c', padding: '3px 9px', borderRadius: 10, whiteSpace: 'nowrap', flexShrink: 0 }}>Portavoz</span>
                  )}
                  <i className="ti ti-chevron-right" style={{ color: '#ccc', fontSize: 14, flexShrink: 0 }}></i>
                </Link>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'equipo' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <Buscador value={buscarTecnico} onChange={setBuscarTecnico} placeholder="Buscar por nombre..." />
          </div>
          <div style={CARD}>
            {tecnicosFiltrados.length === 0 ? (
              <div className="empty-state">
                <i className="ti ti-users-group"></i>
                {tecnicos.length === 0 ? 'No consta personal técnico a disposición de este grupo.' : 'Nadie con esta búsqueda.'}
              </div>
            ) : (
              tecnicosFiltrados.map((t) => (
                <div key={t.id} style={FILA}>
                  <Avatar nombre={t.nombre} size={32} tono="gris" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.nombre}</div>
                    <div style={{ fontSize: 10.5, color: '#999', marginTop: 1 }}>
                      {[t.cargo, t.fecha_inicio ? `desde ${fechaCorta(t.fecha_inicio)}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: '#a8a49c', flexShrink: 0 }}>sin correo publicado</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <i className="ti ti-shield-check" style={{ fontSize: 13 }}></i>
        {tab === 'equipo' && p === 'madrid' ? `Datos abiertos ${cfg.deNombre} (ocupaciones).` : `Datos ${cfg.deNombre}.`}
        {(grupo.url || grupo.id_fuente) && (
          <a href={grupo.id_fuente ? cfg.fichaGrupo(grupo.id_fuente) : grupo.url} target="_blank" rel="noreferrer" style={{ color: '#1d6f5c' }}>
            Ver la ficha oficial ↗
          </a>
        )}
      </div>
    </div>
  );
}
