import { createAdminClient } from '@/lib/supabase/admin';

export const metadata = { title: 'Dashboard · Backoffice GovTalent' };
export const dynamic = 'force-dynamic';

export default async function BackofficeDashboard() {
  const supabase = createAdminClient();

  const [candidates, orgs, orgsVerified, orgsUnverified, activeJobs, applications, applicationsThisWeek] =
    await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'candidate'),
      supabase.from('organizations').select('id', { count: 'exact', head: true }),
      supabase.from('organizations').select('id', { count: 'exact', head: true }).eq('verified', true),
      supabase.from('organizations').select('id', { count: 'exact', head: true }).eq('verified', false),
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'activa'),
      supabase.from('job_applications').select('id', { count: 'exact', head: true }),
      supabase
        .from('job_applications')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

  const cards = [
    { label: 'Candidatos registrados', value: candidates.count ?? 0, icon: 'ti-users' },
    { label: 'Organizaciones (total)', value: orgs.count ?? 0, icon: 'ti-building' },
    { label: 'Organizaciones verificadas', value: orgsVerified.count ?? 0, icon: 'ti-circle-check-filled', accent: '#1d9d63' },
    { label: 'Sin verificar', value: orgsUnverified.count ?? 0, icon: 'ti-clock', accent: '#c9902e' },
    { label: 'Ofertas activas', value: activeJobs.count ?? 0, icon: 'ti-briefcase' },
    { label: 'Candidaturas (total)', value: applications.count ?? 0, icon: 'ti-file-text' },
    { label: 'Candidaturas (7 días)', value: applicationsThisWeek.count ?? 0, icon: 'ti-trending-up', accent: '#6d5aef' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Dashboard</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Estado general de la plataforma, en tiempo real.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              background: '#fff',
              border: '.5px solid #e0dfd8',
              borderRadius: 12,
              padding: '18px 20px',
            }}
          >
            <i
              className={`ti ${c.icon}`}
              style={{ fontSize: 18, color: c.accent || '#1d6f5c', marginBottom: 10, display: 'block' }}
            ></i>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#1a1a18' }}>{c.value}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
