'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const TYPE_LABELS = {
  empresa: 'Empresa',
  consultora_public_affairs: 'Consultora',
  tercer_sector_ong: 'ONG / Tercer sector',
  partido_politico: 'Partido político',
  institucion_publica: 'Institución pública',
  think_tank_fundacion: 'Think tank',
  medios_comunicacion: 'Medios',
  universidad_centro_educativo: 'Centro educativo',
  asociacion_profesional: 'Asociación profesional',
  otro: 'Otro',
};

export default function OrganizationsDirectory() {
  const supabase = createClient();
  const [orgs, setOrgs] = useState(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');

  useEffect(() => {
    load();
  }, [type]);

  async function load() {
    let q = supabase.from('organizations').select('*').order('created_at', { ascending: false });
    if (type) q = q.eq('org_type', type);
    const { data } = await q;
    setOrgs(data || []);
  }

  const filtered = orgs?.filter((o) => o.name.toLowerCase().includes(name.toLowerCase())) || [];

  return (
    <div className="sec">
      <div className="dir-hero">
        <h1>
          El buscador de <em>organizaciones de asuntos públicos y gobierno</em>
        </h1>
        <p style={{ fontSize: 14, color: '#777', marginBottom: 26 }}>
          Encuentra cualquier tipo de organización vinculada al sector de los asuntos públicos, la
          política y el gobierno
        </p>
        <div className="card" style={{ maxWidth: 1080, margin: '0 auto 26px', padding: '18px 20px', textAlign: 'left' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div className="form-g" style={{ marginBottom: 0 }}>
              <label>Nombre</label>
              <input
                placeholder="Nombre de la organización"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-g" style={{ marginBottom: 0 }}>
              <label>Tipo de organización</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Todos los tipos</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {orgs === null ? (
        <div className="spinner"></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div className="empty-state">
            <i className="ti ti-building-off"></i>
            Todavía no hay organizaciones que coincidan con tu búsqueda.
          </div>
        </div>
      ) : (
        <div className="dir-grid">
          {filtered.map((o) => (
            <Link href={`/organizations/${o.slug}`} className="dir-card" key={o.id}>
              <div className="dir-card-top">
                <div className="dir-logo">
                  {o.logo_url ? <img src={o.logo_url} alt="" /> : <i className="ti ti-building"></i>}
                </div>
                <div>
                  <div className="dir-name">
                    {o.name} {o.verified && <i className="ti ti-rosette-discount-check"></i>}
                  </div>
                </div>
              </div>
              {o.location && (
                <div className="dir-loc">
                  <i className="ti ti-map-pin"></i> {o.location}
                </div>
              )}
              {o.claimed === false && (
                <div className="badge bgr" style={{ display: 'inline-flex', marginBottom: 8, width: 'fit-content' }}>
                  <i className="ti ti-clock" style={{ fontSize: 11 }}></i> Pendiente de verificar
                </div>
              )}
              <div className="dir-tags">
                <div className="dir-tag">
                  <i className="ti ti-briefcase"></i> {TYPE_LABELS[o.org_type]}
                </div>
                {o.sector && <div className="dir-tag">{o.sector}</div>}
              </div>
              <button className="dir-btn">Ver página</button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
