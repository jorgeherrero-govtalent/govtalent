'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PestanasParlamento, CabeceraParlamento, LogoGrupoCcaa, Vacio } from '@/components/ParlamentoAutonomico';
import { PARLAMENTOS_UI, base, useComposicion, normalizar, fechaCorta, esComision } from '@/lib/ccaa/composicionUI';

/**
 * Grupos parlamentarios de un parlamento autonómico. Copia de la de
 * Grupos del Congreso: tarjeta con logo, nombre, portavocías y, al pie,
 * diputados y técnicos del grupo.
 */
export default function GruposAutonomicosPage() {
  const { p } = useParams();
  const cfg = PARLAMENTOS_UI[p];
  const { datos, error } = useComposicion(p);
  const [search, setSearch] = useState('');

  const grupos = useMemo(() => {
    if (!datos) return null;
    return datos.grupos.map((g) => {
      const diputados = datos.diputados.filter((d) => d.grupo_id === g.id).length;
      const portavocias = datos.cargos.filter(
        (c) => c.diputado_id && c.cargo_norm === 'portavoz' && c.comision_id && datos.diputadoPorId[c.diputado_id]?.grupo_id === g.id && esComision(datos.comisionPorId[c.comision_id])
      ).length;
      return { ...g, diputados, portavocias, tecnicos: (datos.tecnicos[g.id] || []).length };
    }).sort((a, b) => b.diputados - a.diputados);
  }, [datos]);

  const filtered = (grupos || []).filter((g) => normalizar(g.nombre).includes(normalizar(search)));

  if (!cfg) return <div className="sec"><Vacio texto="No tenemos este parlamento." /></div>;

  return (
    <div className="sec" style={{ maxWidth: 1080 }}>
      <CabeceraParlamento p={p} titulo="Grupos parlamentarios" datos={datos} />
      <PestanasParlamento p={p} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '.5px solid #e0dfd8', borderRadius: 20, padding: '8px 16px', marginBottom: 16, maxWidth: 380 }}>
        <i className="ti ti-search" style={{ color: '#999', fontSize: 14 }}></i>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar grupo parlamentario..."
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, width: '100%' }}
        />
      </div>

      {error ? (
        <Vacio icono="ti-alert-circle" texto="No se ha podido cargar la composición. Inténtalo de nuevo en un momento." />
      ) : grupos === null ? (
        <div className="spinner"></div>
      ) : filtered.length === 0 ? (
        <Vacio icono="ti-flag-off" texto={grupos.length ? 'No hay grupos que coincidan con la búsqueda.' : `Aún no hemos cargado los grupos de la ${cfg.nombre}.`} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.map((g) => (
            <Link key={g.id} href={`${base(p)}/grupos/${g.slug}`} className="card" style={{ padding: 16, textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 13 }}>
                <LogoGrupoCcaa grupo={g} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>{g.nombre}</div>
                  <div style={{ fontSize: 10.5, color: '#999', marginTop: 3 }}>
                    {g.portavocias > 0
                      ? `${g.portavocias} ${g.portavocias === 1 ? 'portavocía' : 'portavocías'}`
                      : g.fecha_constitucion
                        ? `Constituido el ${fechaCorta(g.fecha_constitucion)}`
                        : `${cfg.legislatura} Legislatura`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, paddingTop: 12, borderTop: '.5px solid #f0f0eb' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1d6f5c' }}>{g.diputados.toLocaleString('es-ES')}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>{g.diputados === 1 ? 'diputado' : 'diputados'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{g.tecnicos.toLocaleString('es-ES')}</div>
                  <div style={{ fontSize: 10, color: '#999' }}>{g.tecnicos === 1 ? 'técnico' : 'técnicos'}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
