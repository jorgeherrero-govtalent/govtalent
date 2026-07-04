'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from '@/lib/toast';

export default function AllJobsPage() {
  const supabase = createClient();
  const [org, setOrg] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('activos');
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return setLoading(false);

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', uid)
      .maybeSingle();

    if (!membership) return setLoading(false);
    setOrg(membership.organizations);

    const { data } = await supabase
      .from('jobs')
      .select('id, title, area, location, modality, status, created_at, job_applications(count)')
      .eq('organization_id', membership.organizations.id)
      .order('created_at', { ascending: false });

    setJobs(data || []);
    setLoading(false);
  }

  async function toggleStatus(job) {
    const newStatus = job.status === 'activa' ? 'pausada' : 'activa';
    setTogglingId(job.id);
    const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', job.id);
    setTogglingId(null);
    if (error) {
      toast('No se pudo actualizar el estado de la oferta');
      return;
    }
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: newStatus } : j)));
    toast(newStatus === 'activa' ? 'Oferta activada ✓' : 'Oferta desactivada ✓');
  }

  if (loading) return <div className="spinner"></div>;

  if (!org) {
    return (
      <div className="sec">
        <div className="empty-state">
          <i className="ti ti-building-off"></i>
          Todavía no administras ninguna organización.
        </div>
      </div>
    );
  }

  const activos = jobs.filter((j) => j.status === 'activa');
  const cerrados = jobs.filter((j) => j.status !== 'activa');
  const list = tab === 'activos' ? activos : cerrados;

  return (
    <div className="sec" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 10 }}>
        <Link href="/organizations/admin" style={{ fontSize: 12.5, color: '#1d6f5c', textDecoration: 'none' }}>
          <i className="ti ti-arrow-left"></i> Volver a mi organización
        </Link>
      </div>

      <div className="card">
        <div className="cp">
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Todas las ofertas</h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Gestiona los anuncios de empleo de {org.name}.</p>

          <div style={{ display: 'flex', gap: 6, borderBottom: '.5px solid #e0dfd8', marginBottom: 16 }}>
            <button
              onClick={() => setTab('activos')}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 14px',
                fontSize: 13.5,
                fontWeight: tab === 'activos' ? 600 : 400,
                color: tab === 'activos' ? '#1d6f5c' : '#888',
                borderBottom: tab === 'activos' ? '2px solid #1d6f5c' : '2px solid transparent',
              }}
            >
              Activos ({activos.length})
            </button>
            <button
              onClick={() => setTab('cerrados')}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 14px',
                fontSize: 13.5,
                fontWeight: tab === 'cerrados' ? 600 : 400,
                color: tab === 'cerrados' ? '#1d6f5c' : '#888',
                borderBottom: tab === 'cerrados' ? '2px solid #1d6f5c' : '2px solid transparent',
              }}
            >
              Cerrados ({cerrados.length})
            </button>
          </div>

          {list.length === 0 && (
            <div className="empty-state">
              <i className="ti ti-briefcase-off"></i>
              {tab === 'activos' ? 'No tienes ofertas activas ahora mismo.' : 'No tienes ofertas cerradas.'}
            </div>
          )}

          {list.map((j) => (
            <div key={j.id} style={{ padding: '14px 0', borderBottom: '.5px solid #f0f0eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{j.title}</div>
                  <div style={{ fontSize: 12.5, color: '#666', marginTop: 2 }}>{j.area}</div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                    {j.location} · {j.modality === 'presencial' ? 'Presencial' : j.modality === 'hibrido' ? 'Híbrido' : 'Remoto'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Link
                    href={`/organizations/admin/candidates?job=${j.id}`}
                    style={{ fontSize: 12.5, color: '#1d6f5c', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {j.job_applications?.[0]?.count || 0} solicitudes
                  </Link>
                  <button
                    className={j.status === 'activa' ? 'btn-o' : 'btn-p'}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                    disabled={togglingId === j.id}
                    onClick={() => toggleStatus(j)}
                  >
                    {togglingId === j.id
                      ? 'Actualizando...'
                      : j.status === 'activa'
                      ? 'Desactivar'
                      : 'Reactivar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
