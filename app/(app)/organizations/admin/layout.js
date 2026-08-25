'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { planLabel, sidebarTrialLabel } from '@/lib/plan';

/**
 * Talento: todo lo que es contratar, en un solo sitio.
 *
 * ANTES ERA UNA LATERAL DE SIETE ENTRADAS. Se queda en tres pestañas y
 * el resto se recoloca:
 *
 *   Dashboard              se disuelve — era una pantalla entera para
 *                          tres cifras y una lista que ya está en la
 *                          pestaña de al lado. Las cifras suben aquí.
 *   Página de empresa      entra en Talento: es lo que ve un candidato
 *                          cuando le llega tu oferta.
 *   Transparencia          pasa a ser una sección dentro de esa página.
 *   Plan                   sube al menú de la esquina: es facturación,
 *                          no trabajo diario.
 *   Directorio inteligente sale del menú hasta decidir dónde vive. La
 *                          ruta sigue funcionando.
 */

const BORDE = '#e0dfd8';

// Nombradas por lo que se hace, no por lo que contienen: "Ofertas" no
// dice si sirve para verlas o para publicarlas.
const PESTANAS = [
  { href: '/organizations/admin/company', label: 'Editar página' },
  { href: '/organizations/admin/jobs', label: 'Publicar oferta' },
  { href: '/organizations/admin/candidates', label: 'Gestionar candidatos' },
  { href: '/organizations/admin/plan', label: 'Plan' },
  { href: '/organizations/admin/settings', label: 'Configuración' },
];

export default function OrganizationAdminLayout({ children }) {
  const pathname = usePathname();
  const [org, setOrg] = useState(null);
  const [cifras, setCifras] = useState(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return;

    const { data: membresia } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(id, name, slug, logo_url, plan, plan_status, trial_ends_at, is_founding_member)')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();

    const o = membresia?.organizations;
    if (!o) return;
    setOrg(o);

    // Las cifras que antes eran el Dashboard entero. La cabecera se
    // pinta en todas las pestañas, así que solo se cuenta: nunca se
    // traen las filas.
    //
    // Las candidaturas se cuentan por job_id y no por organización:
    // job_applications no tiene organization_id, cuelga de la oferta.
    const { data: ofertas } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('organization_id', o.id);

    const ids = (ofertas || []).map((j) => j.id);
    let candidaturas = 0;
    if (ids.length) {
      const { count } = await supabase
        .from('job_applications')
        .select('id', { count: 'exact', head: true })
        .in('job_id', ids);
      candidaturas = count || 0;
    }

    setCifras({
      ofertas: (ofertas || []).filter((j) => j.status === 'activa').length,
      candidaturas,
    });
  }

  const trial = org ? sidebarTrialLabel(org) : null;

  return (
    <div>
      <style>{`
        .gt-tal-cab { max-width: 1080px; margin: 0 auto; padding: 20px 20px 0; }
        /* Pastillas, como en Seguimiento: fondo lila y texto morado
           cuando está activa, sin línea inferior. */
        .gt-tal-tabs { display: flex; gap: 4px; margin-top: 16px; padding-bottom: 4px; }
        .gt-tal-cuerpo { max-width: 1080px; margin: 0 auto; padding: 20px; }
        @media (max-width: 720px) {
          .gt-tal-cab { padding: 16px 14px 0; }
          .gt-tal-cuerpo { padding: 16px 14px; }
          /* Las pestañas se desplazan en vez de partirse en dos líneas. */
            .gt-tal-tabs { gap: 4px; overflow-x: auto; scrollbar-width: none; }
          .gt-tal-tabs::-webkit-scrollbar { display: none; }
          .gt-tal-tabs a { white-space: nowrap; }
        }
      `}</style>

      <div className="gt-tal-cab">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: '#f0f0eb',
              border: `.5px solid ${BORDE}`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 14,
              fontWeight: 600,
              color: '#7a736b',
            }}
          >
            {org?.logo_url ? (
              <img src={org.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              (org?.name || '·').charAt(0).toUpperCase()
            )}
          </span>

          <div style={{ minWidth: 0, flex: 1 }}>
            {/* El nombre de la organización, no el del módulo: este es su
                espacio, y qué sección estás mirando ya lo dice la pestaña
                activa de abajo. */}
            <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.3 }}>{org?.name || '·'}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {org && planLabel(org)}
              {cifras && (
                <>
                  {' · '}
                  {cifras.ofertas} {cifras.ofertas === 1 ? 'oferta activa' : 'ofertas activas'}
                  {' · '}
                  {cifras.candidaturas}{' '}
                  {cifras.candidaturas === 1 ? 'candidatura' : 'candidaturas'}
                </>
              )}
            </div>
          </div>

          {/* El aviso de la prueba estaba en la lateral, junto a Plan.
              Sin lateral vive aquí, que es donde se ve siempre. */}
          {trial && (
            <Link
              href="/organizations/admin/plan"
              style={{
                fontSize: 11.5,
                background: '#f0eefe',
                color: '#3c3489',
                borderRadius: 20,
                padding: '4px 11px',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              {trial}
            </Link>
          )}

          {org?.slug && (
            <Link
              href={`/organizations/${org.slug}`}
              style={{ fontSize: 12, color: '#888', textDecoration: 'none', flexShrink: 0 }}
            >
              Ver como candidato →
            </Link>
          )}
        </div>

        <nav className="gt-tal-tabs" aria-label="Secciones de Talento">
          {PESTANAS.map((p) => {
            const on = pathname.startsWith(p.href);
            return (
              <Link
                key={p.href}
                href={p.href}
                aria-current={on ? 'page' : undefined}
                style={{
                  padding: '6px 12px',
                  borderRadius: 7,
                  fontSize: 12.5,
                  textDecoration: 'none',
                  background: on ? '#f0eefe' : 'transparent',
                  color: on ? '#6d5aef' : '#8b8780',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="gt-tal-cuerpo">{children}</div>
    </div>
  );
}
